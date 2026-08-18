import "dotenv/config";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import type { RequestAuthorizationContext } from "../../src/lib/server/authorization/workspace-context";
import { WorkspaceNotFoundError } from "../../src/lib/server/authorization/workspace-context";
import { parseServerEnvironment } from "../../src/lib/server/config/env-schema";
import {
  createDatabase,
  type Database,
} from "../../src/lib/server/db/database";
import { createDatabasePool } from "../../src/lib/server/db/pool";
import {
  businesses,
  cronogramaBlocks,
  projects,
  taskResponsibles,
  tasks,
  taskSubtasks,
  users,
  workspaceMembers,
  workspaces,
  type WorkspaceRole,
} from "../../src/lib/server/db/schema";
import {
  CronogramaRuleViolationError,
  CronogramaVersionConflictError,
  deleteCronogramaBlock,
  getWorkspaceCronograma,
  reorganizeCronogramaBlocks,
  saveCronogramaBlock,
} from "../../src/lib/server/cronograma/service";

const pool = createDatabasePool(parseServerEnvironment(process.env));
const database = createDatabase(pool);

class RollbackFixture extends Error {}

async function withRollback(
  run: (database: Database) => Promise<void>,
): Promise<void> {
  try {
    await database.transaction(async (transaction) => {
      await run(transaction as unknown as Database);
      throw new RollbackFixture();
    });
  } catch (cause) {
    if (cause instanceof RollbackFixture) return;
    throw cause;
  }
}

async function insertUser(database: Database, label: string) {
  const suffix = randomUUID().replaceAll("-", "").slice(0, 16);
  const [user] = await database
    .insert(users)
    .values({
      name: label,
      username: `${label.toLowerCase()}_${suffix}`,
      email: `${label.toLowerCase()}-${suffix}@example.test`,
    })
    .returning();
  if (!user) throw new Error("Usuário de teste não criado.");
  return user;
}

function context(
  user: typeof users.$inferSelect,
  workspace: typeof workspaces.$inferSelect,
  role: WorkspaceRole,
): RequestAuthorizationContext {
  const now = new Date();
  return {
    user: {
      id: user.id,
      username: user.username,
      name: user.name,
      email: user.email,
      avatarUrl: user.avatarUrl,
    },
    session: {
      id: randomUUID(),
      userId: user.id,
      activeWorkspaceId: workspace.id,
      remembered: false,
      createdAt: now,
      lastSeenAt: now,
      expiresAt: new Date(now.getTime() + 60_000),
    },
    activeWorkspace: {
      workspace: {
        id: workspace.id,
        name: workspace.name,
        description: workspace.description,
        icon: workspace.icon,
        color: workspace.color,
        kind: workspace.kind,
        ownerUserId: workspace.ownerUserId,
      },
      membership: { userId: user.id, role, joinedAt: now },
    },
  };
}

async function fixture(database: Database, label = "BE11") {
  const owner = await insertUser(database, `${label}Owner`);
  const observer = await insertUser(database, `${label}Observer`);
  const [workspace] = await database
    .insert(workspaces)
    .values({
      name: `${label} workspace`,
      kind: "shared",
      ownerUserId: owner.id,
    })
    .returning();
  if (!workspace) throw new Error("Workspace não criado.");
  await database.insert(workspaceMembers).values({
    workspaceId: workspace.id,
    userId: observer.id,
    role: "member",
  });
  const [business] = await database
    .insert(businesses)
    .values({
      workspaceId: workspace.id,
      ownerUserId: owner.id,
      name: `${label} negócio`,
      categoryKey: "cliente",
      stageKey: "ativo",
    })
    .returning();
  if (!business) throw new Error("Negócio não criado.");
  const [project] = await database
    .insert(projects)
    .values({
      workspaceId: workspace.id,
      businessId: business.id,
      name: `${label} projeto`,
      statusKey: "execucao",
    })
    .returning();
  if (!project) throw new Error("Projeto não criado.");
  const taskRows = await database
    .insert(tasks)
    .values([
      {
        workspaceId: workspace.id,
        projectId: project.id,
        businessId: business.id,
        name: `${label} tarefa A`,
      },
      {
        workspaceId: workspace.id,
        projectId: project.id,
        businessId: business.id,
        name: `${label} tarefa B`,
      },
    ])
    .returning();
  await database.insert(taskResponsibles).values(
    taskRows.map((task) => ({
      workspaceId: workspace.id,
      taskId: task.id,
      userId: owner.id,
    })),
  );
  const subtaskRows = await database
    .insert(taskSubtasks)
    .values([
      {
        workspaceId: workspace.id,
        taskId: taskRows[0]!.id,
        name: "A1",
        durationMinutes: 60,
        sortOrder: 0,
      },
      {
        workspaceId: workspace.id,
        taskId: taskRows[0]!.id,
        name: "A2",
        durationMinutes: 60,
        sortOrder: 1,
      },
      {
        workspaceId: workspace.id,
        taskId: taskRows[1]!.id,
        name: "B1",
        durationMinutes: 60,
        sortOrder: 0,
      },
    ])
    .returning();
  return {
    owner,
    observer,
    workspace,
    tasks: taskRows,
    subtasks: subtaskRows,
    ownerContext: context(owner, workspace, "owner"),
    observerContext: context(observer, workspace, "member"),
  };
}

