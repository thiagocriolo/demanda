import {
  and,
  asc,
  count,
  desc,
  eq,
  gte,
  ilike,
  inArray,
  isNotNull,
  isNull,
  lte,
  or,
  sql,
  type SQL,
} from "drizzle-orm";
import type { Database } from "../db/database";
import {
  businesses,
  projects,
  tags,
  taskResponsibles,
  tasks,
  taskSubtasks,
  taskTags,
  users,
  workspaceMembers,
} from "../db/schema";
import {
  requireActiveWorkspacePermission,
  requireWorkspacePermission,
  requireWorkspacePermissionForUpdate,
  type RequestAuthorizationContext,
} from "../authorization/workspace-context";
import type {
  Task,
  TaskBoardInput,
  TaskBoardResult,
  TaskBoardView,
  TaskCreateInput,
  TaskList,
  TaskResponsible,
  TaskStateInput,
  TaskSubtask,
  TaskSubtaskMutationInput,
  TaskSubtaskStateInput,
  TaskTag,
  TaskUpdateInput,
} from "./types";
import {
  SUBTASK_COMPLETED_STATUS,
  SUBTASK_PENDING_STATUS,
  TASK_COMPLETED_STATUS,
} from "./types";
import {
  normalizeTaskTagLabel,
  taskTagKey,
  type TaskListQuery,
} from "./validation";
import { touchWorkspaceConfiguration } from "../settings/version";

type TaskDatabase = Pick<Database, "select" | "insert" | "update" | "delete">;

export class TaskNotFoundError extends Error {
  readonly status = 404;

  constructor() {
    super("Tarefa não encontrada.");
    this.name = "TaskNotFoundError";
  }
}

export class TaskSubtaskNotFoundError extends Error {
  readonly status = 404;

  constructor() {
    super("Subtarefa não encontrada.");
    this.name = "TaskSubtaskNotFoundError";
  }
}

export class TaskRelationsInvalidError extends Error {
  readonly status = 400;

  constructor() {
    super("Um ou mais vínculos da tarefa não são válidos.");
    this.name = "TaskRelationsInvalidError";
  }
}

export class TaskVersionConflictError extends Error {
  readonly status = 409;

  constructor() {
    super(
      "A tarefa foi alterada por outra operação. Recarregue os dados e tente novamente.",
    );
    this.name = "TaskVersionConflictError";
  }
}

export class TaskStateConflictError extends Error {
  readonly status = 409;

  constructor(message: string) {
    super(message);
    this.name = "TaskStateConflictError";
  }
}

export class TaskArchivedError extends Error {
  readonly status = 409;

  constructor() {
    super("A tarefa arquivada não pode ser alterada.");
    this.name = "TaskArchivedError";
  }
}

function workspaceIdFromContext(context: RequestAuthorizationContext): string {
  return requireActiveWorkspacePermission(context, "workspace:read").workspace
    .id;
}

function iso(value: Date | null): string | null {
  return value?.toISOString() ?? null;
}

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (character) => `\\${character}`);
}

function databaseConstraint(error: unknown): string | undefined {
  const visited = new Set<unknown>();
  let current = error;
  while (current && typeof current === "object" && !visited.has(current)) {
    visited.add(current);
    if ("constraint" in current && typeof current.constraint === "string") {
      return current.constraint;
    }
    current = "cause" in current ? current.cause : undefined;
  }
  return undefined;
}

function translateTaskConstraint(error: unknown): never {
  const constraint = databaseConstraint(error);
  if (constraint === "task_responsibles_cronograma_no_overlap") {
    throw new TaskStateConflictError(
      "A troca de responsavel cria conflito de horario no Cronograma.",
    );
  }
  if (
    constraint?.includes("workspace_project_business_foreign_key") ||
    constraint?.includes("workspace_business_foreign_key") ||
    constraint?.includes("workspace_member_foreign_key") ||
    constraint?.includes("workspace_tag_foreign_key")
  ) {
    throw new TaskRelationsInvalidError();
  }
  throw error;
}

async function findScopedTaskRow(
  database: TaskDatabase,
  workspaceId: string,
  taskId: string,
  lock = false,
): Promise<typeof tasks.$inferSelect | null> {
  let query = database
    .select()
    .from(tasks)
    .where(and(eq(tasks.workspaceId, workspaceId), eq(tasks.id, taskId)))
    .limit(1);
  if (lock) query = query.for("update") as typeof query;
  const [row] = await query;
  return row ?? null;
}

async function findScopedSubtaskRow(
  database: TaskDatabase,
  workspaceId: string,
  taskId: string,
  subtaskId: string,
  lock = false,
): Promise<typeof taskSubtasks.$inferSelect | null> {
  let query = database
    .select()
    .from(taskSubtasks)
    .where(
      and(
        eq(taskSubtasks.workspaceId, workspaceId),
        eq(taskSubtasks.taskId, taskId),
        eq(taskSubtasks.id, subtaskId),
        isNull(taskSubtasks.archivedAt),
      ),
    )
    .limit(1);
  if (lock) query = query.for("update") as typeof query;
  const [row] = await query;
  return row ?? null;
}

