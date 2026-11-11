import "dotenv/config";
import { randomUUID } from "node:crypto";
import { and, count, eq, isNotNull } from "drizzle-orm";
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
  projects,
  tags,
  taskResponsibles,
  taskSubtasks,
  taskTags,
  users,
  workspaceMembers,
  workspaces,
  type WorkspaceRole,
} from "../../src/lib/server/db/schema";
import {
  archiveWorkspaceTask,
  createWorkspaceTask,
  getWorkspaceTask,
  listWorkspaceTasks,
  setWorkspaceSubtaskState,
  setWorkspaceTaskState,
  TaskArchivedError,
  TaskNotFoundError,
  TaskRelationsInvalidError,
  TaskStateConflictError,
  TaskSubtaskNotFoundError,
  TaskVersionConflictError,
  updateWorkspaceTaskBoard,
  updateWorkspaceTask,
} from "../../src/lib/server/tasks/service";
import type {
  Task,
  TaskCreateInput,
  TaskUpdateInput,
} from "../../src/lib/server/tasks/types";
import { taskListQuerySchema } from "../../src/lib/server/tasks/validation";

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

async function insertUser(
  database: Database,
  label: string,
): Promise<typeof users.$inferSelect> {
  const suffix = randomUUID().replaceAll("-", "").slice(0, 16);
  const key = label.toLowerCase().replace(/[^a-z0-9]+/g, "_");
  const id = randomUUID();
  await database
    .insert(users)
    .values({
      id,
      name: label,
      username: `${key}_${suffix}`,
      email: `${key}-${suffix}@example.test`,
    });
  const [user] = await database
    .select()
    .from(users)
    .where(eq(users.id, id));
  if (!user) throw new Error("Usuário de teste não criado.");
  return user;
}

async function insertWorkspace(
  database: Database,
  owner: typeof users.$inferSelect,
  name: string,
): Promise<typeof workspaces.$inferSelect> {
  const id = randomUUID();
  await database
    .insert(workspaces)
    .values({ id, name, kind: "shared", ownerUserId: owner.id });
  const [workspace] = await database
    .select()
    .from(workspaces)
    .where(eq(workspaces.id, id));
  if (!workspace) throw new Error("Workspace de teste não criado.");
  await insertMember(database, workspace.id, owner.id, "owner");
  return workspace;
}

async function insertMember(
  database: Database,
  workspaceId: string,
  userId: string,
  role: WorkspaceRole = "member",
): Promise<void> {
  await database.insert(workspaceMembers).values({ workspaceId, userId, role });
}

async function insertBusiness(
  database: Database,
  workspaceId: string,
  name: string,
  ownerUserId?: string,
): Promise<typeof businesses.$inferSelect> {
  const [workspace] = await database
    .select({ ownerUserId: workspaces.ownerUserId })
    .from(workspaces)
    .where(eq(workspaces.id, workspaceId))
    .limit(1);
  const resolvedOwnerUserId = ownerUserId ?? workspace?.ownerUserId;
  if (!resolvedOwnerUserId) throw new Error("Owner do negocio nao encontrado.");
  const id = randomUUID();
  await database
    .insert(businesses)
    .values({
      id,
      workspaceId,
      ownerUserId: resolvedOwnerUserId,
      name,
      categoryKey: "cliente",
      stageKey: "ativo",
    });
  const [business] = await database
    .select()
    .from(businesses)
    .where(eq(businesses.id, id));
  if (!business) throw new Error("Negócio de teste não criado.");
  return business;
}