const placement = (startMinutes: number, version = 0) => ({
  date: "2026-07-15",
  startMinutes,
  durationMinutes: 60,
  version,
});

describe("leitura do Cronograma por workspace", () => {
  it("permite workspace vinculado e revalida o acesso", () =>
    withRollback(async (transaction) => {
      const active = await fixture(transaction, "ScopeA");
      const requested = await fixture(transaction, "ScopeB");
      await transaction.insert(workspaceMembers).values({
        workspaceId: requested.workspace.id,
        userId: active.owner.id,
        role: "member",
      });

      const snapshot = await getWorkspaceCronograma(
        transaction,
        active.ownerContext,
        { workspaceId: requested.workspace.id },
      );
      expect(snapshot.workspaceId).toBe(requested.workspace.id);
      await expect(
        getWorkspaceCronograma(transaction, requested.ownerContext, {
          workspaceId: active.workspace.id,
        }),
      ).rejects.toBeInstanceOf(WorkspaceNotFoundError);
    }));
});

describe("BE-11: Cronograma persistente e regras de alocação", () => {
  it("reorganiza vários blocos atomicamente e incrementa suas versões", () =>
    withRollback(async (transaction) => {
      const data = await fixture(transaction, "Reorganization");
      const first = await saveCronogramaBlock(
        transaction,
        data.ownerContext,
        data.subtasks[0]!.id,
        placement(8 * 60),
      );
      const second = await saveCronogramaBlock(
        transaction,
        data.ownerContext,
        data.subtasks[1]!.id,
        placement(9 * 60),
      );

      const result = await reorganizeCronogramaBlocks(
        transaction,
        data.ownerContext,
        {
          workspaceId: data.workspace.id,
          blocks: [
            {
              subtaskId: data.subtasks[0]!.id,
              date: "2026-07-15",
              startMinutes: 10 * 60,
              durationMinutes: 60,
              version: first.items[0]!.version,
            },
            {
              subtaskId: data.subtasks[1]!.id,
              date: "2026-07-15",
              startMinutes: 11 * 60,
              durationMinutes: 60,
              version: second.items.find(
                ({ subtaskId }) => subtaskId === data.subtasks[1]!.id,
              )!.version,
            },
          ],
        },
      );

      expect(result.items).toMatchObject([
        { subtaskId: data.subtasks[0]!.id, startMinutes: 600, version: 2 },
        { subtaskId: data.subtasks[1]!.id, startMinutes: 660, version: 2 },
      ]);
    }));

  it("persiste blocos reais, respeita sequência e filtra intervalo/responsável", () =>
    withRollback(async (transaction) => {
      const data = await fixture(transaction, "Projection");
      await expect(
        saveCronogramaBlock(
          transaction,
          data.ownerContext,
          data.subtasks[1]!.id,
          placement(9 * 60),
        ),
      ).rejects.toBeInstanceOf(CronogramaRuleViolationError);

      const first = await saveCronogramaBlock(
        transaction,
        data.ownerContext,
        data.subtasks[0]!.id,
        placement(8 * 60),
      );
      expect(first.items).toMatchObject([
        {
          taskId: data.tasks[0]!.id,
          subtaskId: data.subtasks[0]!.id,
          responsibleUserIds: [data.owner.id],
          date: "2026-07-15",
          startMinutes: 480,
          durationMinutes: 60,
          version: 1,
        },
      ]);
      await saveCronogramaBlock(
        transaction,
        data.ownerContext,
        data.subtasks[1]!.id,
        placement(9 * 60),
      );

      const byOwner = await getWorkspaceCronograma(
        transaction,
        data.ownerContext,
        {
          from: "2026-07-15",
          to: "2026-07-15",
          responsibleUserId: data.owner.id,
        },
      );
      expect(byOwner.items).toHaveLength(2);
      const byObserver = await getWorkspaceCronograma(
        transaction,
        data.observerContext,
        { responsibleUserId: data.observer.id },
      );
      expect(byObserver.items).toEqual([]);
      await expect(
        saveCronogramaBlock(
          transaction,
          data.observerContext,
          data.subtasks[2]!.id,
          placement(10 * 60),
        ),
      ).rejects.toBeInstanceOf(CronogramaRuleViolationError);
      expect(
        (
          await getWorkspaceCronograma(transaction, data.ownerContext, {
            from: "2026-07-16",
          })
        ).items,
      ).toEqual([]);
    }));

  it("rejeita sobreposição, intervalo de almoço e versões antigas", () =>
    withRollback(async (transaction) => {
      const data = await fixture(transaction, "Rules");
      const first = await saveCronogramaBlock(
        transaction,
        data.ownerContext,
        data.subtasks[0]!.id,
        placement(8 * 60),
      );
      await expect(
        saveCronogramaBlock(
          transaction,
          data.ownerContext,
          data.subtasks[2]!.id,
          placement(8 * 60 + 30),
        ),
      ).rejects.toBeInstanceOf(CronogramaRuleViolationError);
      await expect(
        saveCronogramaBlock(
          transaction,
          data.ownerContext,
          data.subtasks[2]!.id,
          placement(12 * 60),
        ),
      ).rejects.toBeInstanceOf(CronogramaRuleViolationError);

      const firstVersion = first.items[0]!.version;
      const updated = await saveCronogramaBlock(
        transaction,
        data.ownerContext,
        data.subtasks[0]!.id,
        placement(9 * 60, firstVersion),
      );
      await expect(
        saveCronogramaBlock(
          transaction,
          data.ownerContext,
          data.subtasks[0]!.id,
          placement(10 * 60, firstVersion),
        ),
      ).rejects.toBeInstanceOf(CronogramaVersionConflictError);
      await expect(
        deleteCronogramaBlock(
          transaction,
          data.ownerContext,
          data.subtasks[0]!.id,
          { version: firstVersion },
        ),
      ).rejects.toBeInstanceOf(CronogramaVersionConflictError);
      await deleteCronogramaBlock(
        transaction,
        data.ownerContext,
        data.subtasks[0]!.id,
        { version: updated.items[0]!.version },
      );
      expect(
        (await getWorkspaceCronograma(transaction, data.ownerContext)).items,
      ).toEqual([]);
    }));

  it("rejeita sobreposição do mesmo usuário entre workspaces", () =>
    withRollback(async (transaction) => {
      const first = await fixture(transaction, "GlobalRulesA");
      const second = await fixture(transaction, "GlobalRulesB");
      await transaction.insert(workspaceMembers).values({
        workspaceId: second.workspace.id,
        userId: first.owner.id,
        role: "member",
      });
      await transaction
        .delete(taskResponsibles)
        .where(eq(taskResponsibles.taskId, second.tasks[0]!.id));
      await transaction.insert(taskResponsibles).values({
        workspaceId: second.workspace.id,
        taskId: second.tasks[0]!.id,
        userId: first.owner.id,
      });

      await saveCronogramaBlock(
        transaction,
        first.ownerContext,
        first.subtasks[0]!.id,
        placement(8 * 60),
      );
      await expect(
        saveCronogramaBlock(
          transaction,
          context(first.owner, second.workspace, "member"),
          second.subtasks[0]!.id,
          placement(8 * 60 + 30),
        ),
      ).rejects.toBeInstanceOf(CronogramaRuleViolationError);
    }));

  it("serializa gravações concorrentes e impede conflito proibido", async () => {
    const data = await fixture(database, "Concurrent");
    try {
      const results = await Promise.allSettled([
        saveCronogramaBlock(
          database,
          data.ownerContext,
          data.subtasks[0]!.id,
          placement(10 * 60),
        ),
        saveCronogramaBlock(
          database,
          data.ownerContext,
          data.subtasks[2]!.id,
          placement(10 * 60),
        ),
      ]);
      expect(
        results.filter(({ status }) => status === "fulfilled"),
      ).toHaveLength(1);
      const rejected = results.find(({ status }) => status === "rejected");
      expect(
        rejected?.status === "rejected" ? rejected.reason : null,
      ).toBeInstanceOf(CronogramaRuleViolationError);
      expect(
        (await getWorkspaceCronograma(database, data.ownerContext)).items,
      ).toHaveLength(1);
    } finally {
      await database
        .delete(workspaces)
        .where(eq(workspaces.id, data.workspace.id));
      await database.delete(users).where(eq(users.id, data.owner.id));
      await database.delete(users).where(eq(users.id, data.observer.id));
    }
  });

  it("mantém invariantes de duração e término também no banco", async () => {
    const data = await fixture(database, "Constraint");
    try {
      await database.insert(cronogramaBlocks).values({
        workspaceId: data.workspace.id,
        taskId: data.tasks[0]!.id,
        subtaskId: data.subtasks[0]!.id,
        scheduledDate: "2026-07-15",
        startMinutes: 480,
        durationMinutes: 60,
      });
      await expect(
        database.insert(cronogramaBlocks).values({
          workspaceId: data.workspace.id,
          taskId: data.tasks[1]!.id,
          subtaskId: data.subtasks[2]!.id,
          scheduledDate: "2026-07-15",
          startMinutes: 510,
          durationMinutes: 60,
        }),
      ).rejects.toMatchObject({
        cause: expect.objectContaining({
          constraint: "cronograma_blocks_responsible_no_overlap",
        }),
      });
      await database
        .delete(taskResponsibles)
        .where(eq(taskResponsibles.taskId, data.tasks[1]!.id));
      await database.insert(taskResponsibles).values({
        workspaceId: data.workspace.id,
        taskId: data.tasks[1]!.id,
        userId: data.observer.id,
      });
      await database.insert(cronogramaBlocks).values({
        workspaceId: data.workspace.id,
        taskId: data.tasks[1]!.id,
        subtaskId: data.subtasks[2]!.id,
        scheduledDate: "2026-07-15",
        startMinutes: 510,
        durationMinutes: 60,
      });
      await database
        .delete(taskResponsibles)
        .where(eq(taskResponsibles.taskId, data.tasks[1]!.id));
      await expect(
        database.insert(taskResponsibles).values({
          workspaceId: data.workspace.id,
          taskId: data.tasks[1]!.id,
          userId: data.owner.id,
        }),
      ).rejects.toMatchObject({
        cause: expect.objectContaining({
          constraint: "task_responsibles_cronograma_no_overlap",
        }),
      });
      await expect(
        database.insert(cronogramaBlocks).values({
          workspaceId: data.workspace.id,
          taskId: data.tasks[0]!.id,
          subtaskId: data.subtasks[1]!.id,
          scheduledDate: "2026-07-15",
          startMinutes: 1_410,
          durationMinutes: 60,
        }),
      ).rejects.toThrow();
    } finally {
      await database
        .delete(workspaces)
        .where(eq(workspaces.id, data.workspace.id));
      await database.delete(users).where(eq(users.id, data.owner.id));
      await database.delete(users).where(eq(users.id, data.observer.id));
    }
  });
});

afterAll(async () => {
  await pool.end();
});