async function hydrateTasks(
  database: TaskDatabase,
  rows: (typeof tasks.$inferSelect)[],
  viewerUserId: string,
): Promise<Task[]> {
  if (!rows.length) return [];
  const workspaceId = rows[0]!.workspaceId;
  const taskIds = rows.map(({ id }) => id);
  const projectIds = [...new Set(rows.map(({ projectId }) => projectId))];

  const projectRows = await database
    .select({
      id: projects.id,
      name: projects.name,
      status: projects.statusKey,
      archivedAt: projects.archivedAt,
      businessId: businesses.id,
      businessName: businesses.name,
      businessOwnerUserId: businesses.ownerUserId,
      businessArchivedAt: businesses.archivedAt,
    })
    .from(projects)
    .innerJoin(businesses, eq(businesses.id, projects.businessId))
    .where(
      and(
        eq(projects.workspaceId, workspaceId),
        inArray(projects.id, projectIds),
      ),
    );

  const subtaskRows = await database
    .select()
    .from(taskSubtasks)
    .where(
      and(
        eq(taskSubtasks.workspaceId, workspaceId),
        inArray(taskSubtasks.taskId, taskIds),
        isNull(taskSubtasks.archivedAt),
      ),
    )
    .orderBy(
      asc(taskSubtasks.taskId),
      asc(taskSubtasks.sortOrder),
      asc(taskSubtasks.id),
    );

  const tagRows = await database
    .select({
      taskId: taskTags.taskId,
      id: tags.id,
      name: tags.label,
      archivedAt: tags.archivedAt,
    })
    .from(taskTags)
    .innerJoin(
      tags,
      and(
        eq(tags.workspaceId, taskTags.workspaceId),
        eq(tags.id, taskTags.tagId),
      ),
    )
    .where(
      and(
        eq(taskTags.workspaceId, workspaceId),
        inArray(taskTags.taskId, taskIds),
      ),
    )
    .orderBy(asc(taskTags.taskId), asc(taskTags.sortOrder), asc(tags.id));

  const responsibleRows = await database
    .select({
      taskId: taskResponsibles.taskId,
      userId: workspaceMembers.userId,
      name: users.name,
      email: users.email,
      avatarUrl: users.avatarUrl,
      role: workspaceMembers.role,
    })
    .from(taskResponsibles)
    .innerJoin(
      workspaceMembers,
      and(
        eq(workspaceMembers.workspaceId, taskResponsibles.workspaceId),
        eq(workspaceMembers.userId, taskResponsibles.userId),
      ),
    )
    .innerJoin(users, eq(users.id, workspaceMembers.userId))
    .where(
      and(
        eq(taskResponsibles.workspaceId, workspaceId),
        inArray(taskResponsibles.taskId, taskIds),
      ),
    )
    .orderBy(
      asc(taskResponsibles.taskId),
      asc(taskResponsibles.sortOrder),
      asc(users.id),
    );

  const projectById = new Map(projectRows.map((row) => [row.id, row]));
  const subtasksByTask = new Map<string, TaskSubtask[]>();
  const tagsByTask = new Map<string, TaskTag[]>();
  const responsiblesByTask = new Map<string, TaskResponsible[]>();

  for (const row of subtaskRows) {
    const item: TaskSubtask = {
      id: row.id,
      name: row.name,
      durationMinutes: row.durationMinutes,
      status:
        row.statusKey === SUBTASK_COMPLETED_STATUS
          ? SUBTASK_COMPLETED_STATUS
          : SUBTASK_PENDING_STATUS,
      sortOrder: row.sortOrder,
      completedAt: iso(row.completedAt),
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
    const items = subtasksByTask.get(row.taskId) ?? [];
    items.push(item);
    subtasksByTask.set(row.taskId, items);
  }
  for (const row of tagRows) {
    const items = tagsByTask.get(row.taskId) ?? [];
    items.push({ id: row.id, name: row.name, archivedAt: iso(row.archivedAt) });
    tagsByTask.set(row.taskId, items);
  }
  for (const row of responsibleRows) {
    const items = responsiblesByTask.get(row.taskId) ?? [];
    items.push({
      userId: row.userId,
      name: row.name,
      email: row.email,
      avatarUrl: row.avatarUrl,
      role: row.role,
    });
    responsiblesByTask.set(row.taskId, items);
  }

  return rows.flatMap((row): Task[] => {
    const relation = projectById.get(row.projectId);
    if (!relation) return [];
    const subtasks = subtasksByTask.get(row.id) ?? [];
    return [
      {
        id: row.id,
        workspaceId: row.workspaceId,
        name: row.name,
        business: {
          id: relation.businessId,
          name: relation.businessName,
          archivedAt:
            relation.businessOwnerUserId === viewerUserId
              ? iso(relation.businessArchivedAt)
              : null,
        },
        project: {
          id: relation.id,
          name: relation.name,
          status: relation.status,
          archivedAt: iso(relation.archivedAt),
        },
        category: row.categoryKey ?? "",
        priority: row.priorityKey,
        status: row.statusKey,
        briefing: row.description,
        dueDate: row.dueDate,
        tags: tagsByTask.get(row.id) ?? [],
        responsibles: responsiblesByTask.get(row.id) ?? [],
        subtasks,
        durationMinutes: subtasks.reduce(
          (total, subtask) => total + subtask.durationMinutes,
          0,
        ),
        sortOrder: row.sortOrder,
        boardOrder: row.boardOrder,
        version: row.version,
        completedAt: iso(row.completedAt),
        archivedAt: iso(row.archivedAt),
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
      },
    ];
  });
}

async function validateAndLockProject(
  database: TaskDatabase,
  workspaceId: string,
  projectId: string,
  previouslyLinkedProjectId?: string,
): Promise<{ projectId: string; businessId: string }> {
  const [row] = await database
    .select({
      projectId: projects.id,
      businessId: projects.businessId,
      projectArchivedAt: projects.archivedAt,
      businessArchivedAt: businesses.archivedAt,
    })
    .from(projects)
    .innerJoin(businesses, eq(businesses.id, projects.businessId))
    .where(
      and(eq(projects.workspaceId, workspaceId), eq(projects.id, projectId)),
    )
    .limit(1)
    .for("update");
  if (
    !row ||
    ((row.projectArchivedAt || row.businessArchivedAt) &&
      row.projectId !== previouslyLinkedProjectId)
  ) {
    throw new TaskRelationsInvalidError();
  }
  return { projectId: row.projectId, businessId: row.businessId };
}

async function validateAndLockMembers(
  database: TaskDatabase,
  workspaceId: string,
  userIds: string[],
): Promise<void> {
  if (userIds.length > 20 || new Set(userIds).size !== userIds.length) {
    throw new TaskRelationsInvalidError();
  }
  if (!userIds.length) return;
  const rows = await database
    .select({ userId: workspaceMembers.userId })
    .from(workspaceMembers)
    .where(
      and(
        eq(workspaceMembers.workspaceId, workspaceId),
        inArray(workspaceMembers.userId, [...userIds].sort()),
      ),
    )
    .orderBy(asc(workspaceMembers.userId))
    .for("update");
  if (rows.length !== userIds.length) throw new TaskRelationsInvalidError();
}

async function existingTaskTagIds(
  database: TaskDatabase,
  workspaceId: string,
  taskId: string,
): Promise<Set<string>> {
  const rows = await database
    .select({ tagId: taskTags.tagId })
    .from(taskTags)
    .where(
      and(eq(taskTags.workspaceId, workspaceId), eq(taskTags.taskId, taskId)),
    );
  return new Set(rows.map(({ tagId }) => tagId));
}

async function resolveAndLockTags(
  database: TaskDatabase,
  workspaceId: string,
  labels: string[],
  previouslyLinked = new Set<string>(),
): Promise<(typeof tags.$inferSelect)[]> {
  const normalized = labels.map((label) => ({
    key: taskTagKey(label),
    label: normalizeTaskTagLabel(label),
  }));
  if (
    normalized.length > 30 ||
    normalized.some(({ key }) => !/^[a-z0-9][a-z0-9_-]{0,63}$/u.test(key)) ||
    new Set(normalized.map(({ key }) => key)).size !== normalized.length
  ) {
    throw new TaskRelationsInvalidError();
  }
  if (!normalized.length) return [];
  const createdTags = await database
    .insert(tags)
    .values(normalized.map(({ key, label }) => ({ workspaceId, key, label })))
    .onConflictDoNothing({ target: [tags.workspaceId, tags.key] })
    .returning({ id: tags.id });
  if (createdTags.length) {
    await touchWorkspaceConfiguration(database, workspaceId);
  }
  const rows = await database
    .select()
    .from(tags)
    .where(
      and(
        eq(tags.workspaceId, workspaceId),
        inArray(tags.key, normalized.map(({ key }) => key).sort()),
      ),
    )
    .orderBy(asc(tags.key))
    .for("update");
  if (
    rows.length !== normalized.length ||
    rows.some((row) => row.archivedAt && !previouslyLinked.has(row.id))
  ) {
    throw new TaskRelationsInvalidError();
  }
  const byKey = new Map(rows.map((row) => [row.key, row]));
  return normalized.map(({ key }) => byKey.get(key)!).filter(Boolean);
}

function assertCompletionAllowed(
  status: string,
  subtasks: TaskSubtaskMutationInput[],
): void {
  if (
    status === TASK_COMPLETED_STATUS &&
    subtasks.some(
      ({ status: subtaskStatus }) => subtaskStatus !== SUBTASK_COMPLETED_STATUS,
    )
  ) {
    throw new TaskStateConflictError(
      "Conclua todas as subtarefas antes de concluir a tarefa.",
    );
  }
}

function taskBoardColumnKey(
  task: typeof tasks.$inferSelect,
  view: TaskBoardView,
): string {
  if (view === "status") return task.statusKey;
  if (view === "priority") return task.priorityKey;
  if (view === "business") return task.businessId;
  return task.projectId;
}

function taskBoardOrdersEqual(
  first: Task["boardOrder"],
  second: Task["boardOrder"],
): boolean {
  return (["status", "priority", "business", "project"] as const).every(
    (view) => first[view] === second[view],
  );
}

async function insertTaskRelations(
  database: TaskDatabase,
  workspaceId: string,
  taskId: string,
  tagRows: (typeof tags.$inferSelect)[],
  responsibleUserIds: string[],
): Promise<void> {
  if (tagRows.length) {
    await database.insert(taskTags).values(
      tagRows.map((tag, sortOrder) => ({
        workspaceId,
        taskId,
        tagId: tag.id,
        sortOrder,
      })),
    );
  }
  if (responsibleUserIds.length) {
    await database.insert(taskResponsibles).values(
      responsibleUserIds.map((userId, sortOrder) => ({
        workspaceId,
        taskId,
        userId,
        sortOrder,
      })),
    );
  }
}

async function insertSubtasks(
  database: TaskDatabase,
  workspaceId: string,
  taskId: string,
  subtasksInput: TaskSubtaskMutationInput[],
  now: Date,
): Promise<void> {
  await database.insert(taskSubtasks).values(
    subtasksInput.map((subtask, sortOrder) => ({
      workspaceId,
      taskId,
      name: subtask.name,
      durationMinutes: subtask.durationMinutes,
      statusKey: subtask.status,
      sortOrder,
      completedAt: subtask.status === SUBTASK_COMPLETED_STATUS ? now : null,
      createdAt: now,
      updatedAt: now,
    })),
  );
}

function taskSearchCondition(query: string): SQL | undefined {
  if (!query) return undefined;
  const pattern = `%${escapeLike(query)}%`;
  return or(
    ilike(tasks.name, pattern),
    ilike(tasks.description, pattern),
    sql<boolean>`exists (
      select 1 from ${projects}
      where ${projects.workspaceId} = ${tasks.workspaceId}
        and ${projects.id} = ${tasks.projectId}
        and ${projects.name} ilike ${pattern} escape '\\'
    )`,
    sql<boolean>`exists (
      select 1 from ${businesses}
      where ${businesses.id} = ${tasks.businessId}
        and ${businesses.name} ilike ${pattern} escape '\\'
    )`,
    sql<boolean>`exists (
      select 1 from ${taskSubtasks}
      where ${taskSubtasks.workspaceId} = ${tasks.workspaceId}
        and ${taskSubtasks.taskId} = ${tasks.id}
        and ${taskSubtasks.archivedAt} is null
        and ${taskSubtasks.name} ilike ${pattern} escape '\\'
    )`,
    sql<boolean>`exists (
      select 1 from ${taskTags}
      inner join ${tags}
        on ${tags.workspaceId} = ${taskTags.workspaceId}
       and ${tags.id} = ${taskTags.tagId}
      where ${taskTags.workspaceId} = ${tasks.workspaceId}
        and ${taskTags.taskId} = ${tasks.id}
        and ${tags.label} ilike ${pattern} escape '\\'
    )`,
    sql<boolean>`exists (
      select 1 from ${taskResponsibles}
      inner join ${users} on ${users.id} = ${taskResponsibles.userId}
      where ${taskResponsibles.workspaceId} = ${tasks.workspaceId}
        and ${taskResponsibles.taskId} = ${tasks.id}
        and ${users.name} ilike ${pattern} escape '\\'
    )`,
  );
}

function taskCommonConditions(
  workspaceId: string,
  query: TaskListQuery,
): SQL[] {
  const conditions: SQL[] = [eq(tasks.workspaceId, workspaceId)];
  const search = taskSearchCondition(query.query);
  if (search) conditions.push(search);
  if (query.businessId) conditions.push(eq(tasks.businessId, query.businessId));
  if (query.responsibleUserId) {
    conditions.push(sql<boolean>`exists (
      select 1 from ${taskResponsibles}
      where ${taskResponsibles.workspaceId} = ${tasks.workspaceId}
        and ${taskResponsibles.taskId} = ${tasks.id}
        and ${taskResponsibles.userId} = ${query.responsibleUserId}
    )`);
  }
  if (query.tagId) {
    conditions.push(sql<boolean>`exists (
      select 1 from ${taskTags}
      where ${taskTags.workspaceId} = ${tasks.workspaceId}
        and ${taskTags.taskId} = ${tasks.id}
        and ${taskTags.tagId} = ${query.tagId}
    )`);
  }
  if (query.dueFrom) conditions.push(gte(tasks.dueDate, query.dueFrom));
  if (query.dueTo) conditions.push(lte(tasks.dueDate, query.dueTo));
  return conditions;
}

function taskListConditions(workspaceId: string, query: TaskListQuery): SQL[] {
  const conditions = taskCommonConditions(workspaceId, query);
  if (query.status) conditions.push(eq(tasks.statusKey, query.status));
  if (query.category) conditions.push(eq(tasks.categoryKey, query.category));
  if (query.priority) conditions.push(eq(tasks.priorityKey, query.priority));
  if (query.projectId) conditions.push(eq(tasks.projectId, query.projectId));
  if (query.archived === "exclude") conditions.push(isNull(tasks.archivedAt));
  if (query.archived === "only") conditions.push(isNotNull(tasks.archivedAt));
  return conditions;
}

function taskOrdering(orderBy: TaskListQuery["orderBy"]): [SQL, SQL] {
  if (orderBy === "name_asc") {
    return [asc(sql`lower(${tasks.name})`), asc(tasks.id)];
  }
  if (orderBy === "name_desc") {
    return [desc(sql`lower(${tasks.name})`), desc(tasks.id)];
  }
  if (orderBy === "due_asc") {
    return [sql`${tasks.dueDate} asc nulls last`, asc(tasks.id)];
  }
  if (orderBy === "due_desc") {
    return [sql`${tasks.dueDate} desc nulls last`, desc(tasks.id)];
  }
  return [desc(tasks.updatedAt), desc(tasks.id)];
}

export async function listWorkspaceTasks(
  database: Database,
  context: RequestAuthorizationContext,
  query: TaskListQuery,
): Promise<TaskList> {
  return database.transaction(
    async (transaction) => {
      const workspaceId = query.workspaceId ?? workspaceIdFromContext(context);
      await requireWorkspacePermission(
        transaction,
        context.user.id,
        workspaceId,
        "workspace:read",
      );
      const conditions = taskListConditions(workspaceId, query);
      const common = taskCommonConditions(workspaceId, query);
      const rows = await transaction
        .select()
        .from(tasks)
        .where(and(...conditions))
        .orderBy(...taskOrdering(query.orderBy))
        .limit(query.pageSize)
        .offset((query.page - 1) * query.pageSize);
      const [totalRow] = await transaction
        .select({ value: count() })
        .from(tasks)
        .where(and(...conditions));
      const facetRows = await transaction
        .select({
          status: tasks.statusKey,
          category: tasks.categoryKey,
          priority: tasks.priorityKey,
          projectId: tasks.projectId,
          archived: sql<boolean>`${tasks.archivedAt} is not null`,
          value: count(),
        })
        .from(tasks)
        .where(and(...common))
        .groupBy(
          tasks.statusKey,
          tasks.categoryKey,
          tasks.priorityKey,
          tasks.projectId,
          sql`${tasks.archivedAt} is not null`,
        );
      const facets: TaskList["facets"] = {
        all: 0,
        archived: 0,
        statuses: {},
        categories: {},
        priorities: {},
        projects: {},
      };
      for (const row of facetRows) {
        if (row.archived) {
          facets.archived += row.value;
          continue;
        }
        facets.all += row.value;
        facets.statuses[row.status] =
          (facets.statuses[row.status] ?? 0) + row.value;
        if (row.category) {
          facets.categories[row.category] =
            (facets.categories[row.category] ?? 0) + row.value;
        }
        facets.priorities[row.priority] =
          (facets.priorities[row.priority] ?? 0) + row.value;
        facets.projects[row.projectId] =
          (facets.projects[row.projectId] ?? 0) + row.value;
      }
      const total = totalRow?.value ?? 0;
      return {
        workspaceId,
        items: await hydrateTasks(transaction, rows, context.user.id),
        page: query.page,
        pageSize: query.pageSize,
        total,
        totalPages: Math.ceil(total / query.pageSize),
        facets,
      };
    },
    { isolationLevel: "repeatable read", accessMode: "read only" },
  );
}

export async function getWorkspaceTask(
  database: Database,
  context: RequestAuthorizationContext,
  taskId: string,
): Promise<Task> {
  const workspaceId = workspaceIdFromContext(context);
  await requireWorkspacePermission(
    database,
    context.user.id,
    workspaceId,
    "workspace:read",
  );
  const row = await findScopedTaskRow(database, workspaceId, taskId);
  if (!row) throw new TaskNotFoundError();
  const [task] = await hydrateTasks(database, [row], context.user.id);
  if (!task) throw new TaskNotFoundError();
  return task;
}

export async function createWorkspaceTask(
  database: Database,
  context: RequestAuthorizationContext,
  input: TaskCreateInput,
): Promise<Task> {
  const workspaceId = workspaceIdFromContext(context);
  if (input.boardOrder && Object.keys(input.boardOrder).length > 0) {
    throw new TaskRelationsInvalidError();
  }
  assertCompletionAllowed(input.status, input.subtasks);
  try {
    return await database.transaction(async (transaction) => {
      await requireWorkspacePermissionForUpdate(
        transaction,
        context.user.id,
        workspaceId,
        "workspace:write",
      );
      const project = await validateAndLockProject(
        transaction,
        workspaceId,
        input.projectId,
      );
      await validateAndLockMembers(
        transaction,
        workspaceId,
        input.responsibleUserIds,
      );
      const tagRows = await resolveAndLockTags(
        transaction,
        workspaceId,
        input.tagLabels,
      );
      const now = new Date();
      const createdRows = await transaction
        .insert(tasks)
        .values({
          workspaceId,
          projectId: project.projectId,
          businessId: project.businessId,
          name: input.name,
          description: input.briefing,
          categoryKey: input.category || null,
          priorityKey: input.priority,
          statusKey: input.status,
          dueDate: input.dueDate,
          sortOrder: input.sortOrder ?? 0,
          boardOrder: {},
          completedAt: input.status === TASK_COMPLETED_STATUS ? now : null,
          createdAt: now,
          updatedAt: now,
        })
        .returning();
      if (createdRows.length !== 1) {
        throw new Error("A tarefa não pôde ser criada.");
      }
      const created = createdRows[0]!;
      await insertTaskRelations(
        transaction,
        workspaceId,
        created.id,
        tagRows,
        input.responsibleUserIds,
      );
      await insertSubtasks(
        transaction,
        workspaceId,
        created.id,
        input.subtasks,
        now,
      );
      const [task] = await hydrateTasks(
        transaction,
        [created],
        context.user.id,
      );
      if (!task) throw new Error("A tarefa não pôde ser carregada.");
      return task;
    });
  } catch (error) {
    if (
      error instanceof TaskRelationsInvalidError ||
      error instanceof TaskStateConflictError
    ) {
      throw error;
    }
    translateTaskConstraint(error);
  }
}

async function synchronizeSubtasks(
  database: TaskDatabase,
  workspaceId: string,
  taskId: string,
  input: TaskSubtaskMutationInput[],
  now: Date,
): Promise<void> {
  const existing = await database
    .select()
    .from(taskSubtasks)
    .where(
      and(
        eq(taskSubtasks.workspaceId, workspaceId),
        eq(taskSubtasks.taskId, taskId),
        isNull(taskSubtasks.archivedAt),
      ),
    )
    .orderBy(asc(taskSubtasks.id))
    .for("update");
  const existingById = new Map(existing.map((row) => [row.id, row]));
  const requestedIds = input.flatMap(({ id }) => (id ? [id] : []));
  if (
    new Set(requestedIds).size !== requestedIds.length ||
    requestedIds.some((id) => !existingById.has(id))
  ) {
    throw new TaskRelationsInvalidError();
  }

  const omittedIds = existing
    .map(({ id }) => id)
    .filter((id) => !requestedIds.includes(id));
  if (omittedIds.length) {
    await database
      .update(taskSubtasks)
      .set({ archivedAt: now, updatedAt: now })
      .where(
        and(
          eq(taskSubtasks.workspaceId, workspaceId),
          eq(taskSubtasks.taskId, taskId),
          inArray(taskSubtasks.id, omittedIds),
          isNull(taskSubtasks.archivedAt),
        ),
      );
  }

  const additions: TaskSubtaskMutationInput[] = [];
  for (const [sortOrder, subtask] of input.entries()) {
    if (!subtask.id) {
      additions.push(subtask);
      continue;
    }
    const previous = existingById.get(subtask.id)!;
    const completedAt =
      subtask.status === SUBTASK_COMPLETED_STATUS
        ? (previous.completedAt ?? now)
        : null;
    const updated = await database
      .update(taskSubtasks)
      .set({
        name: subtask.name,
        durationMinutes: subtask.durationMinutes,
        statusKey: subtask.status,
        sortOrder,
        completedAt,
        updatedAt: now,
      })
      .where(
        and(
          eq(taskSubtasks.workspaceId, workspaceId),
          eq(taskSubtasks.taskId, taskId),
          eq(taskSubtasks.id, subtask.id),
          isNull(taskSubtasks.archivedAt),
        ),
      )
      .returning({ id: taskSubtasks.id });
    if (updated.length !== 1) throw new TaskRelationsInvalidError();
  }
  if (additions.length) {
    await database.insert(taskSubtasks).values(
      input.flatMap((subtask, sortOrder) =>
        subtask.id
          ? []
          : [
              {
                workspaceId,
                taskId,
                name: subtask.name,
                durationMinutes: subtask.durationMinutes,
                statusKey: subtask.status,
                sortOrder,
                completedAt:
                  subtask.status === SUBTASK_COMPLETED_STATUS ? now : null,
                createdAt: now,
                updatedAt: now,
              },
            ],
      ),
    );
  }
}

export async function updateWorkspaceTask(
  database: Database,
  context: RequestAuthorizationContext,
  taskId: string,
  input: TaskUpdateInput,
): Promise<Task> {
  const workspaceId = workspaceIdFromContext(context);
  try {
    return await database.transaction(async (transaction) => {
      await requireWorkspacePermissionForUpdate(
        transaction,
        context.user.id,
        workspaceId,
        "workspace:write",
      );
      const existing = await findScopedTaskRow(
        transaction,
        workspaceId,
        taskId,
        true,
      );
      if (!existing) throw new TaskNotFoundError();
      if (existing.archivedAt) throw new TaskArchivedError();
      if (existing.version !== input.version) {
        throw new TaskVersionConflictError();
      }
      if (
        input.boardOrder &&
        !taskBoardOrdersEqual(input.boardOrder, existing.boardOrder)
      ) {
        throw new TaskRelationsInvalidError();
      }
      assertCompletionAllowed(input.status, input.subtasks);
      const project = await validateAndLockProject(
        transaction,
        workspaceId,
        input.projectId,
        existing.projectId,
      );
      await validateAndLockMembers(
        transaction,
        workspaceId,
        input.responsibleUserIds,
      );
      const previousTags = await existingTaskTagIds(
        transaction,
        workspaceId,
        taskId,
      );
      const tagRows = await resolveAndLockTags(
        transaction,
        workspaceId,
        input.tagLabels,
        previousTags,
      );
      const now = new Date();
      const completedAt =
        input.status === TASK_COMPLETED_STATUS
          ? existing.statusKey === TASK_COMPLETED_STATUS
            ? (existing.completedAt ?? now)
            : now
          : null;
      const boardOrder = { ...existing.boardOrder };
      if (existing.statusKey !== input.status) delete boardOrder.status;
      if (existing.priorityKey !== input.priority) delete boardOrder.priority;
      if (existing.projectId !== project.projectId) delete boardOrder.project;
      if (existing.businessId !== project.businessId)
        delete boardOrder.business;
      const taskRows = await transaction
        .update(tasks)
        .set({
          projectId: project.projectId,
          businessId: project.businessId,
          name: input.name,
          description: input.briefing,
          categoryKey: input.category || null,
          priorityKey: input.priority,
          statusKey: input.status,
          dueDate: input.dueDate,
          sortOrder: input.sortOrder ?? existing.sortOrder,
          boardOrder,
          completedAt,
          version: sql`${tasks.version} + 1`,
          updatedAt: now,
        })
        .where(
          and(
            eq(tasks.workspaceId, workspaceId),
            eq(tasks.id, taskId),
            eq(tasks.version, input.version),
          ),
        )
        .returning();
      if (taskRows.length !== 1) throw new TaskVersionConflictError();
      const updated = taskRows[0]!;

      await transaction
        .delete(taskTags)
        .where(
          and(
            eq(taskTags.workspaceId, workspaceId),
            eq(taskTags.taskId, taskId),
          ),
        );
      await transaction
        .delete(taskResponsibles)
        .where(
          and(
            eq(taskResponsibles.workspaceId, workspaceId),
            eq(taskResponsibles.taskId, taskId),
          ),
        );
      await insertTaskRelations(
        transaction,
        workspaceId,
        taskId,
        tagRows,
        input.responsibleUserIds,
      );
      await synchronizeSubtasks(
        transaction,
        workspaceId,
        taskId,
        input.subtasks,
        now,
      );
      const [task] = await hydrateTasks(
        transaction,
        [updated],
        context.user.id,
      );
      if (!task) throw new TaskNotFoundError();
      return task;
    });
  } catch (error) {
    if (
      error instanceof TaskNotFoundError ||
      error instanceof TaskRelationsInvalidError ||
      error instanceof TaskVersionConflictError ||
      error instanceof TaskStateConflictError ||
      error instanceof TaskArchivedError
    ) {
      throw error;
    }
    translateTaskConstraint(error);
  }
}

export async function updateWorkspaceTaskBoard(
  database: Database,
  context: RequestAuthorizationContext,
  input: TaskBoardInput,
): Promise<TaskBoardResult> {
  const workspaceId = workspaceIdFromContext(context);
  const taskIds = input.updates.map(({ id }) => id);
  const boardPositions = input.updates.map(
    ({ columnKey, position }) => `${columnKey}\u0000${position}`,
  );
  if (
    taskIds.length < 1 ||
    taskIds.length > 500 ||
    new Set(taskIds).size !== taskIds.length ||
    new Set(boardPositions).size !== boardPositions.length
  ) {
    throw new TaskRelationsInvalidError();
  }

  try {
    return await database.transaction(async (transaction) => {
      await requireWorkspacePermissionForUpdate(
        transaction,
        context.user.id,
        workspaceId,
        "workspace:write",
      );

      const lockedTasks = await transaction
        .select()
        .from(tasks)
        .where(eq(tasks.workspaceId, workspaceId))
        .orderBy(asc(tasks.id))
        .for("update");

      const taskById = new Map(lockedTasks.map((task) => [task.id, task]));
      for (const update of input.updates) {
        const task = taskById.get(update.id);
        if (!task) throw new TaskNotFoundError();
        if (task.archivedAt) throw new TaskArchivedError();
        if (task.version !== update.version) {
          throw new TaskVersionConflictError();
        }
      }

      const projectById = new Map<
        string,
        {
          projectId: string;
          businessId: string;
          projectArchivedAt: Date | null;
          businessArchivedAt: Date | null;
        }
      >();
      if (input.view === "project") {
        const projectIds = [
          ...new Set(input.updates.map(({ columnKey }) => columnKey)),
        ].sort();
        const projectRows = await transaction
          .select({
            projectId: projects.id,
            businessId: projects.businessId,
            projectArchivedAt: projects.archivedAt,
            businessArchivedAt: businesses.archivedAt,
          })
          .from(projects)
          .innerJoin(businesses, eq(businesses.id, projects.businessId))
          .where(
            and(
              eq(projects.workspaceId, workspaceId),
              inArray(projects.id, projectIds),
            ),
          )
          .orderBy(asc(projects.id))
          .for("update");
        if (projectRows.length !== projectIds.length) {
          throw new TaskRelationsInvalidError();
        }
        for (const project of projectRows) {
          projectById.set(project.projectId, project);
        }
        for (const update of input.updates) {
          const task = taskById.get(update.id)!;
          const project = projectById.get(update.columnKey);
          if (
            !project ||
            ((project.projectArchivedAt || project.businessArchivedAt) &&
              project.projectId !== task.projectId)
          ) {
            throw new TaskRelationsInvalidError();
          }
        }
      }

      if (input.view === "business") {
        for (const update of input.updates) {
          if (taskById.get(update.id)!.businessId !== update.columnKey) {
            throw new TaskRelationsInvalidError();
          }
        }
      }

      if (input.view === "status") {
        const completingTaskIds = input.updates
          .filter(({ columnKey }) => columnKey === TASK_COMPLETED_STATUS)
          .map(({ id }) => id)
          .sort();
        if (completingTaskIds.length) {
          const subtaskRows = await transaction
            .select({
              taskId: taskSubtasks.taskId,
              status: taskSubtasks.statusKey,
            })
            .from(taskSubtasks)
            .where(
              and(
                eq(taskSubtasks.workspaceId, workspaceId),
                inArray(taskSubtasks.taskId, completingTaskIds),
                isNull(taskSubtasks.archivedAt),
              ),
            )
            .orderBy(asc(taskSubtasks.taskId), asc(taskSubtasks.id))
            .for("update");
          const subtasksByTask = new Map<string, string[]>();
          for (const subtask of subtaskRows) {
            const statuses = subtasksByTask.get(subtask.taskId) ?? [];
            statuses.push(subtask.status);
            subtasksByTask.set(subtask.taskId, statuses);
          }
          for (const taskId of completingTaskIds) {
            const statuses = subtasksByTask.get(taskId) ?? [];
            if (
              !statuses.length ||
              statuses.some((status) => status !== SUBTASK_COMPLETED_STATUS)
            ) {
              throw new TaskStateConflictError(
                "Conclua todas as subtarefas antes de concluir a tarefa.",
              );
            }
          }
        }
      }

      const affectedColumns = new Set<string>();
      for (const update of input.updates) {
        affectedColumns.add(
          taskBoardColumnKey(taskById.get(update.id)!, input.view),
        );
        affectedColumns.add(update.columnKey);
      }
      const affectedTaskIds = lockedTasks
        .filter(
          (task) =>
            !task.archivedAt &&
            affectedColumns.has(taskBoardColumnKey(task, input.view)),
        )
        .map(({ id }) => id);
      const receivedTaskIds = new Set(taskIds);
      if (
        affectedTaskIds.length !== receivedTaskIds.size ||
        affectedTaskIds.some((id) => !receivedTaskIds.has(id))
      ) {
        throw new TaskStateConflictError(
          "A pauta foi alterada. Recarregue todas as tarefas das colunas afetadas e tente novamente.",
        );
      }

      const now = new Date();
      const updatedRows: (typeof tasks.$inferSelect)[] = [];
      for (const update of input.updates) {
        const task = taskById.get(update.id)!;
        const boardOrder = {
          ...task.boardOrder,
          [input.view]: update.position,
        };
        const relation = projectById.get(update.columnKey);
        if (
          input.view === "project" &&
          task.businessId !== relation!.businessId
        ) {
          delete boardOrder.business;
        }
        const changedRows = await transaction
          .update(tasks)
          .set({
            boardOrder,
            ...(input.view === "status"
              ? {
                  statusKey: update.columnKey,
                  completedAt:
                    update.columnKey === TASK_COMPLETED_STATUS
                      ? task.statusKey === TASK_COMPLETED_STATUS
                        ? (task.completedAt ?? now)
                        : now
                      : null,
                }
              : {}),
            ...(input.view === "priority"
              ? { priorityKey: update.columnKey }
              : {}),
            ...(input.view === "project"
              ? {
                  projectId: relation!.projectId,
                  businessId: relation!.businessId,
                }
              : {}),
            version: sql`${tasks.version} + 1`,
            updatedAt: now,
          })
          .where(
            and(
              eq(tasks.workspaceId, workspaceId),
              eq(tasks.id, update.id),
              eq(tasks.version, update.version),
              isNull(tasks.archivedAt),
            ),
          )
          .returning();
        if (changedRows.length !== 1) throw new TaskVersionConflictError();
        updatedRows.push(changedRows[0]!);
      }

      const items = await hydrateTasks(
        transaction,
        updatedRows,
        context.user.id,
      );
      if (items.length !== updatedRows.length) {
        throw new TaskRelationsInvalidError();
      }
      return { workspaceId, view: input.view, items };
    });
  } catch (error) {
    if (
      error instanceof TaskNotFoundError ||
      error instanceof TaskRelationsInvalidError ||
      error instanceof TaskVersionConflictError ||
      error instanceof TaskStateConflictError ||
      error instanceof TaskArchivedError
    ) {
      throw error;
    }
    translateTaskConstraint(error);
  }
}

export async function setWorkspaceTaskState(
  database: Database,
  context: RequestAuthorizationContext,
  taskId: string,
  input: TaskStateInput,
): Promise<Task> {
  const workspaceId = workspaceIdFromContext(context);
  return database.transaction(async (transaction) => {
    await requireWorkspacePermissionForUpdate(
      transaction,
      context.user.id,
      workspaceId,
      "workspace:write",
    );
    const existing = await findScopedTaskRow(
      transaction,
      workspaceId,
      taskId,
      true,
    );
    if (!existing) throw new TaskNotFoundError();
    if (existing.archivedAt) throw new TaskArchivedError();

    // O alvo já alcançado é um retry seguro e não depende da versão antiga.
    if (existing.statusKey === input.status) {
      const [current] = await hydrateTasks(
        transaction,
        [existing],
        context.user.id,
      );
      if (!current) throw new TaskNotFoundError();
      return current;
    }
    if (existing.version !== input.version) {
      throw new TaskVersionConflictError();
    }
    if (input.status === TASK_COMPLETED_STATUS) {
      const subtaskRows = await transaction
        .select({ status: taskSubtasks.statusKey })
        .from(taskSubtasks)
        .where(
          and(
            eq(taskSubtasks.workspaceId, workspaceId),
            eq(taskSubtasks.taskId, taskId),
            isNull(taskSubtasks.archivedAt),
          ),
        )
        .orderBy(asc(taskSubtasks.id))
        .for("update");
      if (
        !subtaskRows.length ||
        subtaskRows.some(({ status }) => status !== SUBTASK_COMPLETED_STATUS)
      ) {
        throw new TaskStateConflictError(
          "Conclua todas as subtarefas antes de concluir a tarefa.",
        );
      }
    }
    const now = new Date();
    const boardOrder = { ...existing.boardOrder };
    delete boardOrder.status;
    const changedRows = await transaction
      .update(tasks)
      .set({
        statusKey: input.status,
        completedAt: input.status === TASK_COMPLETED_STATUS ? now : null,
        boardOrder,
        version: sql`${tasks.version} + 1`,
        updatedAt: now,
      })
      .where(
        and(
          eq(tasks.workspaceId, workspaceId),
          eq(tasks.id, taskId),
          eq(tasks.version, input.version),
        ),
      )
      .returning();
    if (changedRows.length !== 1) throw new TaskVersionConflictError();
    const updated = changedRows[0]!;
    const [task] = await hydrateTasks(transaction, [updated], context.user.id);
    if (!task) throw new TaskNotFoundError();
    return task;
  });
}

export async function setWorkspaceSubtaskState(
  database: Database,
  context: RequestAuthorizationContext,
  taskId: string,
  subtaskId: string,
  input: TaskSubtaskStateInput,
): Promise<Task> {
  const workspaceId = workspaceIdFromContext(context);
  return database.transaction(async (transaction) => {
    await requireWorkspacePermissionForUpdate(
      transaction,
      context.user.id,
      workspaceId,
      "workspace:write",
    );
    const taskRow = await findScopedTaskRow(
      transaction,
      workspaceId,
      taskId,
      true,
    );
    if (!taskRow) throw new TaskNotFoundError();
    if (taskRow.archivedAt) throw new TaskArchivedError();
    const subtaskRow = await findScopedSubtaskRow(
      transaction,
      workspaceId,
      taskId,
      subtaskId,
      true,
    );
    if (!subtaskRow) throw new TaskSubtaskNotFoundError();

    // O alvo já alcançado é um retry seguro e não depende da versão antiga.
    if (subtaskRow.statusKey === input.status) {
      const [current] = await hydrateTasks(
        transaction,
        [taskRow],
        context.user.id,
      );
      if (!current) throw new TaskNotFoundError();
      return current;
    }
    if (taskRow.version !== input.version) {
      throw new TaskVersionConflictError();
    }
    if (
      taskRow.statusKey === TASK_COMPLETED_STATUS &&
      input.status === SUBTASK_PENDING_STATUS
    ) {
      throw new TaskStateConflictError(
        "Reabra a tarefa antes de reabrir uma subtarefa.",
      );
    }
    const now = new Date();
    const changedSubtask = await transaction
      .update(taskSubtasks)
      .set({
        statusKey: input.status,
        completedAt: input.status === SUBTASK_COMPLETED_STATUS ? now : null,
        updatedAt: now,
      })
      .where(
        and(
          eq(taskSubtasks.workspaceId, workspaceId),
          eq(taskSubtasks.taskId, taskId),
          eq(taskSubtasks.id, subtaskId),
          isNull(taskSubtasks.archivedAt),
        ),
      )
      .returning({ id: taskSubtasks.id });
    if (changedSubtask.length !== 1) throw new TaskSubtaskNotFoundError();
    const updatedTaskRows = await transaction
      .update(tasks)
      .set({
        version: sql`${tasks.version} + 1`,
        updatedAt: now,
      })
      .where(
        and(
          eq(tasks.workspaceId, workspaceId),
          eq(tasks.id, taskId),
          eq(tasks.version, input.version),
        ),
      )
      .returning();
    if (updatedTaskRows.length !== 1) throw new TaskVersionConflictError();
    const updatedTask = updatedTaskRows[0]!;
    const [task] = await hydrateTasks(
      transaction,
      [updatedTask],
      context.user.id,
    );
    if (!task) throw new TaskNotFoundError();
    return task;
  });
}

export async function archiveWorkspaceTask(
  database: Database,
  context: RequestAuthorizationContext,
  taskId: string,
  version: number,
): Promise<Task> {
  const workspaceId = workspaceIdFromContext(context);
  return database.transaction(async (transaction) => {
    await requireWorkspacePermissionForUpdate(
      transaction,
      context.user.id,
      workspaceId,
      "workspace:write",
    );
    const existing = await findScopedTaskRow(
      transaction,
      workspaceId,
      taskId,
      true,
    );
    if (!existing) throw new TaskNotFoundError();

    // Arquivar novamente é idempotente e retorna o estado atual.
    if (existing.archivedAt) {
      const [current] = await hydrateTasks(
        transaction,
        [existing],
        context.user.id,
      );
      if (!current) throw new TaskNotFoundError();
      return current;
    }
    if (existing.version !== version) throw new TaskVersionConflictError();
    const now = new Date();
    const archivedRows = await transaction
      .update(tasks)
      .set({
        archivedAt: now,
        version: sql`${tasks.version} + 1`,
        updatedAt: now,
      })
      .where(
        and(
          eq(tasks.workspaceId, workspaceId),
          eq(tasks.id, taskId),
          eq(tasks.version, version),
        ),
      )
      .returning();
    if (archivedRows.length !== 1) throw new TaskVersionConflictError();
    const updated = archivedRows[0]!;
    const [task] = await hydrateTasks(transaction, [updated], context.user.id);
    if (!task) throw new TaskNotFoundError();
    return task;
  });
}