async function insertProject(
  database: Database,
  workspaceId: string,
  businessId: string,
  name: string,
): Promise<typeof projects.$inferSelect> {
  const id = randomUUID();
  await database
    .insert(projects)
    .values({
      id,
      workspaceId,
      businessId,
      name,
      statusKey: "execucao",
      briefing: "Projeto para tarefas",
      startDate: "2026-08-01",
      endDate: "2026-09-30",
    });
  const [project] = await database
    .select()
    .from(projects)
    .where(eq(projects.id, id));
  if (!project) throw new Error("Projeto de teste não criado.");
  return project;
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

function taskInput(
  projectId: string,
  responsibleUserIds: string[],
  overrides: Partial<TaskCreateInput> = {},
): TaskCreateInput {
  return {
    name: "Campanha de lançamento",
    projectId,
    category: "criacao",
    priority: "alta",
    status: "producao",
    briefing: "Produzir as peças da campanha.",
    dueDate: "2026-08-31",
    tagLabels: ["Campanha", "Digital"],
    responsibleUserIds,
    subtasks: [
      {
        name: "Criar roteiro",
        durationMinutes: 90,
        status: "pendente",
      },
      {
        name: "Produzir peças",
        durationMinutes: 180,
        status: "pendente",
      },
    ],
    sortOrder: 4,
    boardOrder: {},
    ...overrides,
  };
}

function updateInput(
  task: Task,
  overrides: Partial<TaskUpdateInput> = {},
): TaskUpdateInput {
  return {
    version: task.version,
    status: task.status,
    name: task.name,
    projectId: task.project.id,
    category: task.category,
    priority: task.priority,
    briefing: task.briefing,
    dueDate: task.dueDate,
    tagLabels: task.tags.map(({ name }) => name),
    responsibleUserIds: task.responsibles.map(({ userId }) => userId),
    subtasks: task.subtasks.map((subtask) => ({
      id: subtask.id,
      name: subtask.name,
      durationMinutes: subtask.durationMinutes,
      status: subtask.status,
    })),
    sortOrder: task.sortOrder,
    boardOrder: task.boardOrder,
    ...overrides,
  };
}

describe("BE-08: serviço de tarefas e subtarefas", () => {
  afterAll(() => pool.end());

  it("compartilha CRUD, relações, busca, filtros e sincronização do agregado", async () => {
    await withRollback(async (database) => {
      const owner = await insertUser(database, "Owner CRUD");
      const member = await insertUser(database, "Member CRUD");
      const workspace = await insertWorkspace(database, owner, "Tarefas CRUD");
      await insertMember(database, workspace.id, member.id);
      const business = await insertBusiness(
        database,
        workspace.id,
        "Cliente Aurora",
      );
      const project = await insertProject(
        database,
        workspace.id,
        business.id,
        "Lançamento Aurora",
      );
      const ownerContext = context(owner, workspace, "owner");
      const memberContext = context(member, workspace, "member");

      const created = await createWorkspaceTask(
        database,
        ownerContext,
        taskInput(project.id, [owner.id]),
      );
      expect(created).toMatchObject({
        workspaceId: workspace.id,
        business: { id: business.id, name: "Cliente Aurora" },
        project: { id: project.id, name: "Lançamento Aurora" },
        category: "criacao",
        priority: "alta",
        status: "producao",
        durationMinutes: 270,
        sortOrder: 4,
        boardOrder: {},
        version: 1,
        completedAt: null,
        archivedAt: null,
      });
      expect(created.tags.map(({ name }) => name)).toEqual([
        "Campanha",
        "Digital",
      ]);
      expect(created.responsibles.map(({ userId }) => userId)).toEqual([
        owner.id,
      ]);
      expect(created.subtasks).toHaveLength(2);

      const shared = await getWorkspaceTask(
        database,
        memberContext,
        created.id,
      );
      expect(shared).toEqual(created);

      const listed = await listWorkspaceTasks(
        database,
        memberContext,
        taskListQuerySchema.parse({
          query: "roteiro",
          projectId: project.id,
          businessId: business.id,
          responsibleUserId: owner.id,
          status: "producao",
          priority: "alta",
          dueFrom: "2026-08-01",
          dueTo: "2026-08-31",
        }),
      );
      expect(listed.items.map(({ id }) => id)).toEqual([created.id]);
      expect(listed.facets).toMatchObject({
        all: 1,
        archived: 0,
        statuses: { producao: 1 },
        priorities: { alta: 1 },
        projects: { [project.id]: 1 },
      });

      const firstSubtask = created.subtasks[0]!;
      const updated = await updateWorkspaceTask(
        database,
        memberContext,
        created.id,
        updateInput(created, {
          name: "Campanha atualizada",
          priority: "urgente",
          tagLabels: ["Campanha", "Performance"],
          responsibleUserIds: [member.id],
          subtasks: [
            {
              id: firstSubtask.id,
              name: "Roteiro aprovado",
              durationMinutes: 120,
              status: "concluida",
            },
            {
              name: "Programar mídia",
              durationMinutes: 60,
              status: "pendente",
            },
          ],
        }),
      );
      expect(updated).toMatchObject({
        name: "Campanha atualizada",
        priority: "urgente",
        durationMinutes: 180,
        version: 2,
        boardOrder: {},
      });
      expect(updated.status).toBe("producao");
      expect(updated.tags.map(({ name }) => name)).toEqual([
        "Campanha",
        "Performance",
      ]);
      expect(updated.responsibles.map(({ userId }) => userId)).toEqual([
        member.id,
      ]);
      expect(
        updated.subtasks.map(({ name, status }) => ({ name, status })),
      ).toEqual([
        { name: "Roteiro aprovado", status: "concluida" },
        { name: "Programar mídia", status: "pendente" },
      ]);

      await expect(
        updateWorkspaceTask(
          database,
          memberContext,
          created.id,
          updateInput(created, {
            name: "Atualização concorrente perdida",
            tagLabels: ["Não persistir"],
          }),
        ),
      ).rejects.toBeInstanceOf(TaskVersionConflictError);
      expect(
        await getWorkspaceTask(database, memberContext, created.id),
      ).toEqual(updated);
      const [rolledBackTag] = await database
        .select({ value: count() })
        .from(tags)
        .where(
          and(
            eq(tags.workspaceId, workspace.id),
            eq(tags.key, "nao_persistir"),
          ),
        );
      expect(rolledBackTag?.value).toBe(0);

      const [subtaskCount] = await database
        .select({ all: count(), archived: count(taskSubtasks.archivedAt) })
        .from(taskSubtasks)
        .where(
          and(
            eq(taskSubtasks.workspaceId, workspace.id),
            eq(taskSubtasks.taskId, created.id),
          ),
        );
      expect(subtaskCount).toEqual({ all: 3, archived: 1 });
      const [tagCount] = await database
        .select({ value: count() })
        .from(taskTags)
        .where(
          and(
            eq(taskTags.workspaceId, workspace.id),
            eq(taskTags.taskId, created.id),
          ),
        );
      const [responsibleCount] = await database
        .select({ value: count() })
        .from(taskResponsibles)
        .where(
          and(
            eq(taskResponsibles.workspaceId, workspace.id),
            eq(taskResponsibles.taskId, created.id),
          ),
        );
      expect(tagCount?.value).toBe(2);
      expect(responsibleCount?.value).toBe(1);
    });
  });

  it("conclui e reabre todo o agregado com um único bump e rollback atômico", async () => {
    await withRollback(async (database) => {
      const owner = await insertUser(database, "Owner Agregado");
      const workspace = await insertWorkspace(database, owner, "Agregado");
      const business = await insertBusiness(database, workspace.id, "Cliente");
      const project = await insertProject(
        database,
        workspace.id,
        business.id,
        "Projeto Agregado",
      );
      const ownerContext = context(owner, workspace, "owner");
      const created = await createWorkspaceTask(
        database,
        ownerContext,
        taskInput(project.id, [owner.id]),
      );

      const completed = await updateWorkspaceTask(
        database,
        ownerContext,
        created.id,
        updateInput(created, {
          status: "conclusao",
          name: "Campanha entregue",
          briefing: "Conteúdo e subtarefas concluídos no mesmo agregado.",
          tagLabels: ["Finalizada"],
          subtasks: created.subtasks.map((subtask) => ({
            id: subtask.id,
            name: `${subtask.name} aprovada`,
            durationMinutes: subtask.durationMinutes,
            status: "concluida",
          })),
        }),
      );
      expect(completed).toMatchObject({
        name: "Campanha entregue",
        status: "conclusao",
        version: created.version + 1,
      });
      expect(completed.completedAt).not.toBeNull();
      expect(completed.tags.map(({ name }) => name)).toEqual(["Finalizada"]);
      expect(
        completed.subtasks.every(({ status }) => status === "concluida"),
      ).toBe(true);

      const reopened = await updateWorkspaceTask(
        database,
        ownerContext,
        created.id,
        updateInput(completed, {
          status: "producao",
          name: "Campanha reaberta",
          subtasks: completed.subtasks.map((subtask, index) => ({
            id: subtask.id,
            name: subtask.name,
            durationMinutes: subtask.durationMinutes,
            status: index === 0 ? "pendente" : "concluida",
          })),
        }),
      );
      expect(reopened).toMatchObject({
        name: "Campanha reaberta",
        status: "producao",
        version: completed.version + 1,
        completedAt: null,
      });
      expect(reopened.subtasks[0]?.status).toBe("pendente");

      await expect(
        updateWorkspaceTask(
          database,
          ownerContext,
          created.id,
          updateInput(reopened, {
            status: "conclusao",
            name: "Não persistir",
            priority: "baixa",
            tagLabels: ["Não Persistir"],
          }),
        ),
      ).rejects.toBeInstanceOf(TaskStateConflictError);
      expect(
        await getWorkspaceTask(database, ownerContext, created.id),
      ).toEqual(reopened);
      const [rolledBackTag] = await database
        .select({ value: count() })
        .from(tags)
        .where(
          and(
            eq(tags.workspaceId, workspace.id),
            eq(tags.key, "nao_persistir"),
          ),
        );
      expect(rolledBackTag?.value).toBe(0);
    });
  });

  it("reserva posições para o batch e limpa ordens ao mudar dimensões", async () => {
    await withRollback(async (database) => {
      const owner = await insertUser(database, "Owner Ordem Agregada");
      const workspace = await insertWorkspace(
        database,
        owner,
        "Ordem Agregada",
      );
      const businessA = await insertBusiness(database, workspace.id, "A");
      const businessB = await insertBusiness(database, workspace.id, "B");
      const projectA = await insertProject(
        database,
        workspace.id,
        businessA.id,
        "Projeto A",
      );
      const projectB = await insertProject(
        database,
        workspace.id,
        businessB.id,
        "Projeto B",
      );
      const ownerContext = context(owner, workspace, "owner");

      await expect(
        createWorkspaceTask(
          database,
          ownerContext,
          taskInput(projectA.id, [owner.id], {
            name: "Não criar com ordem",
            boardOrder: { status: 0 },
          }),
        ),
      ).rejects.toBeInstanceOf(TaskRelationsInvalidError);

      const created = await createWorkspaceTask(
        database,
        ownerContext,
        taskInput(projectA.id, [owner.id]),
      );
      const statusPositioned = (
        await updateWorkspaceTaskBoard(database, ownerContext, {
          view: "status",
          updates: [
            {
              id: created.id,
              version: created.version,
              position: 4,
              columnKey: created.status,
            },
          ],
        })
      ).items[0]!;
      const priorityPositioned = (
        await updateWorkspaceTaskBoard(database, ownerContext, {
          view: "priority",
          updates: [
            {
              id: statusPositioned.id,
              version: statusPositioned.version,
              position: 3,
              columnKey: statusPositioned.priority,
            },
          ],
        })
      ).items[0]!;
      const projectPositioned = (
        await updateWorkspaceTaskBoard(database, ownerContext, {
          view: "project",
          updates: [
            {
              id: priorityPositioned.id,
              version: priorityPositioned.version,
              position: 2,
              columnKey: projectA.id,
            },
          ],
        })
      ).items[0]!;
      const positioned = (
        await updateWorkspaceTaskBoard(database, ownerContext, {
          view: "business",
          updates: [
            {
              id: projectPositioned.id,
              version: projectPositioned.version,
              position: 1,
              columnKey: businessA.id,
            },
          ],
        })
      ).items[0]!;
      expect(positioned.boardOrder).toEqual({
        status: 4,
        priority: 3,
        project: 2,
        business: 1,
      });

      const movedByBoard = (
        await updateWorkspaceTaskBoard(database, ownerContext, {
          view: "project",
          updates: [
            {
              id: positioned.id,
              version: positioned.version,
              position: 5,
              columnKey: projectB.id,
            },
          ],
        })
      ).items[0]!;
      expect(movedByBoard).toMatchObject({
        project: { id: projectB.id },
        business: { id: businessB.id },
        boardOrder: { status: 4, priority: 3, project: 5 },
      });
      expect(movedByBoard.boardOrder).not.toHaveProperty("business");

      await expect(
        updateWorkspaceTask(
          database,
          ownerContext,
          movedByBoard.id,
          updateInput(movedByBoard, {
            boardOrder: { ...movedByBoard.boardOrder, status: 99 },
          }),
        ),
      ).rejects.toBeInstanceOf(TaskRelationsInvalidError);
      expect(
        await getWorkspaceTask(database, ownerContext, movedByBoard.id),
      ).toEqual(movedByBoard);

      const changedStatus = await updateWorkspaceTask(
        database,
        ownerContext,
        movedByBoard.id,
        updateInput(movedByBoard, { status: "revisao" }),
      );
      expect(changedStatus.boardOrder).toEqual({
        priority: 3,
        project: 5,
      });

      const changedRelation = await updateWorkspaceTask(
        database,
        ownerContext,
        changedStatus.id,
        updateInput(changedStatus, {
          priority: "urgente",
          projectId: projectA.id,
        }),
      );
      expect(changedRelation).toMatchObject({
        priority: "urgente",
        project: { id: projectA.id },
        business: { id: businessA.id },
        boardOrder: {},
      });

      const statePositioned = (
        await updateWorkspaceTaskBoard(database, ownerContext, {
          view: "status",
          updates: [
            {
              id: changedRelation.id,
              version: changedRelation.version,
              position: 6,
              columnKey: changedRelation.status,
            },
          ],
        })
      ).items[0]!;
      const changedByStateEndpoint = await setWorkspaceTaskState(
        database,
        ownerContext,
        statePositioned.id,
        { version: statePositioned.version, status: "fila" },
      );
      expect(changedByStateEndpoint.boardOrder).toEqual({});
    });
  });

  it("atualiza o board em lote nas quatro visões e deriva o negócio do projeto", async () => {
    await withRollback(async (database) => {
      const owner = await insertUser(database, "Owner Board");
      const workspace = await insertWorkspace(database, owner, "Board");
      const businessA = await insertBusiness(database, workspace.id, "A");
      const businessB = await insertBusiness(database, workspace.id, "B");
      const projectA = await insertProject(
        database,
        workspace.id,
        businessA.id,
        "Projeto A",
      );
      const projectB = await insertProject(
        database,
        workspace.id,
        businessB.id,
        "Projeto B",
      );
      const ownerContext = context(owner, workspace, "owner");
      const first = await createWorkspaceTask(
        database,
        ownerContext,
        taskInput(projectA.id, [owner.id], {
          name: "Primeira",
          subtasks: [
            {
              name: "Pronta",
              durationMinutes: 60,
              status: "concluida",
            },
          ],
        }),
      );
      const second = await createWorkspaceTask(
        database,
        ownerContext,
        taskInput(projectA.id, [owner.id], {
          name: "Segunda",
        }),
      );

      const statusResult = await updateWorkspaceTaskBoard(
        database,
        ownerContext,
        {
          view: "status",
          updates: [
            {
              id: first.id,
              version: first.version,
              position: 0,
              columnKey: "conclusao",
            },
            {
              id: second.id,
              version: second.version,
              position: 1,
              columnKey: "revisao",
            },
          ],
        },
      );
      expect(statusResult).toMatchObject({
        workspaceId: workspace.id,
        view: "status",
      });
      expect(statusResult.items.map(({ id }) => id)).toEqual([
        first.id,
        second.id,
      ]);
      const statusFirst = statusResult.items[0]!;
      const statusSecond = statusResult.items[1]!;
      expect(statusFirst).toMatchObject({
        status: "conclusao",
        version: 2,
        boardOrder: { status: 0 },
      });
      expect(statusFirst.completedAt).not.toBeNull();
      expect(statusSecond).toMatchObject({
        status: "revisao",
        version: 2,
        boardOrder: { status: 1 },
      });

      const projectResult = await updateWorkspaceTaskBoard(
        database,
        ownerContext,
        {
          view: "project",
          updates: [
            {
              id: statusFirst.id,
              version: statusFirst.version,
              position: 3,
              columnKey: projectB.id,
            },
            {
              id: statusSecond.id,
              version: statusSecond.version,
              position: 4,
              columnKey: projectA.id,
            },
          ],
        },
      );
      const projectFirst = projectResult.items[0]!;
      const projectSecond = projectResult.items[1]!;
      expect(projectFirst).toMatchObject({
        project: { id: projectB.id },
        business: { id: businessB.id },
        version: 3,
        boardOrder: { status: 0, project: 3 },
      });
      expect(projectSecond).toMatchObject({
        project: { id: projectA.id },
        business: { id: businessA.id },
        version: 3,
        boardOrder: { status: 1, project: 4 },
      });

      const businessResult = await updateWorkspaceTaskBoard(
        database,
        ownerContext,
        {
          view: "business",
          updates: [
            {
              id: projectFirst.id,
              version: projectFirst.version,
              position: 1,
              columnKey: businessB.id,
            },
            {
              id: projectSecond.id,
              version: projectSecond.version,
              position: 2,
              columnKey: businessA.id,
            },
          ],
        },
      );
      const businessFirst = businessResult.items[0]!;
      const businessSecond = businessResult.items[1]!;
      expect(businessFirst).toMatchObject({
        project: { id: projectB.id },
        business: { id: businessB.id },
        version: 4,
        boardOrder: { status: 0, business: 1, project: 3 },
      });
      expect(businessSecond).toMatchObject({
        project: { id: projectA.id },
        business: { id: businessA.id },
        version: 4,
        boardOrder: { status: 1, business: 2, project: 4 },
      });

      const priorityResult = await updateWorkspaceTaskBoard(
        database,
        ownerContext,
        {
          view: "priority",
          updates: [
            {
              id: businessFirst.id,
              version: businessFirst.version,
              position: 9,
              columnKey: "urgente",
            },
            {
              id: businessSecond.id,
              version: businessSecond.version,
              position: 10,
              columnKey: "baixa",
            },
          ],
        },
      );
      expect(priorityResult.items[0]).toMatchObject({
        priority: "urgente",
        version: 5,
        boardOrder: { status: 0, priority: 9, business: 1, project: 3 },
      });
      expect(priorityResult.items[1]).toMatchObject({
        priority: "baixa",
        version: 5,
        boardOrder: { status: 1, priority: 10, business: 2, project: 4 },
      });
    });
  });

  it("reverte o lote inteiro em conflito de versão, relação ou estado", async () => {
    await withRollback(async (database) => {
      const owner = await insertUser(database, "Owner Rollback Board");
      const workspace = await insertWorkspace(
        database,
        owner,
        "Rollback Board",
      );
      const businessA = await insertBusiness(database, workspace.id, "A");
      const businessB = await insertBusiness(database, workspace.id, "B");
      const projectA = await insertProject(
        database,
        workspace.id,
        businessA.id,
        "Projeto A",
      );
      const projectB = await insertProject(
        database,
        workspace.id,
        businessB.id,
        "Projeto B",
      );
      const ownerContext = context(owner, workspace, "owner");
      const first = await createWorkspaceTask(
        database,
        ownerContext,
        taskInput(projectA.id, [owner.id], { name: "Primeira" }),
      );
      const second = await createWorkspaceTask(
        database,
        ownerContext,
        taskInput(projectA.id, [owner.id], { name: "Segunda" }),
      );

      await expect(
        updateWorkspaceTaskBoard(database, ownerContext, {
          view: "priority",
          updates: [
            {
              id: first.id,
              version: first.version,
              position: 0,
              columnKey: "urgente",
            },
            {
              id: second.id,
              version: second.version + 1,
              position: 1,
              columnKey: "baixa",
            },
          ],
        }),
      ).rejects.toBeInstanceOf(TaskVersionConflictError);
      expect(await getWorkspaceTask(database, ownerContext, first.id)).toEqual(
        first,
      );
      expect(await getWorkspaceTask(database, ownerContext, second.id)).toEqual(
        second,
      );

      await expect(
        updateWorkspaceTaskBoard(database, ownerContext, {
          view: "project",
          updates: [
            {
              id: first.id,
              version: first.version,
              position: 0,
              columnKey: projectB.id,
            },
            {
              id: second.id,
              version: second.version,
              position: 1,
              columnKey: randomUUID(),
            },
          ],
        }),
      ).rejects.toBeInstanceOf(TaskRelationsInvalidError);
      expect(await getWorkspaceTask(database, ownerContext, first.id)).toEqual(
        first,
      );
      expect(await getWorkspaceTask(database, ownerContext, second.id)).toEqual(
        second,
      );

      await expect(
        updateWorkspaceTaskBoard(database, ownerContext, {
          view: "business",
          updates: [
            {
              id: first.id,
              version: first.version,
              position: 0,
              columnKey: businessB.id,
            },
          ],
        }),
      ).rejects.toBeInstanceOf(TaskRelationsInvalidError);
      expect(await getWorkspaceTask(database, ownerContext, first.id)).toEqual(
        first,
      );

      await expect(
        updateWorkspaceTaskBoard(database, ownerContext, {
          view: "status",
          updates: [
            {
              id: first.id,
              version: first.version,
              position: 0,
              columnKey: "revisao",
            },
            {
              id: second.id,
              version: second.version,
              position: 1,
              columnKey: "conclusao",
            },
          ],
        }),
      ).rejects.toBeInstanceOf(TaskStateConflictError);
      expect(await getWorkspaceTask(database, ownerContext, first.id)).toEqual(
        first,
      );
      expect(await getWorkspaceTask(database, ownerContext, second.id)).toEqual(
        second,
      );
    });
  });

  it("aplica conclusão e reabertura explícitas com retry idempotente", async () => {
    await withRollback(async (database) => {
      const owner = await insertUser(database, "Owner Estado");
      const workspace = await insertWorkspace(database, owner, "Estado");
      const business = await insertBusiness(database, workspace.id, "Cliente");
      const project = await insertProject(
        database,
        workspace.id,
        business.id,
        "Projeto Estado",
      );
      const ownerContext = context(owner, workspace, "owner");
      const created = await createWorkspaceTask(
        database,
        ownerContext,
        taskInput(project.id, [owner.id]),
      );

      await expect(
        setWorkspaceTaskState(database, ownerContext, created.id, {
          version: 1,
          status: "conclusao",
        }),
      ).rejects.toBeInstanceOf(TaskStateConflictError);

      const first = await setWorkspaceSubtaskState(
        database,
        ownerContext,
        created.id,
        created.subtasks[0]!.id,
        { version: 1, status: "concluida" },
      );
      expect(first.version).toBe(2);
      expect(first.subtasks[0]?.status).toBe("concluida");

      const repeatedFirst = await setWorkspaceSubtaskState(
        database,
        ownerContext,
        created.id,
        created.subtasks[0]!.id,
        { version: 1, status: "concluida" },
      );
      expect(repeatedFirst.version).toBe(2);

      await expect(
        setWorkspaceSubtaskState(
          database,
          ownerContext,
          created.id,
          created.subtasks[0]!.id,
          { version: 1, status: "pendente" },
        ),
      ).rejects.toBeInstanceOf(TaskVersionConflictError);

      const second = await setWorkspaceSubtaskState(
        database,
        ownerContext,
        created.id,
        created.subtasks[1]!.id,
        { version: 2, status: "concluida" },
      );
      expect(second.version).toBe(3);

      const completed = await setWorkspaceTaskState(
        database,
        ownerContext,
        created.id,
        { version: 3, status: "conclusao" },
      );
      expect(completed).toMatchObject({ status: "conclusao", version: 4 });
      expect(completed.completedAt).not.toBeNull();

      const repeatedCompletion = await setWorkspaceTaskState(
        database,
        ownerContext,
        created.id,
        { version: 3, status: "conclusao" },
      );
      expect(repeatedCompletion.version).toBe(4);

      await expect(
        setWorkspaceSubtaskState(
          database,
          ownerContext,
          created.id,
          created.subtasks[0]!.id,
          { version: 4, status: "pendente" },
        ),
      ).rejects.toBeInstanceOf(TaskStateConflictError);
      await expect(
        updateWorkspaceTask(
          database,
          ownerContext,
          created.id,
          updateInput(completed, {
            subtasks: completed.subtasks.map((subtask, index) => ({
              id: subtask.id,
              name: subtask.name,
              durationMinutes: subtask.durationMinutes,
              status: index === 0 ? "pendente" : subtask.status,
            })),
          }),
        ),
      ).rejects.toBeInstanceOf(TaskStateConflictError);

      const reopenedTask = await setWorkspaceTaskState(
        database,
        ownerContext,
        created.id,
        { version: 4, status: "producao" },
      );
      expect(reopenedTask).toMatchObject({ status: "producao", version: 5 });
      expect(reopenedTask.completedAt).toBeNull();

      const reopenedSubtask = await setWorkspaceSubtaskState(
        database,
        ownerContext,
        created.id,
        created.subtasks[0]!.id,
        { version: 5, status: "pendente" },
      );
      expect(reopenedSubtask.version).toBe(6);
      await expect(
        setWorkspaceTaskState(database, ownerContext, created.id, {
          version: 5,
          status: "fila",
        }),
      ).rejects.toBeInstanceOf(TaskVersionConflictError);
    });
  });

  it("arquiva com versão, retorna o agregado e mantém retry idempotente", async () => {
    await withRollback(async (database) => {
      const owner = await insertUser(database, "Owner Arquivo");
      const workspace = await insertWorkspace(database, owner, "Arquivo");
      const business = await insertBusiness(database, workspace.id, "Cliente");
      const project = await insertProject(
        database,
        workspace.id,
        business.id,
        "Projeto Arquivo",
      );
      const ownerContext = context(owner, workspace, "owner");
      const created = await createWorkspaceTask(
        database,
        ownerContext,
        taskInput(project.id, [owner.id]),
      );

      await expect(
        archiveWorkspaceTask(database, ownerContext, created.id, 2),
      ).rejects.toBeInstanceOf(TaskVersionConflictError);
      const archived = await archiveWorkspaceTask(
        database,
        ownerContext,
        created.id,
        1,
      );
      expect(archived.version).toBe(2);
      expect(archived.archivedAt).not.toBeNull();

      const repeated = await archiveWorkspaceTask(
        database,
        ownerContext,
        created.id,
        1,
      );
      expect(repeated).toEqual(archived);
      await expect(
        updateWorkspaceTask(
          database,
          ownerContext,
          created.id,
          updateInput(archived),
        ),
      ).rejects.toBeInstanceOf(TaskArchivedError);
      await expect(
        setWorkspaceTaskState(database, ownerContext, created.id, {
          version: archived.version,
          status: "fila",
        }),
      ).rejects.toBeInstanceOf(TaskArchivedError);

      const onlyArchived = await listWorkspaceTasks(
        database,
        ownerContext,
        taskListQuerySchema.parse({ archived: "only" }),
      );
      expect(onlyArchived.items.map(({ id }) => id)).toEqual([created.id]);
    });
  });

  it("uniformiza anti-IDOR e rejeita relações de outro workspace", async () => {
    await withRollback(async (database) => {
      const ownerA = await insertUser(database, "Owner A Tarefa");
      const memberA = await insertUser(database, "Member A Tarefa");
      const ownerB = await insertUser(database, "Owner B Tarefa");
      const workspaceA = await insertWorkspace(database, ownerA, "Tenant A");
      const workspaceB = await insertWorkspace(database, ownerB, "Tenant B");
      await insertMember(database, workspaceA.id, memberA.id);
      const businessA = await insertBusiness(database, workspaceA.id, "A");
      const businessB = await insertBusiness(database, workspaceB.id, "B");
      const projectA = await insertProject(
        database,
        workspaceA.id,
        businessA.id,
        "Projeto A",
      );
      const projectB = await insertProject(
        database,
        workspaceB.id,
        businessB.id,
        "Projeto B",
      );
      const contextA = context(ownerA, workspaceA, "owner");
      const memberContextA = context(memberA, workspaceA, "member");
      const contextB = context(ownerB, workspaceB, "owner");
      const taskA = await createWorkspaceTask(
        database,
        contextA,
        taskInput(projectA.id, [ownerA.id]),
      );
      const taskB = await createWorkspaceTask(
        database,
        contextB,
        taskInput(projectB.id, [ownerB.id], { name: "Tarefa B" }),
      );

      await expect(
        getWorkspaceTask(database, contextB, taskA.id),
      ).rejects.toBeInstanceOf(TaskNotFoundError);
      await expect(
        getWorkspaceTask(database, contextB, randomUUID()),
      ).rejects.toBeInstanceOf(TaskNotFoundError);
      await expect(
        archiveWorkspaceTask(database, contextB, taskA.id, taskA.version),
      ).rejects.toBeInstanceOf(TaskNotFoundError);
      await expect(
        setWorkspaceSubtaskState(
          database,
          contextA,
          taskA.id,
          taskB.subtasks[0]!.id,
          { version: taskA.version, status: "concluida" },
        ),
      ).rejects.toBeInstanceOf(TaskSubtaskNotFoundError);

      await expect(
        createWorkspaceTask(
          database,
          contextA,
          taskInput(projectB.id, [ownerA.id], { name: "Projeto externo" }),
        ),
      ).rejects.toBeInstanceOf(TaskRelationsInvalidError);
      await expect(
        createWorkspaceTask(
          database,
          contextA,
          taskInput(projectA.id, [ownerB.id], { name: "Membro externo" }),
        ),
      ).rejects.toBeInstanceOf(TaskRelationsInvalidError);
      await expect(
        updateWorkspaceTask(
          database,
          contextA,
          taskA.id,
          updateInput(taskA, {
            subtasks: [
              {
                id: taskB.subtasks[0]!.id,
                name: "Subtarefa externa",
                durationMinutes: 60,
                status: "pendente",
              },
            ],
          }),
        ),
      ).rejects.toBeInstanceOf(TaskRelationsInvalidError);

      await database
        .delete(workspaceMembers)
        .where(
          and(
            eq(workspaceMembers.workspaceId, workspaceA.id),
            eq(workspaceMembers.userId, memberA.id),
          ),
        );
      await expect(
        getWorkspaceTask(database, memberContextA, taskA.id),
      ).rejects.toBeInstanceOf(WorkspaceNotFoundError);
      await expect(
        updateWorkspaceTask(
          database,
          memberContextA,
          taskA.id,
          updateInput(taskA),
        ),
      ).rejects.toBeInstanceOf(WorkspaceNotFoundError);
    });
  });

  it("exige subtarefas concluídas e preserva pais arquivados já vinculados", async () => {
    await withRollback(async (database) => {
      const owner = await insertUser(database, "Owner Pais");
      const workspace = await insertWorkspace(database, owner, "Pais");
      const business = await insertBusiness(database, workspace.id, "Cliente");
      const project = await insertProject(
        database,
        workspace.id,
        business.id,
        "Projeto Pais",
      );
      const ownerContext = context(owner, workspace, "owner");

      await expect(
        createWorkspaceTask(
          database,
          ownerContext,
          taskInput(project.id, [owner.id], { status: "conclusao" }),
        ),
      ).rejects.toBeInstanceOf(TaskStateConflictError);
      const completed = await createWorkspaceTask(
        database,
        ownerContext,
        taskInput(project.id, [owner.id], {
          name: "Concluída na criação",
          status: "conclusao",
          subtasks: [
            {
              name: "Etapa concluída",
              durationMinutes: 60,
              status: "concluida",
            },
          ],
        }),
      );
      expect(completed.completedAt).not.toBeNull();
      expect(completed.subtasks[0]?.updatedAt).toBe(
        completed.subtasks[0]?.createdAt,
      );

      const active = await createWorkspaceTask(
        database,
        ownerContext,
        taskInput(project.id, [owner.id], { name: "Pai arquivado" }),
      );
      const retainedTagId = active.tags[0]!.id;
      await database
        .update(projects)
        .set({ archivedAt: new Date(), updatedAt: new Date() })
        .where(eq(projects.id, project.id));
      await database
        .update(businesses)
        .set({ archivedAt: new Date(), updatedAt: new Date() })
        .where(eq(businesses.id, business.id));
      await database
        .update(tags)
        .set({ archivedAt: new Date(), updatedAt: new Date() })
        .where(eq(tags.id, retainedTagId));

      const retained = await updateWorkspaceTask(
        database,
        ownerContext,
        active.id,
        updateInput(active, { name: "Mantém vínculos arquivados" }),
      );
      expect(retained.project.archivedAt).not.toBeNull();
      expect(retained.business.archivedAt).not.toBeNull();
      expect(retained.tags[0]?.archivedAt).not.toBeNull();
      await expect(
        createWorkspaceTask(
          database,
          ownerContext,
          taskInput(project.id, [owner.id], { name: "Novo vínculo arquivado" }),
        ),
      ).rejects.toBeInstanceOf(TaskRelationsInvalidError);

      const [archivedSubtasks] = await database
        .select({ value: count() })
        .from(taskSubtasks)
        .where(
          and(
            eq(taskSubtasks.workspaceId, workspace.id),
            isNotNull(taskSubtasks.archivedAt),
          ),
        );
      expect(archivedSubtasks?.value).toBe(0);
    });
  });

  it("serializa dois appends concorrentes na mesma coluna sem duplicar posições", async () => {
    const owner = await insertUser(database, "Owner CAS");
    try {
      const workspace = await insertWorkspace(
        database,
        owner,
        "Concorrência Board",
      );
      const business = await insertBusiness(database, workspace.id, "Cliente");
      const project = await insertProject(
        database,
        workspace.id,
        business.id,
        "Projeto Concorrente",
      );
      const ownerContext = context(owner, workspace, "owner");
      const anchorZero = await createWorkspaceTask(
        database,
        ownerContext,
        taskInput(project.id, [owner.id], {
          name: "Âncora zero",
          priority: "destino",
        }),
      );
      const anchorOne = await createWorkspaceTask(
        database,
        ownerContext,
        taskInput(project.id, [owner.id], {
          name: "Âncora um",
          priority: "destino",
        }),
      );
      const contenderA = await createWorkspaceTask(
        database,
        ownerContext,
        taskInput(project.id, [owner.id], {
          name: "Append A",
          priority: "origem_a",
        }),
      );
      const contenderB = await createWorkspaceTask(
        database,
        ownerContext,
        taskInput(project.id, [owner.id], {
          name: "Append B",
          priority: "origem_b",
        }),
      );

      const seededAnchors = await updateWorkspaceTaskBoard(
        database,
        ownerContext,
        {
          view: "priority",
          updates: [
            {
              id: anchorZero.id,
              version: anchorZero.version,
              position: 0,
              columnKey: "destino",
            },
            {
              id: anchorOne.id,
              version: anchorOne.version,
              position: 1,
              columnKey: "destino",
            },
          ],
        },
      );
      const seededAnchorZero = seededAnchors.items[0]!;
      const seededAnchorOne = seededAnchors.items[1]!;

      await expect(
        updateWorkspaceTaskBoard(database, ownerContext, {
          view: "priority",
          updates: [
            {
              id: contenderA.id,
              version: contenderA.version,
              position: 2,
              columnKey: "destino",
            },
          ],
        }),
      ).rejects.toBeInstanceOf(TaskStateConflictError);
      expect(
        await getWorkspaceTask(database, ownerContext, contenderA.id),
      ).toEqual(contenderA);

      const appendBatch = (contender: Task) => ({
        view: "priority" as const,
        updates: [
          {
            id: seededAnchorZero.id,
            version: seededAnchorZero.version,
            position: 0,
            columnKey: "destino",
          },
          {
            id: seededAnchorOne.id,
            version: seededAnchorOne.version,
            position: 1,
            columnKey: "destino",
          },
          {
            id: contender.id,
            version: contender.version,
            position: 2,
            columnKey: "destino",
          },
        ],
      });
      const outcomes = await Promise.allSettled([
        updateWorkspaceTaskBoard(
          database,
          ownerContext,
          appendBatch(contenderA),
        ),
        updateWorkspaceTaskBoard(
          database,
          ownerContext,
          appendBatch(contenderB),
        ),
      ]);
      expect(
        outcomes.filter(({ status }) => status === "fulfilled"),
      ).toHaveLength(1);
      const rejected = outcomes.find(({ status }) => status === "rejected");
      if (!rejected || rejected.status !== "rejected") {
        throw new Error("O lote concorrente deveria falhar por versão.");
      }
      expect(rejected.reason).toBeInstanceOf(TaskVersionConflictError);

      const persistedAnchorZero = await getWorkspaceTask(
        database,
        ownerContext,
        seededAnchorZero.id,
      );
      const persistedAnchorOne = await getWorkspaceTask(
        database,
        ownerContext,
        seededAnchorOne.id,
      );
      const persistedA = await getWorkspaceTask(
        database,
        ownerContext,
        contenderA.id,
      );
      const persistedB = await getWorkspaceTask(
        database,
        ownerContext,
        contenderB.id,
      );
      expect(persistedAnchorZero).toMatchObject({
        priority: "destino",
        version: 3,
        boardOrder: { priority: 0 },
      });
      expect(persistedAnchorOne).toMatchObject({
        priority: "destino",
        version: 3,
        boardOrder: { priority: 1 },
      });

      const winnerIsA = outcomes[0]?.status === "fulfilled";
      const winner = winnerIsA ? persistedA : persistedB;
      const loser = winnerIsA ? persistedB : persistedA;
      const loserSnapshot = winnerIsA ? contenderB : contenderA;
      expect(winner).toMatchObject({
        priority: "destino",
        version: 2,
        boardOrder: { priority: 2 },
      });
      expect(loser).toEqual(loserSnapshot);
      expect(
        [persistedAnchorZero, persistedAnchorOne, winner].map(
          ({ boardOrder }) => boardOrder.priority,
        ),
      ).toEqual([0, 1, 2]);
    } finally {
      await database
        .delete(workspaces)
        .where(eq(workspaces.ownerUserId, owner.id));
      await database.delete(users).where(eq(users.id, owner.id));
    }
  });

  it("mantem o nome do negocio privado em tarefas compartilhadas sem expor seu arquivamento", async () => {
    await withRollback(async (database) => {
      const owner = await insertUser(database, "TaskBizOwner");
      const member = await insertUser(database, "TaskBizMember");
      const sharedWorkspace = await insertWorkspace(
        database,
        owner,
        "Tarefas com negocio privado",
      );
      const privateWorkspace = await insertWorkspace(
        database,
        owner,
        "Registros privados da tarefa",
      );
      await insertMember(database, sharedWorkspace.id, member.id);
      const business = await insertBusiness(
        database,
        privateWorkspace.id,
        "Cliente visivel pelo projeto",
        owner.id,
      );
      const project = await insertProject(
        database,
        sharedWorkspace.id,
        business.id,
        "Projeto compartilhado",
      );
      const ownerContext = context(owner, sharedWorkspace, "owner");
      const memberContext = context(member, sharedWorkspace, "member");
      const task = await createWorkspaceTask(
        database,
        ownerContext,
        taskInput(project.id, [owner.id]),
      );

      expect(
        (
          await listWorkspaceTasks(
            database,
            memberContext,
            taskListQuerySchema.parse({ query: "Cliente visivel" }),
          )
        ).items.map(({ id }) => id),
      ).toEqual([task.id]);
      await database
        .update(businesses)
        .set({ archivedAt: new Date(), updatedAt: new Date() })
        .where(eq(businesses.id, business.id));

      const visibleToMember = await getWorkspaceTask(
        database,
        memberContext,
        task.id,
      );
      expect(visibleToMember.business).toEqual({
        id: business.id,
        name: "Cliente visivel pelo projeto",
        archivedAt: null,
      });
      expect(
        (await getWorkspaceTask(database, ownerContext, task.id)).business
          .archivedAt,
      ).not.toBeNull();
    });
  });
});
