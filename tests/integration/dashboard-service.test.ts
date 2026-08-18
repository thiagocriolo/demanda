import "dotenv/config";
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
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
  contacts,
  cronogramaBlocks,
  projects,
  taskResponsibles,
  tasks,
  taskSubtasks,
  users,
  workspaces,
  type WorkspaceRole,
} from "../../src/lib/server/db/schema";
import {
  getDashboardSnapshot,
  searchWorkspace,
} from "../../src/lib/server/dashboard/service";

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
  const suffix = randomUUID().replaceAll("-", "").slice(0, 12);
  const [user] = await database
    .insert(users)
    .values({
      name: label,
      username: `${label.toLowerCase()}_${suffix}`,
      email: `${label.toLowerCase()}-${suffix}@example.test`,
    })
    .returning();
  if (!user) throw new Error("Usuário BE-14 não criado.");
  return user;
}

function context(
  user: typeof users.$inferSelect,
  workspace: typeof workspaces.$inferSelect,
  role: WorkspaceRole = "owner",
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

async function fixture(transaction: Database) {
  const owner = await insertUser(transaction, "Be14Owner");
  const outsider = await insertUser(transaction, "Be14Outsider");
  const [workspace, privateWorkspace] = await transaction
    .insert(workspaces)
    .values([
      { name: "BE14 principal", kind: "shared", ownerUserId: owner.id },
      { name: "BE14 privado", kind: "shared", ownerUserId: outsider.id },
    ])
    .returning();
  if (!workspace || !privateWorkspace) throw new Error("Workspace não criado.");

  await transaction.insert(contacts).values([
    { workspaceId: workspace.id, ownerUserId: owner.id, name: "Farol Cliente" },
    {
      workspaceId: privateWorkspace.id,
      ownerUserId: outsider.id,
      name: "Farol Cliente Secreto",
    },
  ]);
  const [business, privateBusiness] = await transaction
    .insert(businesses)
    .values([
      {
        workspaceId: workspace.id,
        ownerUserId: owner.id,
        name: "Farol Negócio",
        categoryKey: "cliente",
        stageKey: "ativo",
      },
      {
        workspaceId: privateWorkspace.id,
        ownerUserId: outsider.id,
        name: "Farol Negócio Secreto",
        categoryKey: "cliente",
        stageKey: "ativo",
      },
    ])
    .returning();
  if (!business || !privateBusiness) throw new Error("Negócio não criado.");
  const [project] = await transaction
    .insert(projects)
    .values({
      workspaceId: workspace.id,
      businessId: business.id,
      name: "Farol Projeto",
      statusKey: "execucao",
      endDate: "2026-07-10",
    })
    .returning();
  await transaction.insert(projects).values({
    workspaceId: privateWorkspace.id,
    businessId: privateBusiness.id,
    name: "Farol Projeto Secreto",
    statusKey: "execucao",
    endDate: "2026-07-10",
  });
  if (!project) throw new Error("Projeto não criado.");
  const [task] = await transaction
    .insert(tasks)
    .values({
      workspaceId: workspace.id,
      projectId: project.id,
      businessId: business.id,
      name: "Farol Tarefa",
      dueDate: "2026-07-12",
    })
    .returning();
  if (!task) throw new Error("Tarefa não criada.");
  const [subtask] = await transaction
    .insert(taskSubtasks)
    .values({
      workspaceId: workspace.id,
      taskId: task.id,
      name: "Preparar entrega",
      durationMinutes: 90,
      sortOrder: 0,
    })
    .returning();
  if (!subtask) throw new Error("Subtarefa não criada.");
  await transaction.insert(taskResponsibles).values({
    workspaceId: workspace.id,
    taskId: task.id,
    userId: owner.id,
  });
  await transaction.insert(cronogramaBlocks).values({
    workspaceId: workspace.id,
    taskId: task.id,
    subtaskId: subtask.id,
    scheduledDate: "2026-07-14",
    startMinutes: 540,
    durationMinutes: 90,
  });
  return { owner, outsider, workspace };
}

describe("BE-14 dashboard e busca globais", () => {
  it("agrega métricas, agenda e atividade somente do workspace autorizado", () =>
    withRollback(async (transaction) => {
      const data = await fixture(transaction);
      const snapshot = await getDashboardSnapshot(
        transaction,
        context(data.owner, data.workspace),
        { date: "2026-07-14", period: "week" },
      );
      expect(snapshot.workspaceId).toBe(data.workspace.id);
      expect(snapshot.metrics).toMatchObject({
        overdueTasks: 1,
        overdueProjects: 1,
        activeTasks: 1,
        activeProjects: 1,
        todayTasks: 1,
        periodTasks: 1,
        plannedMinutes: 90,
      });
      expect(snapshot.todaySchedule).toHaveLength(1);
      expect(snapshot.todaySchedule[0]?.title).toContain("Farol Tarefa");
      expect(
        snapshot.activities.some(({ target }) => target.includes("Secreto")),
      ).toBe(false);
      expect(snapshot.meta.queryMs).toBeGreaterThanOrEqual(0);

      await expect(
        getDashboardSnapshot(
          transaction,
          context(data.outsider, data.workspace),
          { date: "2026-07-14", period: "week" },
        ),
      ).rejects.toBeInstanceOf(WorkspaceNotFoundError);
    }));

  it("busca por escopo, pagina e mede o plano sem vazar outro workspace", () =>
    withRollback(async (transaction) => {
      const data = await fixture(transaction);
      const ownerContext = context(data.owner, data.workspace);
      const firstPage = await searchWorkspace(transaction, ownerContext, {
        query: "Farol",
        scope: "all",
        page: 1,
        pageSize: 5,
      });
      expect(firstPage.total).toBe(4);
      expect(
        firstPage.items.every(({ title }) => !title.includes("Secreto")),
      ).toBe(true);
      expect(firstPage.totalPages).toBe(1);
      expect(firstPage.meta.queryMs).toBeGreaterThanOrEqual(0);

      const scoped = await searchWorkspace(transaction, ownerContext, {
        query: "Farol",
        scope: "project",
        page: 1,
        pageSize: 5,
      });
      expect(scoped.items.map(({ kind }) => kind)).toEqual(["project"]);

      const indexes = await transaction.execute(sql`
        select indexname from pg_indexes
        where schemaname = 'app' and indexname in (
          'contacts_name_search_index', 'businesses_name_search_index',
          'projects_name_search_index', 'tasks_name_search_index',
          'projects_workspace_end_status_archive_index'
        )
      `);
      expect(indexes.rows).toHaveLength(5);
      const plan = await transaction.execute(sql`
        explain (analyze, buffers, format json)
        select id from app.tasks
        where workspace_id = ${data.workspace.id}
          and archived_at is null
          and to_tsvector('simple', lower(name)) @@ plainto_tsquery('simple', 'farol')
      `);
      const raw = plan.rows[0]?.["QUERY PLAN"] as
        { "Execution Time": number }[] | undefined;
      expect(raw?.[0]?.["Execution Time"]).toBeTypeOf("number");
      expect(raw?.[0]?.["Execution Time"] ?? Infinity).toBeLessThan(2_000);
    }));
});

afterAll(async () => {
  await pool.end();
});
