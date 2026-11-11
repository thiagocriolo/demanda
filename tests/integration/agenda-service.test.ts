import "dotenv/config";
import { randomUUID } from "node:crypto";
import { and, asc, eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import type { AgendaMoveInput } from "../../src/lib/agenda/types";
import type { RequestAuthorizationContext } from "../../src/lib/server/authorization/workspace-context";
import { WorkspaceNotFoundError } from "../../src/lib/server/authorization/workspace-context";
import { parseServerEnvironment } from "../../src/lib/server/config/env-schema";
import {
  createDatabase,
  type Database,
} from "../../src/lib/server/db/database";
import { createDatabasePool } from "../../src/lib/server/db/pool";
import {
  agendaEntries,
  businesses,
  projects,
  tasks,
  taskSubtasks,
  users,
  workspaceMembers,
  workspaces,
  type WorkspaceRole,
} from "../../src/lib/server/db/schema";
import {
  AgendaVersionConflictError,
  getWorkspaceAgenda,
  moveWorkspaceAgenda,
} from "../../src/lib/server/agenda/service";

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
  const id = randomUUID();
  await database
    .insert(users)
    .values({
      id,
      name: label,
      username: `${label.toLowerCase()}_${suffix}`,
      email: `${label.toLowerCase()}-${suffix}@example.test`,
    });
  const [user] = await database.select().from(users).where(eq(users.id, id));
  if (!user) throw new Error("Usuario de teste nao criado.");
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

async function fixture(database: Database, label = "BE10") {
  const owner = await insertUser(database, `${label}Owner`);
  const member = await insertUser(database, `${label}Member`);
  const workspaceId = randomUUID();
  await database
    .insert(workspaces)
    .values({
      id: workspaceId,
      name: `${label} workspace`,
      kind: "shared",
      ownerUserId: owner.id,
    });
  const [workspace] = await database.select().from(workspaces).where(eq(workspaces.id, workspaceId));
  if (!workspace) throw new Error("Workspace nao criado.");
  await database.insert(workspaceMembers).values({
    workspaceId: workspace.id,
    userId: owner.id,
    role: "owner",
  });
  await database.insert(workspaceMembers).values({
    workspaceId: workspace.id,
    userId: member.id,
    role: "member",
  });
  const businessId = randomUUID();
  await database
    .insert(businesses)
    .values({
      id: businessId,
      workspaceId: workspace.id,
      ownerUserId: owner.id,
      name: `${label} negocio`,
      categoryKey: "cliente",
      stageKey: "ativo",
    });
  const [business] = await database.select().from(businesses).where(eq(businesses.id, businessId));
  if (!business) throw new Error("Negocio nao criado.");
  const projectIds = [randomUUID(), randomUUID()];
  await database
    .insert(projects)
    .values([
      {
        id: projectIds[0],
        workspaceId: workspace.id,
        businessId: business.id,
        name: `${label} Projeto A`,
        statusKey: "execucao",
        endDate: "2026-08-10",
      },
      {
        id: projectIds[1],
        workspaceId: workspace.id,
        businessId: business.id,
        name: `${label} Projeto B`,
        statusKey: "planejamento",
        endDate: "2026-08-11",
      },
    ]);
  const projectRows = await database.select().from(projects).where(and(eq(projects.id, projectIds[0]!), eq(projects.workspaceId, workspace.id))).orderBy(asc(projects.name));
  const taskId = randomUUID();
  await database
    .insert(tasks)
    .values({
      id: taskId,
      workspaceId: workspace.id,
      projectId: projectRows[0]!.id,
      businessId: business.id,
      name: `${label} Tarefa`,
      dueDate: "2026-08-12",
    });
  const [task] = await database.select().from(tasks).where(eq(tasks.id, taskId));
  if (!task) throw new Error("Tarefa nao criada.");
  await database.insert(taskSubtasks).values([
    {
      workspaceId: workspace.id,
      taskId: task.id,
      name: "Parte 1",
      durationMinutes: 60,
      sortOrder: 0,
    },
    {
      workspaceId: workspace.id,
      taskId: task.id,
      name: "Parte 2",
      durationMinutes: 90,
      sortOrder: 1,
    },
  ]);
  return {
    owner,
    member,
    workspace,
    projects: projectRows,
    task,
    ownerContext: context(owner, workspace, "owner"),
    memberContext: context(member, workspace, "member"),
  };
}

function movedProjects(
  snapshot: Awaited<ReturnType<typeof getWorkspaceAgenda>>,
  reverse = false,
): AgendaMoveInput {
  const ordered = reverse
    ? [...snapshot.projects].reverse()
    : snapshot.projects;
  return {
    mode: "projects",
    items: ordered.map((item, order) => ({
      ...item,
      date: "2026-09-01",
      order,
    })),
  };
}

describe("BE-10: Agenda persistente", () => {
  it("permite leitura de outro workspace vinculado e revalida o acesso", () =>
    withRollback(async (transaction) => {
      const active = await fixture(transaction, "ScopeA");
      const requested = await fixture(transaction, "ScopeB");
      await transaction.insert(workspaceMembers).values({
        workspaceId: requested.workspace.id,
        userId: active.owner.id,
        role: "member",
      });

      const snapshot = await getWorkspaceAgenda(
        transaction,
        active.ownerContext,
        { workspaceId: requested.workspace.id },
      );
      expect(snapshot.workspaceId).toBe(requested.workspace.id);
      expect(snapshot.tasks.map(({ id }) => id)).toEqual([requested.task.id]);
      await expect(
        getWorkspaceAgenda(transaction, requested.ownerContext, {
          workspaceId: active.workspace.id,
        }),
      ).rejects.toBeInstanceOf(WorkspaceNotFoundError);
    }));

  it("materializa projetos e tarefas reais com datas civis e duracao", () =>
    withRollback(async (transaction) => {
      const data = await fixture(transaction, "Projection");
      const snapshot = await getWorkspaceAgenda(transaction, data.ownerContext);
      expect(snapshot.projects.map(({ date }) => date)).toEqual([
        "2026-08-10",
        "2026-08-11",
      ]);
      expect(snapshot.tasks).toMatchObject([
        {
          id: data.task.id,
          date: "2026-08-12",
          durationMinutes: 150,
          order: 0,
        },
      ]);
      expect(await getWorkspaceAgenda(transaction, data.memberContext)).toEqual(
        snapshot,
      );
      await transaction
        .update(projects)
        .set({ archivedAt: new Date(), updatedAt: new Date() })
        .where(eq(projects.id, data.projects[0]!.id));
      const afterArchive = await getWorkspaceAgenda(
        transaction,
        data.ownerContext,
      );
      expect(afterArchive.projects).toHaveLength(1);
      const orphan = await transaction
        .select({ id: agendaEntries.id })
        .from(agendaEntries)
        .where(eq(agendaEntries.projectId, data.projects[0]!.id));
      expect(orphan).toEqual([]);
    }));

  it("grava mudanca de dia e reordenacao atomicamente e rejeita versao antiga", () =>
    withRollback(async (transaction) => {
      const data = await fixture(transaction, "Atomic");
      const initial = await getWorkspaceAgenda(transaction, data.ownerContext);
      const saved = await moveWorkspaceAgenda(
        transaction,
        data.ownerContext,
        movedProjects(initial, true),
      );
      expect(
        saved.projects.map(({ date, order }) => ({ date, order })),
      ).toEqual([
        { date: "2026-09-01", order: 0 },
        { date: "2026-09-01", order: 1 },
      ]);
      expect(await getWorkspaceAgenda(transaction, data.memberContext)).toEqual(
        saved,
      );
      await expect(
        moveWorkspaceAgenda(
          transaction,
          data.ownerContext,
          movedProjects(initial),
        ),
      ).rejects.toBeInstanceOf(AgendaVersionConflictError);

      const rows = await transaction
        .select({
          date: agendaEntries.scheduledDate,
          position: agendaEntries.position,
        })
        .from(agendaEntries)
        .where(
          and(
            eq(agendaEntries.workspaceId, data.workspace.id),
            eq(agendaEntries.entityKind, "project"),
          ),
        )
        .orderBy(asc(agendaEntries.position));
      expect(rows).toEqual([
        { date: "2026-09-01", position: 0 },
        { date: "2026-09-01", position: 1 },
      ]);

      const taskSnapshot = await moveWorkspaceAgenda(
        transaction,
        data.ownerContext,
        {
          mode: "tasks",
          items: initial.tasks.map((item) => ({
            ...item,
            date: null,
            order: 0,
          })),
        },
      );
      expect(taskSnapshot.tasks[0]?.date).toBeNull();
      const [storedTask] = await transaction
        .select({ dueDate: tasks.dueDate, version: tasks.version })
        .from(tasks)
        .where(eq(tasks.id, data.task.id));
      expect(storedTask).toMatchObject({ dueDate: null, version: 2 });
    }));

  it("serializa dois movimentos concorrentes sem duplicar posicoes", async () => {
    const data = await fixture(database, "Concurrent");
    try {
      const initial = await getWorkspaceAgenda(database, data.ownerContext);
      const results = await Promise.allSettled([
        moveWorkspaceAgenda(
          database,
          data.ownerContext,
          movedProjects(initial),
        ),
        moveWorkspaceAgenda(
          database,
          data.ownerContext,
          movedProjects(initial, true),
        ),
      ]);
      expect(
        results.filter(({ status }) => status === "fulfilled"),
      ).toHaveLength(1);
      const rejected = results.find(({ status }) => status === "rejected");
      expect(
        rejected?.status === "rejected" ? rejected.reason : null,
      ).toBeInstanceOf(AgendaVersionConflictError);
      const current = await getWorkspaceAgenda(database, data.ownerContext);
      expect(current.projects.map(({ order }) => order)).toEqual([0, 1]);
      expect(new Set(current.projects.map(({ order }) => order)).size).toBe(2);
    } finally {
      await database
        .delete(workspaces)
        .where(eq(workspaces.id, data.workspace.id));
      await database.delete(users).where(eq(users.id, data.owner.id));
      await database.delete(users).where(eq(users.id, data.member.id));
    }
  });
});

afterAll(async () => {
  await pool.end();
});
