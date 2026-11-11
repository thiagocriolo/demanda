// @ts-nocheck
import "dotenv/config";
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { rawRows } from "../../src/lib/server/db/database";
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
  workspaceMembers,
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
  const id = randomUUID();
  await database
    .insert(users)
    .values({
      id,
      name: label,
      username: `${label.toLowerCase()}_${suffix}`,
      email: `${label.toLowerCase()}-${suffix}@example.test`,
    });
  return { id, name: label, username: `${label.toLowerCase()}_${suffix}`, email: `${label.toLowerCase()}-${suffix}@example.test`, avatarUrl: null };
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
  const workspace = { id: randomUUID(), name: "BE14 principal", kind: "shared" as const, ownerUserId: owner.id, description: null, icon: null, color: null };
  const privateWorkspace = { id: randomUUID(), name: "BE14 privado", kind: "shared" as const, ownerUserId: outsider.id, description: null, icon: null, color: null };
  await transaction
    .insert(workspaces)
    .values([
      { id: workspace.id, name: workspace.name, kind: workspace.kind, ownerUserId: owner.id },
      { id: privateWorkspace.id, name: privateWorkspace.name, kind: privateWorkspace.kind, ownerUserId: outsider.id },
    ]);
  await transaction.insert(workspaceMembers).values([
    { workspaceId: workspace.id, userId: owner.id, role: "owner" },
    { workspaceId: privateWorkspace.id, userId: outsider.id, role: "owner" },
  ]);

  await transaction.insert(contacts).values([
    { workspaceId: workspace.id, ownerUserId: owner.id, name: "Farol Cliente" },
    {
      workspaceId: privateWorkspace.id,
      ownerUserId: outsider.id,
      name: "Farol Cliente Secreto",
    },
  ]);
  const business = { id: randomUUID() };
  const privateBusiness = { id: randomUUID() };
  await transaction
    .insert(businesses)
    .values([
      {
        id: business.id,
        workspaceId: workspace.id,
        ownerUserId: owner.id,
        name: "Farol Negócio",
        categoryKey: "cliente",
        stageKey: "ativo",
      },
      {
        id: privateBusiness.id,
        workspaceId: privateWorkspace.id,
        ownerUserId: outsider.id,
        name: "Farol Negócio Secreto",
        categoryKey: "cliente",
        stageKey: "ativo",
      },
    ]);
  const project = { id: randomUUID() };
  await transaction
    .insert(projects)
    .values({
      id: project.id,
      workspaceId: workspace.id,
      businessId: business.id,
      name: "Farol Projeto",
      statusKey: "execucao",
      endDate: "2026-07-10",
    });
  await transaction.insert(projects).values({
    workspaceId: privateWorkspace.id,
    businessId: privateBusiness.id,
    name: "Farol Projeto Secreto",
    statusKey: "execucao",
    endDate: "2026-07-10",
  });
  const task = { id: randomUUID() };
  await transaction
    .insert(tasks)
    .values({
      id: task.id,
      workspaceId: workspace.id,
      projectId: project.id,
      businessId: business.id,
      name: "Farol Tarefa",
      dueDate: "2026-07-12",
    });
  const subtask = { id: randomUUID() };
  await transaction
    .insert(taskSubtasks)
    .values({
      id: subtask.id,
      workspaceId: workspace.id,
      taskId: task.id,
      name: "Preparar entrega",
      durationMinutes: 90,
      sortOrder: 0,
    });
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
        select distinct index_name from information_schema.statistics
        where table_schema = database() and index_name in (
          'contacts_name_search_index', 'businesses_name_search_index',
          'projects_name_search_index', 'tasks_name_search_index',
          'projects_workspace_end_status_archive_index'
        )
      `);
      expect(rawRows(indexes)).toHaveLength(5);
      const plan = await transaction.execute(sql`
        explain
        select id from tasks
        where workspace_id = ${data.workspace.id}
          and archived_at is null
          and name like '%farol%'
      `);
      expect(rawRows(plan)).not.toHaveLength(0);
    }));
});

afterAll(async () => {
  await pool.end();
});
