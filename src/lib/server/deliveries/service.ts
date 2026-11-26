import { randomUUID } from "node:crypto";
import {
  and,
  asc,
  count,
  desc,
  eq,
  gte,
  inArray,
  isNotNull,
  isNull,
  lte,
  ne,
  or,
  sql,
  type SQL,
} from "drizzle-orm";
import { affectedRows, type Database } from "../db/database";
import { databaseConstraint, toIsoTimestamp as iso } from "../db/helpers";
import {
  businesses,
  contracts,
  projectDeliveryRoutines,
  projects,
  tags,
  deliveryResponsibles,
  deliveries,
  deliveryTasks,
  deliveryTags,
  users,
  workspaceMembers,
} from "../db/schema";
import {
  INSTITUTIONAL_PROJECT_NAME,
  INSTITUTIONAL_PROJECT_STATUS,
} from "../../projects/institutional";
import {
  INITIAL_DELIVERY_STATUS,
  initialRoutineOccurrenceDate,
  routineAnchorFromDueDate,
  type RecurringDeliveryFrequency,
} from "../projects/project-routines";
import {
  requireWorkspacePermission,
  requireWorkspacePermissionForUpdate,
  workspaceIdFromContext,
  WorkspaceNotFoundError,
  type RequestAuthorizationContext,
} from "../authorization/workspace-context";
import type {
  Delivery,
  DeliveryBoardInput,
  DeliveryBoardResult,
  DeliveryBoardView,
  DeliveryCreateInput,
  DeliveryList,
  DeliveryResponsible,
  DeliveryStateInput,
  DeliveryTask,
  DeliveryTaskMutationInput,
  DeliveryTaskStateInput,
  DeliveryTag,
  DeliveryUpdateInput,
} from "./types";
import {
  TASK_COMPLETED_STATUS,
  TASK_PENDING_STATUS,
  DELIVERY_COMPLETED_STATUS,
} from "./types";
import {
  areAllDeliveryTasksCompleted,
  resolveDeliveryStatusAfterTaskUpdate,
} from "../../deliveries/completion";
import {
  normalizeDeliveryTagLabel,
  deliveryTagKey,
  type DeliveryListQuery,
} from "./validation";
import { touchWorkspaceConfiguration } from "../settings/version";
import { appendDataChangeAuditLog } from "../authorization/audit";

type DeliveryDatabase = Pick<Database, "select" | "insert" | "update" | "delete">;

export class DeliveryNotFoundError extends Error {
  readonly status = 404;

  constructor() {
    super("Tarefa não encontrada.");
    this.name = "DeliveryNotFoundError";
  }
}

export class DeliveryTaskNotFoundError extends Error {
  readonly status = 404;

  constructor() {
    super("Tarefa não encontrada.");
    this.name = "DeliveryTaskNotFoundError";
  }
}

export class DeliveryRelationsInvalidError extends Error {
  readonly status = 400;

  constructor() {
    super("Um ou mais vínculos da tarefa não são válidos.");
    this.name = "DeliveryRelationsInvalidError";
  }
}

export class DeliveryVersionConflictError extends Error {
  readonly status = 409;

  constructor() {
    super(
      "A tarefa foi alterada por outra operação. Recarregue os dados e tente novamente.",
    );
    this.name = "DeliveryVersionConflictError";
  }
}

export class DeliveryStateConflictError extends Error {
  readonly status = 409;

  constructor(message: string) {
    super(message);
    this.name = "DeliveryStateConflictError";
  }
}

export class DeliveryArchivedError extends Error {
  readonly status = 409;

  constructor() {
    super("A tarefa arquivada não pode ser alterada.");
    this.name = "DeliveryArchivedError";
  }
}

function translateDeliveryConstraint(error: unknown): never {
  const constraint = databaseConstraint(error);
  if (constraint === "delivery_responsibles_cronograma_no_overlap") {
    throw new DeliveryStateConflictError(
      "A troca de responsavel cria conflito de horario no Cronograma.",
    );
  }
  if (
    constraint?.includes("workspace_project_business_foreign_key") ||
    constraint?.includes("workspace_business_foreign_key") ||
    constraint?.includes("workspace_member_foreign_key") ||
    constraint?.includes("workspace_tag_foreign_key")
  ) {
    throw new DeliveryRelationsInvalidError();
  }
  throw error;
}

async function findScopedDeliveryRow(
  database: DeliveryDatabase,
  workspaceId: string,
  deliveryId: string,
  lock = false,
): Promise<typeof deliveries.$inferSelect | null> {
  let query = database
    .select()
    .from(deliveries)
    .where(and(eq(deliveries.workspaceId, workspaceId), eq(deliveries.id, deliveryId)))
    .limit(1);
  if (lock) query = query.for("update") as typeof query;
  const [row] = await query;
  return row ?? null;
}

async function findAuthorizedDeliveryRow(
  database: DeliveryDatabase,
  context: RequestAuthorizationContext,
  deliveryId: string,
  permission: "workspace:read" | "workspace:write",
  lock: boolean,
): Promise<typeof deliveries.$inferSelect> {
  const activeWorkspaceId = workspaceIdFromContext(context);
  const checkPermission = lock
    ? requireWorkspacePermissionForUpdate
    : requireWorkspacePermission;
  await checkPermission(
    database,
    context.user.id,
    activeWorkspaceId,
    permission,
  );
  const inActive = await findScopedDeliveryRow(
    database,
    activeWorkspaceId,
    deliveryId,
    lock,
  );
  if (inActive) return inActive;

  const [candidate] = await database
    .select({ workspaceId: deliveries.workspaceId })
    .from(deliveries)
    .where(eq(deliveries.id, deliveryId))
    .limit(1);
  if (!candidate) throw new DeliveryNotFoundError();
  try {
    await checkPermission(
      database,
      context.user.id,
      candidate.workspaceId,
      permission,
    );
  } catch (cause) {
    if (cause instanceof WorkspaceNotFoundError) {
      throw new DeliveryNotFoundError();
    }
    throw cause;
  }
  const scoped = await findScopedDeliveryRow(
    database,
    candidate.workspaceId,
    deliveryId,
    lock,
  );
  if (!scoped) throw new DeliveryNotFoundError();
  return scoped;
}

async function findScopedTaskRow(
  database: DeliveryDatabase,
  workspaceId: string,
  deliveryId: string,
  taskId: string,
  lock = false,
): Promise<typeof deliveryTasks.$inferSelect | null> {
  let query = database
    .select()
    .from(deliveryTasks)
    .where(
      and(
        eq(deliveryTasks.workspaceId, workspaceId),
        eq(deliveryTasks.deliveryId, deliveryId),
        eq(deliveryTasks.id, taskId),
        isNull(deliveryTasks.archivedAt),
      ),
    )
    .limit(1);
  if (lock) query = query.for("update") as typeof query;
  const [row] = await query;
  return row ?? null;
}

async function hydrateDeliveries(
  database: DeliveryDatabase,
  rows: (typeof deliveries.$inferSelect)[],
  viewerUserId: string,
): Promise<Delivery[]> {
  if (!rows.length) return [];
  const workspaceId = rows[0]!.workspaceId;
  const deliveryIds = rows.map(({ id }) => id);
  const projectIds = [...new Set(rows.map(({ projectId }) => projectId))];

  const projectRows = await database
    .select({
      id: projects.id,
      name: projects.name,
      status: projects.statusKey,
      contractType: projects.contractType,
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

  const routineIds = [
    ...new Set(
      rows.flatMap(({ projectRoutineId }) =>
        projectRoutineId ? [projectRoutineId] : [],
      ),
    ),
  ];
  const routineRows = routineIds.length
    ? await database
        .select({
          id: projectDeliveryRoutines.id,
          recurrenceType: projectDeliveryRoutines.recurrenceType,
        })
        .from(projectDeliveryRoutines)
        .where(
          and(
            eq(projectDeliveryRoutines.workspaceId, workspaceId),
            inArray(projectDeliveryRoutines.id, routineIds),
          ),
        )
    : [];
  const recurrenceByRoutineId = new Map(
    routineRows.flatMap(({ id, recurrenceType }) =>
      recurrenceType === "daily" ||
      recurrenceType === "weekly" ||
      recurrenceType === "monthly"
        ? [[id, recurrenceType] as const]
        : [],
    ),
  );

  const taskRows = await database
    .select()
    .from(deliveryTasks)
    .where(
      and(
        eq(deliveryTasks.workspaceId, workspaceId),
        inArray(deliveryTasks.deliveryId, deliveryIds),
        isNull(deliveryTasks.archivedAt),
      ),
    )
    .orderBy(
      asc(deliveryTasks.deliveryId),
      asc(deliveryTasks.sortOrder),
      asc(deliveryTasks.id),
    );

  const tagRows = await database
    .select({
      deliveryId: deliveryTags.deliveryId,
      id: tags.id,
      name: tags.label,
      archivedAt: tags.archivedAt,
    })
    .from(deliveryTags)
    .innerJoin(
      tags,
      and(
        eq(tags.workspaceId, deliveryTags.workspaceId),
        eq(tags.id, deliveryTags.tagId),
      ),
    )
    .where(
      and(
        eq(deliveryTags.workspaceId, workspaceId),
        inArray(deliveryTags.deliveryId, deliveryIds),
      ),
    )
    .orderBy(asc(deliveryTags.deliveryId), asc(deliveryTags.sortOrder), asc(tags.id));

  const responsibleRows = await database
    .select({
      deliveryId: deliveryResponsibles.deliveryId,
      userId: workspaceMembers.userId,
      name: users.name,
      email: users.email,
      avatarUrl: users.avatarUrl,
      role: workspaceMembers.role,
    })
    .from(deliveryResponsibles)
    .innerJoin(
      workspaceMembers,
      and(
        eq(workspaceMembers.workspaceId, deliveryResponsibles.workspaceId),
        eq(workspaceMembers.userId, deliveryResponsibles.userId),
      ),
    )
    .innerJoin(users, eq(users.id, workspaceMembers.userId))
    .where(
      and(
        eq(deliveryResponsibles.workspaceId, workspaceId),
        inArray(deliveryResponsibles.deliveryId, deliveryIds),
      ),
    )
    .orderBy(
      asc(deliveryResponsibles.deliveryId),
      asc(deliveryResponsibles.sortOrder),
      asc(users.id),
    );

  const projectById = new Map(projectRows.map((row) => [row.id, row]));
  const tasksByDelivery = new Map<string, DeliveryTask[]>();
  const tagsByDelivery = new Map<string, DeliveryTag[]>();
  const responsiblesByDelivery = new Map<string, DeliveryResponsible[]>();

  for (const row of taskRows) {
    const item: DeliveryTask = {
      id: row.id,
      name: row.name,
      durationMinutes: row.durationMinutes,
      executionAt: iso(row.executionAt),
      status:
        row.statusKey === TASK_COMPLETED_STATUS
          ? TASK_COMPLETED_STATUS
          : TASK_PENDING_STATUS,
      sortOrder: row.sortOrder,
      completedAt: iso(row.completedAt),
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
    const items = tasksByDelivery.get(row.deliveryId) ?? [];
    items.push(item);
    tasksByDelivery.set(row.deliveryId, items);
  }
  for (const row of tagRows) {
    const items = tagsByDelivery.get(row.deliveryId) ?? [];
    items.push({ id: row.id, name: row.name, archivedAt: iso(row.archivedAt) });
    tagsByDelivery.set(row.deliveryId, items);
  }
  for (const row of responsibleRows) {
    const items = responsiblesByDelivery.get(row.deliveryId) ?? [];
    items.push({
      userId: row.userId,
      name: row.name,
      email: row.email,
      avatarUrl: row.avatarUrl,
      role: row.role,
    });
    responsiblesByDelivery.set(row.deliveryId, items);
  }

  return rows.flatMap((row): Delivery[] => {
    const relation = projectById.get(row.projectId);
    if (!relation) return [];
    const tasks = tasksByDelivery.get(row.id) ?? [];
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
          contractType:
            relation.contractType === "recurring" ? "recurring" : "one_off",
          archivedAt: iso(relation.archivedAt),
        },
        category: row.categoryKey ?? "",
        priority: row.priorityKey,
        status: row.statusKey,
        briefing: row.description,
        dueDate: row.dueDate,
        recurrence: row.projectRoutineId
          ? (recurrenceByRoutineId.get(row.projectRoutineId) ?? null)
          : null,
        engagementType: row.engagementType,
        tags: tagsByDelivery.get(row.id) ?? [],
        responsibles: responsiblesByDelivery.get(row.id) ?? [],
        tasks,
        durationMinutes: tasks.reduce(
          (total, task) => total + task.durationMinutes,
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
  database: DeliveryDatabase,
  workspaceId: string,
  projectId: string,
  previouslyLinkedProjectId?: string,
): Promise<{
  projectId: string;
  businessId: string;
  engagementType: "fee" | "personal";
  isRecurring: boolean;
}> {
  const [row] = await database
    .select({
      projectId: projects.id,
      businessId: projects.businessId,
      engagementType: projects.engagementType,
      contractType: projects.contractType,
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
    throw new DeliveryRelationsInvalidError();
  }
  return {
    projectId: row.projectId,
    businessId: row.businessId,
    engagementType: row.engagementType,
    isRecurring: row.contractType === "recurring",
  };
}

/**
 * The institutional project is deliberately materialized only with its first
 * delivery.  It remains a normal persisted project afterwards, even when its
 * deliveries are moved elsewhere.
 */
async function materializeInstitutionalProject(
  database: DeliveryDatabase,
  workspaceId: string,
  contractId: string,
): Promise<{
  projectId: string;
  businessId: string;
  engagementType: "fee" | "personal";
  isRecurring: boolean;
}> {
  const [contract] = await database
    .select({
      id: contracts.id,
      businessId: contracts.businessId,
      startDate: contracts.startDate,
      endDate: contracts.endDate,
      archivedAt: contracts.archivedAt,
    })
    .from(contracts)
    .where(
      and(eq(contracts.workspaceId, workspaceId), eq(contracts.id, contractId)),
    )
    .limit(1)
    .for("update");
  if (!contract || contract.archivedAt) throw new DeliveryRelationsInvalidError();

  const [existing] = await database
    .select({
      projectId: projects.id,
      businessId: projects.businessId,
      engagementType: projects.engagementType,
      contractType: projects.contractType,
    })
    .from(projects)
    .where(
      and(
        eq(projects.workspaceId, workspaceId),
        eq(projects.contractId, contract.id),
        eq(projects.isInstitutional, true),
      ),
    )
    .limit(1)
    .for("update");
  if (existing) {
    return {
      projectId: existing.projectId,
      businessId: existing.businessId,
      engagementType: existing.engagementType,
      isRecurring: existing.contractType === "recurring",
    };
  }

  const projectId = randomUUID();
  await database.insert(projects).values({
    id: projectId,
    workspaceId,
    businessId: contract.businessId,
    contractId: contract.id,
    isInstitutional: true,
    name: INSTITUTIONAL_PROJECT_NAME,
    statusKey: INSTITUTIONAL_PROJECT_STATUS,
    startDate: contract.startDate,
    endDate: contract.endDate,
    engagementType: "personal",
    contractType: "one_off",
  });
  return {
    projectId,
    businessId: contract.businessId,
    engagementType: "personal",
    isRecurring: false,
  };
}

async function validateAndLockMembers(
  database: DeliveryDatabase,
  workspaceId: string,
  userIds: string[],
): Promise<void> {
  if (userIds.length > 20 || new Set(userIds).size !== userIds.length) {
    throw new DeliveryRelationsInvalidError();
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
  if (rows.length !== userIds.length) throw new DeliveryRelationsInvalidError();
}

async function existingDeliveryTagIds(
  database: DeliveryDatabase,
  workspaceId: string,
  deliveryId: string,
): Promise<Set<string>> {
  const rows = await database
    .select({ tagId: deliveryTags.tagId })
    .from(deliveryTags)
    .where(
      and(eq(deliveryTags.workspaceId, workspaceId), eq(deliveryTags.deliveryId, deliveryId)),
    );
  return new Set(rows.map(({ tagId }) => tagId));
}

async function resolveAndLockTags(
  database: DeliveryDatabase,
  workspaceId: string,
  labels: string[],
  previouslyLinked = new Set<string>(),
): Promise<(typeof tags.$inferSelect)[]> {
  const normalized = labels.map((label) => ({
    key: deliveryTagKey(label),
    label: normalizeDeliveryTagLabel(label),
  }));
  if (
    normalized.length > 30 ||
    normalized.some(({ key }) => !/^[a-z0-9][a-z0-9_-]{0,63}$/u.test(key)) ||
    new Set(normalized.map(({ key }) => key)).size !== normalized.length
  ) {
    throw new DeliveryRelationsInvalidError();
  }
  if (!normalized.length) return [];
  const createdTags = await database
    .insert(tags)
    .values(normalized.map(({ key, label }) => ({ workspaceId, key, label })))
    .onDuplicateKeyUpdate({ set: { key: sql`${tags.key}` } });
  if (affectedRows(createdTags)) {
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
    throw new DeliveryRelationsInvalidError();
  }
  const byKey = new Map(rows.map((row) => [row.key, row]));
  return normalized.map(({ key }) => byKey.get(key)!).filter(Boolean);
}

function deliveryBoardColumnKey(
  delivery: typeof deliveries.$inferSelect,
  view: DeliveryBoardView,
): string {
  if (view === "status") return delivery.statusKey;
  if (view === "priority") return delivery.priorityKey;
  if (view === "business") return delivery.businessId;
  return delivery.projectId;
}

function deliveryBoardOrdersEqual(
  first: Delivery["boardOrder"],
  second: Delivery["boardOrder"],
): boolean {
  return (["status", "priority", "business", "project"] as const).every(
    (view) => first[view] === second[view],
  );
}

async function insertDeliveryRelations(
  database: DeliveryDatabase,
  workspaceId: string,
  deliveryId: string,
  tagRows: (typeof tags.$inferSelect)[],
  responsibleUserIds: string[],
): Promise<void> {
  if (tagRows.length) {
    await database.insert(deliveryTags).values(
      tagRows.map((tag, sortOrder) => ({
        workspaceId,
        deliveryId,
        tagId: tag.id,
        sortOrder,
      })),
    );
  }
  if (responsibleUserIds.length) {
    await database.insert(deliveryResponsibles).values(
      responsibleUserIds.map((userId, sortOrder) => ({
        workspaceId,
        deliveryId,
        userId,
        sortOrder,
      })),
    );
  }
}

async function insertTasks(
  database: DeliveryDatabase,
  workspaceId: string,
  deliveryId: string,
  tasksInput: DeliveryTaskMutationInput[],
  now: Date,
): Promise<void> {
  await database.insert(deliveryTasks).values(
    tasksInput.map((task, sortOrder) => ({
      workspaceId,
      deliveryId,
      name: task.name,
      durationMinutes: task.durationMinutes,
      executionAt: task.executionAt ? new Date(task.executionAt) : null,
      statusKey: task.status,
      sortOrder,
      completedAt: task.status === TASK_COMPLETED_STATUS ? now : null,
      createdAt: now,
      updatedAt: now,
    })),
  );
}

function deliverySearchCondition(query: string): SQL | undefined {
  if (!query) return undefined;
  const pattern = `%${query.replace(/[!%_]/g, (character) => `!${character}`)}%`;
  return or(
    sql<boolean>`${deliveries.name} like ${pattern} escape '!'`,
    sql<boolean>`${deliveries.description} like ${pattern} escape '!'`,
    sql<boolean>`exists (
      select 1 from ${projects}
      where ${projects.workspaceId} = ${deliveries.workspaceId}
        and ${projects.id} = ${deliveries.projectId}
        and ${projects.name} like ${pattern} escape '!'
    )`,
    sql<boolean>`exists (
      select 1 from ${businesses}
      where ${businesses.id} = ${deliveries.businessId}
        and ${businesses.name} like ${pattern} escape '!'
    )`,
    sql<boolean>`exists (
      select 1 from ${deliveryTasks}
      where ${deliveryTasks.workspaceId} = ${deliveries.workspaceId}
        and ${deliveryTasks.deliveryId} = ${deliveries.id}
        and ${deliveryTasks.archivedAt} is null
        and ${deliveryTasks.name} like ${pattern} escape '!'
    )`,
    sql<boolean>`exists (
      select 1 from ${deliveryTags}
      inner join ${tags}
        on ${tags.workspaceId} = ${deliveryTags.workspaceId}
       and ${tags.id} = ${deliveryTags.tagId}
      where ${deliveryTags.workspaceId} = ${deliveries.workspaceId}
        and ${deliveryTags.deliveryId} = ${deliveries.id}
        and ${tags.label} like ${pattern} escape '!'
    )`,
    sql<boolean>`exists (
      select 1 from ${deliveryResponsibles}
      inner join ${users} on ${users.id} = ${deliveryResponsibles.userId}
      where ${deliveryResponsibles.workspaceId} = ${deliveries.workspaceId}
        and ${deliveryResponsibles.deliveryId} = ${deliveries.id}
        and ${users.name} like ${pattern} escape '!'
    )`,
  );
}

function deliveryCommonConditions(
  workspaceId: string,
  query: DeliveryListQuery,
): SQL[] {
  const conditions: SQL[] = [eq(deliveries.workspaceId, workspaceId)];
  if (!query.includeInactiveProjects) {
    conditions.push(sql<boolean>`exists (
      select 1 from ${projects}
      where ${projects.workspaceId} = ${deliveries.workspaceId}
        and ${projects.id} = ${deliveries.projectId}
        and ${projects.isActive}
    )`);
  }
  const search = deliverySearchCondition(query.query);
  if (search) conditions.push(search);
  if (query.businessId) conditions.push(eq(deliveries.businessId, query.businessId));
  if (query.responsibleUserId) {
    conditions.push(sql<boolean>`exists (
      select 1 from ${deliveryResponsibles}
      where ${deliveryResponsibles.workspaceId} = ${deliveries.workspaceId}
        and ${deliveryResponsibles.deliveryId} = ${deliveries.id}
        and ${deliveryResponsibles.userId} = ${query.responsibleUserId}
    )`);
  }
  if (query.tagId) {
    conditions.push(sql<boolean>`exists (
      select 1 from ${deliveryTags}
      where ${deliveryTags.workspaceId} = ${deliveries.workspaceId}
        and ${deliveryTags.deliveryId} = ${deliveries.id}
        and ${deliveryTags.tagId} = ${query.tagId}
    )`);
  }
  if (query.dueFrom) conditions.push(gte(deliveries.dueDate, query.dueFrom));
  if (query.dueTo) conditions.push(lte(deliveries.dueDate, query.dueTo));
  return conditions;
}

function deliveryListConditions(workspaceId: string, query: DeliveryListQuery): SQL[] {
  const conditions = deliveryCommonConditions(workspaceId, query);
  if (query.status) conditions.push(eq(deliveries.statusKey, query.status));
  if (query.category) conditions.push(eq(deliveries.categoryKey, query.category));
  if (query.priority) conditions.push(eq(deliveries.priorityKey, query.priority));
  if (query.projectId) conditions.push(eq(deliveries.projectId, query.projectId));
  if (query.archived === "exclude") conditions.push(isNull(deliveries.archivedAt));
  if (query.archived === "only") conditions.push(isNotNull(deliveries.archivedAt));
  return conditions;
}

function deliveryOrdering(orderBy: DeliveryListQuery["orderBy"]): [SQL, SQL] {
  if (orderBy === "name_asc") {
    return [asc(sql`lower(${deliveries.name})`), asc(deliveries.id)];
  }
  if (orderBy === "name_desc") {
    return [desc(sql`lower(${deliveries.name})`), desc(deliveries.id)];
  }
  if (orderBy === "due_asc") {
    return [sql`${deliveries.dueDate} asc nulls last`, asc(deliveries.id)];
  }
  if (orderBy === "due_desc") {
    return [sql`${deliveries.dueDate} desc nulls last`, desc(deliveries.id)];
  }
  return [desc(deliveries.updatedAt), desc(deliveries.id)];
}

export async function listWorkspaceDeliveries(
  database: Database,
  context: RequestAuthorizationContext,
  query: DeliveryListQuery,
): Promise<DeliveryList> {
  return database.transaction(
    async (transaction) => {
      const workspaceId = query.workspaceId ?? workspaceIdFromContext(context);
      await requireWorkspacePermission(
        transaction,
        context.user.id,
        workspaceId,
        "workspace:read",
      );
      const conditions = deliveryListConditions(workspaceId, query);
      const common = deliveryCommonConditions(workspaceId, query);
      const rows = await transaction
        .select()
        .from(deliveries)
        .where(and(...conditions))
        .orderBy(...deliveryOrdering(query.orderBy))
        .limit(query.pageSize)
        .offset((query.page - 1) * query.pageSize);
      const [totalRow] = await transaction
        .select({ value: count() })
        .from(deliveries)
        .where(and(...conditions));
      const facetRows = await transaction
        .select({
          status: deliveries.statusKey,
          category: deliveries.categoryKey,
          priority: deliveries.priorityKey,
          projectId: deliveries.projectId,
          archived: sql<boolean>`${deliveries.archivedAt} is not null`,
          value: count(),
        })
        .from(deliveries)
        .where(and(...common))
        .groupBy(
          deliveries.statusKey,
          deliveries.categoryKey,
          deliveries.priorityKey,
          deliveries.projectId,
          sql`${deliveries.archivedAt} is not null`,
        );
      const facets: DeliveryList["facets"] = {
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
        items: await hydrateDeliveries(transaction, rows, context.user.id),
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

export async function getWorkspaceDelivery(
  database: Database,
  context: RequestAuthorizationContext,
  deliveryId: string,
): Promise<Delivery> {
  const row = await findAuthorizedDeliveryRow(
    database,
    context,
    deliveryId,
    "workspace:read",
    false,
  );
  const [delivery] = await hydrateDeliveries(database, [row], context.user.id);
  if (!delivery) throw new DeliveryNotFoundError();
  return delivery;
}

async function resolveWorkspaceForDeliveryCreate(
  transaction: DeliveryDatabase,
  actorUserId: string,
  input: Pick<DeliveryCreateInput, "projectId" | "institutionalContractId">,
): Promise<string> {
  let targetWorkspaceId: string | undefined;
  if (input.institutionalContractId) {
    const [contract] = await transaction
      .select({ workspaceId: contracts.workspaceId })
      .from(contracts)
      .where(eq(contracts.id, input.institutionalContractId))
      .limit(1);
    targetWorkspaceId = contract?.workspaceId;
  } else if (input.projectId) {
    const [project] = await transaction
      .select({ workspaceId: projects.workspaceId })
      .from(projects)
      .where(eq(projects.id, input.projectId))
      .limit(1);
    targetWorkspaceId = project?.workspaceId;
  }
  if (!targetWorkspaceId) {
    throw new DeliveryRelationsInvalidError();
  }
  try {
    await requireWorkspacePermissionForUpdate(
      transaction,
      actorUserId,
      targetWorkspaceId,
      "workspace:write",
    );
  } catch (cause) {
    if (cause instanceof WorkspaceNotFoundError) {
      throw new DeliveryRelationsInvalidError();
    }
    throw cause;
  }
  return targetWorkspaceId;
}

export async function createWorkspaceDelivery(
  database: Database,
  context: RequestAuthorizationContext,
  input: DeliveryCreateInput,
): Promise<Delivery> {
  if (input.boardOrder && Object.keys(input.boardOrder).length > 0) {
    throw new DeliveryRelationsInvalidError();
  }
  try {
    return await database.transaction(async (transaction) => {
      const workspaceId = await resolveWorkspaceForDeliveryCreate(
        transaction,
        context.user.id,
        input,
      );
      const created = await createWorkspaceDeliveryInTransaction(
        transaction,
        workspaceId,
        context.user.id,
        input,
      );
      await appendDataChangeAuditLog(
        transaction,
        {
          userId: context.user.id,
          workspaceId,
        },
        {
          action: "delivery.created",
          targetType: "delivery",
          targetId: created.id,
          changes: [
            { field: "name", before: null, after: input.name },
            { field: "status", before: null, after: input.status },
            { field: "priority", before: null, after: input.priority },
            { field: "dueDate", before: null, after: input.dueDate },
          ],
        },
      );
      for (const task of created.tasks) {
        await appendDataChangeAuditLog(
          transaction,
          {
            userId: context.user.id,
            workspaceId,
          },
          {
            action: "task.created",
            targetType: "task",
            targetId: task.id,
            changes: [
              { field: "name", before: null, after: task.name },
              {
                field: "durationMinutes",
                before: null,
                after: task.durationMinutes,
              },
              { field: "status", before: null, after: task.status },
              { field: "sortOrder", before: null, after: task.sortOrder },
            ],
            metadata: { deliveryId: created.id },
          },
        );
      }
      return created;
    });
  } catch (error) {
    if (
      error instanceof DeliveryRelationsInvalidError ||
      error instanceof DeliveryStateConflictError
    ) {
      throw error;
    }
    translateDeliveryConstraint(error);
  }
}

/** Reusable transactional primitive for validated first-party imports. */
export async function createWorkspaceDeliveryInTransaction(
  transaction: DeliveryDatabase,
  workspaceId: string,
  actorUserId: string,
  input: DeliveryCreateInput,
): Promise<Delivery> {
  if (input.boardOrder && Object.keys(input.boardOrder).length > 0) {
    throw new DeliveryRelationsInvalidError();
  }
  const project = input.institutionalContractId
    ? await materializeInstitutionalProject(
        transaction,
        workspaceId,
        input.institutionalContractId,
      )
    : await validateAndLockProject(transaction, workspaceId, input.projectId!);
  if (input.engagementType === "fee" && project.engagementType !== "fee") {
    throw new DeliveryRelationsInvalidError();
  }
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
  const today = now.toISOString().slice(0, 10);
  const id = randomUUID();
  let projectRoutineId: string | undefined;
  let routineOccurrenceDate: string | undefined;
  if (project.isRecurring) {
    const recurrenceType = input.recurrence;
    if (
      recurrenceType !== "daily" &&
      recurrenceType !== "weekly" &&
      recurrenceType !== "monthly"
    ) {
      throw new DeliveryRelationsInvalidError();
    }
    const anchor = routineAnchorFromDueDate(recurrenceType, input.dueDate);
    routineOccurrenceDate = initialRoutineOccurrenceDate(
      recurrenceType,
      input.dueDate,
      today,
    );
    projectRoutineId = randomUUID();
    await transaction.insert(projectDeliveryRoutines).values({
      id: projectRoutineId,
      workspaceId,
      projectId: project.projectId,
      name: input.name,
      description: input.briefing,
      categoryKey: input.category || null,
      priorityKey: input.priority,
      statusKey: INITIAL_DELIVERY_STATUS,
      responsibleUserId: input.responsibleUserIds[0]!,
      tagIds: JSON.stringify(tagRows.map(({ id }) => id)),
      tasks: JSON.stringify(
        input.tasks.map((task) => ({
          name: task.name,
          durationMinutes: task.durationMinutes,
          status: "pendente",
        })),
      ),
      recurrenceType,
      recurrenceUnit: anchor.recurrenceUnit,
      recurrenceDays: anchor.recurrenceDays,
      createdAt: now,
      updatedAt: now,
    });
  }
  await transaction.insert(deliveries).values({
    id,
    workspaceId,
    projectId: project.projectId,
    businessId: project.businessId,
    projectRoutineId,
    routineOccurrenceDate,
    name: input.name,
    description: input.briefing,
    categoryKey: input.category || null,
    priorityKey: input.priority,
    statusKey: input.status,
    dueDate: input.dueDate,
    engagementType: input.engagementType ?? "personal",
    sortOrder: input.sortOrder ?? 0,
    boardOrder: {},
    completedAt: input.status === DELIVERY_COMPLETED_STATUS ? now : null,
    createdAt: now,
    updatedAt: now,
  });
  const [createdRaw] = await transaction
    .select()
    .from(deliveries)
    .where(eq(deliveries.id, id))
    .limit(1);
  if (!createdRaw) throw new Error("A entrega não pôde ser criada.");
  await insertDeliveryRelations(
    transaction,
    workspaceId,
    createdRaw.id,
    tagRows,
    input.responsibleUserIds,
  );
  await insertTasks(
    transaction,
    workspaceId,
    createdRaw.id,
    input.tasks,
    now,
  );
  const [delivery] = await hydrateDeliveries(transaction, [createdRaw], actorUserId);
  if (!delivery) throw new Error("A entrega não pôde ser carregada.");
  return delivery;
}

async function synchronizeTasks(
  database: DeliveryDatabase,
  workspaceId: string,
  deliveryId: string,
  input: DeliveryTaskMutationInput[],
  now: Date,
): Promise<void> {
  const existing = await database
    .select()
    .from(deliveryTasks)
    .where(
      and(
        eq(deliveryTasks.workspaceId, workspaceId),
        eq(deliveryTasks.deliveryId, deliveryId),
        isNull(deliveryTasks.archivedAt),
      ),
    )
    .orderBy(asc(deliveryTasks.id))
    .for("update");
  const existingById = new Map(existing.map((row) => [row.id, row]));
  const requestedIds = input.flatMap(({ id }) => (id ? [id] : []));
  if (
    new Set(requestedIds).size !== requestedIds.length ||
    requestedIds.some((id) => !existingById.has(id))
  ) {
    throw new DeliveryRelationsInvalidError();
  }

  const omittedIds = existing
    .map(({ id }) => id)
    .filter((id) => !requestedIds.includes(id));
  if (omittedIds.length) {
    await database
      .update(deliveryTasks)
      .set({ archivedAt: now, updatedAt: now })
      .where(
        and(
          eq(deliveryTasks.workspaceId, workspaceId),
          eq(deliveryTasks.deliveryId, deliveryId),
          inArray(deliveryTasks.id, omittedIds),
          isNull(deliveryTasks.archivedAt),
        ),
      );
  }

  const additions: DeliveryTaskMutationInput[] = [];
  for (const [sortOrder, task] of input.entries()) {
    if (!task.id) {
      additions.push(task);
      continue;
    }
    const previous = existingById.get(task.id)!;
    const completedAt =
      task.status === TASK_COMPLETED_STATUS
        ? (previous.completedAt ?? now)
        : null;
    const updated = await database
      .update(deliveryTasks)
      .set({
        name: task.name,
        durationMinutes: task.durationMinutes,
        executionAt: task.executionAt ? new Date(task.executionAt) : null,
        statusKey: task.status,
        sortOrder,
        completedAt,
        updatedAt: now,
      })
      .where(
        and(
          eq(deliveryTasks.workspaceId, workspaceId),
          eq(deliveryTasks.deliveryId, deliveryId),
          eq(deliveryTasks.id, task.id),
          isNull(deliveryTasks.archivedAt),
        ),
      );
    if (affectedRows(updated) !== 1) throw new DeliveryRelationsInvalidError();
  }
  if (additions.length) {
    await database.insert(deliveryTasks).values(
      input.flatMap((task, sortOrder) =>
        task.id
          ? []
          : [
              {
                workspaceId,
                deliveryId,
                name: task.name,
                durationMinutes: task.durationMinutes,
                executionAt: task.executionAt
                  ? new Date(task.executionAt)
                  : null,
                statusKey: task.status,
                sortOrder,
                completedAt:
                  task.status === TASK_COMPLETED_STATUS ? now : null,
                createdAt: now,
                updatedAt: now,
              },
            ],
      ),
    );
  }
}

export async function updateWorkspaceDelivery(
  database: Database,
  context: RequestAuthorizationContext,
  deliveryId: string,
  input: DeliveryUpdateInput,
): Promise<Delivery> {
  try {
    return await database.transaction(async (transaction) => {
      const existing = await findAuthorizedDeliveryRow(
        transaction,
        context,
        deliveryId,
        "workspace:write",
        true,
      );
      const workspaceId = existing.workspaceId;
      if (existing.archivedAt) throw new DeliveryArchivedError();
      if (existing.version !== input.version) {
        throw new DeliveryVersionConflictError();
      }
      const [beforeDelivery] = await hydrateDeliveries(
        transaction,
        [existing],
        context.user.id,
      );
      if (!beforeDelivery) throw new DeliveryNotFoundError();
      if (
        input.boardOrder &&
        !deliveryBoardOrdersEqual(input.boardOrder, existing.boardOrder)
      ) {
        throw new DeliveryRelationsInvalidError();
      }
      const effectiveStatus = resolveDeliveryStatusAfterTaskUpdate({
        previousStatus: existing.statusKey,
        requestedStatus: input.status,
        previousTaskStatuses: beforeDelivery.tasks.map(({ status }) => status),
        nextTaskStatuses: input.tasks.map(({ status }) => status),
      });
      const project = await validateAndLockProject(
        transaction,
        workspaceId,
        input.projectId!,
        existing.projectId,
      );
      if (input.engagementType === "fee" && project.engagementType !== "fee") {
        throw new DeliveryRelationsInvalidError();
      }
      await validateAndLockMembers(
        transaction,
        workspaceId,
        input.responsibleUserIds,
      );
      const previousTags = await existingDeliveryTagIds(
        transaction,
        workspaceId,
        deliveryId,
      );
      const tagRows = await resolveAndLockTags(
        transaction,
        workspaceId,
        input.tagLabels,
        previousTags,
      );
      const now = new Date();
      const completedAt =
        effectiveStatus === DELIVERY_COMPLETED_STATUS
          ? existing.statusKey === DELIVERY_COMPLETED_STATUS
            ? (existing.completedAt ?? now)
            : now
          : null;
      const boardOrder = { ...existing.boardOrder };
      if (existing.statusKey !== effectiveStatus) delete boardOrder.status;
      if (existing.priorityKey !== input.priority) delete boardOrder.priority;
      if (existing.projectId !== project.projectId) delete boardOrder.project;
      if (existing.businessId !== project.businessId)
        delete boardOrder.business;
      let nextProjectRoutineId = existing.projectRoutineId;
      let nextRoutineOccurrenceDate = existing.routineOccurrenceDate;
      const today = now.toISOString().slice(0, 10);
      if (project.isRecurring) {
        const requestedRecurrence = input.recurrence;
        if (existing.projectRoutineId) {
          if (input.routinePropagation === "future") {
            const [currentRoutine] = await transaction
              .select({
                recurrenceType: projectDeliveryRoutines.recurrenceType,
              })
              .from(projectDeliveryRoutines)
              .where(
                and(
                  eq(projectDeliveryRoutines.workspaceId, workspaceId),
                  eq(projectDeliveryRoutines.id, existing.projectRoutineId),
                ),
              )
              .limit(1)
              .for("update");
            const fallbackRecurrence: RecurringDeliveryFrequency =
              currentRoutine?.recurrenceType === "daily" ||
              currentRoutine?.recurrenceType === "weekly" ||
              currentRoutine?.recurrenceType === "monthly"
                ? currentRoutine.recurrenceType
                : "weekly";
            const nextRecurrenceType: RecurringDeliveryFrequency =
              requestedRecurrence ?? fallbackRecurrence;
            const anchor = routineAnchorFromDueDate(
              nextRecurrenceType,
              input.dueDate,
            );
            await transaction
              .update(projectDeliveryRoutines)
              .set({
                projectId: project.projectId,
                name: input.name,
                description: input.briefing,
                categoryKey: input.category || null,
                responsibleUserId: input.responsibleUserIds[0]!,
                tagIds: JSON.stringify(tagRows.map(({ id }) => id)),
                tasks: JSON.stringify(
                  input.tasks.map((task) => ({
                    name: task.name,
                    durationMinutes: task.durationMinutes,
                    status: "pendente",
                  })),
                ),
                recurrenceType: nextRecurrenceType,
                recurrenceUnit: anchor.recurrenceUnit,
                recurrenceDays: anchor.recurrenceDays,
                updatedAt: now,
              })
              .where(
                and(
                  eq(projectDeliveryRoutines.workspaceId, workspaceId),
                  eq(projectDeliveryRoutines.id, existing.projectRoutineId),
                ),
              );
            const candidateOccurrence = initialRoutineOccurrenceDate(
              nextRecurrenceType,
              input.dueDate,
              today,
            );
            if (candidateOccurrence !== existing.routineOccurrenceDate) {
              const [collision] = await transaction
                .select({ id: deliveries.id })
                .from(deliveries)
                .where(
                  and(
                    eq(deliveries.workspaceId, workspaceId),
                    eq(deliveries.projectRoutineId, existing.projectRoutineId),
                    eq(deliveries.routineOccurrenceDate, candidateOccurrence),
                    ne(deliveries.id, deliveryId),
                  ),
                )
                .limit(1);
              if (!collision) {
                nextRoutineOccurrenceDate = candidateOccurrence;
              }
            }
          }
        } else {
          if (
            requestedRecurrence !== "daily" &&
            requestedRecurrence !== "weekly" &&
            requestedRecurrence !== "monthly"
          ) {
            throw new DeliveryRelationsInvalidError();
          }
          const anchor = routineAnchorFromDueDate(
            requestedRecurrence,
            input.dueDate,
          );
          nextRoutineOccurrenceDate = initialRoutineOccurrenceDate(
            requestedRecurrence,
            input.dueDate,
            today,
          );
          nextProjectRoutineId = randomUUID();
          await transaction.insert(projectDeliveryRoutines).values({
            id: nextProjectRoutineId,
            workspaceId,
            projectId: project.projectId,
            name: input.name,
            description: input.briefing,
            categoryKey: input.category || null,
            priorityKey: input.priority,
            statusKey: INITIAL_DELIVERY_STATUS,
            responsibleUserId: input.responsibleUserIds[0]!,
            tagIds: JSON.stringify(tagRows.map(({ id }) => id)),
            tasks: JSON.stringify(
              input.tasks.map((task) => ({
                name: task.name,
                durationMinutes: task.durationMinutes,
                status: "pendente",
              })),
            ),
            recurrenceType: requestedRecurrence,
            recurrenceUnit: anchor.recurrenceUnit,
            recurrenceDays: anchor.recurrenceDays,
            createdAt: now,
            updatedAt: now,
          });
        }
      } else {
        nextProjectRoutineId = null;
        nextRoutineOccurrenceDate = null;
      }
      const deliveryRows = await transaction
        .update(deliveries)
        .set({
          projectId: project.projectId,
          businessId: project.businessId,
          projectRoutineId: nextProjectRoutineId,
          routineOccurrenceDate: nextRoutineOccurrenceDate,
          name: input.name,
          description: input.briefing,
          categoryKey: input.category || null,
          priorityKey: input.priority,
          statusKey: effectiveStatus,
          dueDate: input.dueDate,
          engagementType: input.engagementType ?? "personal",
          sortOrder: input.sortOrder ?? existing.sortOrder,
          boardOrder,
          completedAt,
          version: sql`${deliveries.version} + 1`,
          updatedAt: now,
        })
        .where(
          and(
            eq(deliveries.workspaceId, workspaceId),
            eq(deliveries.id, deliveryId),
            eq(deliveries.version, input.version),
          ),
        );
      if (affectedRows(deliveryRows) !== 1) throw new DeliveryVersionConflictError();
      await appendDataChangeAuditLog(
        transaction,
        {
          userId: context.user.id,
          workspaceId,
        },
        {
          action: "delivery.updated",
          targetType: "delivery",
          targetId: deliveryId,
          changes: [
            { field: "name", before: existing.name, after: input.name },
            {
              field: "briefing",
              before: existing.description,
              after: input.briefing,
            },
            {
              field: "category",
              before: existing.categoryKey,
              after: input.category || null,
            },
            {
              field: "priority",
              before: existing.priorityKey,
              after: input.priority,
            },
            {
              field: "status",
              before: existing.statusKey,
              after: effectiveStatus,
            },
            {
              field: "dueDate",
              before: existing.dueDate,
              after: input.dueDate,
            },
          ].filter((change) => change.before !== change.after),
        },
      );
      const [updated] = await transaction
        .select()
        .from(deliveries)
        .where(eq(deliveries.id, deliveryId))
        .limit(1);
      if (!updated) throw new DeliveryNotFoundError();

      await transaction
        .delete(deliveryTags)
        .where(
          and(
            eq(deliveryTags.workspaceId, workspaceId),
            eq(deliveryTags.deliveryId, deliveryId),
          ),
        );
      await transaction
        .delete(deliveryResponsibles)
        .where(
          and(
            eq(deliveryResponsibles.workspaceId, workspaceId),
            eq(deliveryResponsibles.deliveryId, deliveryId),
          ),
        );
      await insertDeliveryRelations(
        transaction,
        workspaceId,
        deliveryId,
        tagRows,
        input.responsibleUserIds,
      );
      await synchronizeTasks(
        transaction,
        workspaceId,
        deliveryId,
        input.tasks,
        now,
      );
      const [delivery] = await hydrateDeliveries(
        transaction,
        [updated],
        context.user.id,
      );
      if (!delivery) throw new DeliveryNotFoundError();
      const previousTasks = new Map(
        beforeDelivery.tasks.map((task) => [task.id, task]),
      );
      const nextTasks = new Map(
        delivery.tasks.map((task) => [task.id, task]),
      );
      for (const task of delivery.tasks) {
        const previous = previousTasks.get(task.id);
        await appendDataChangeAuditLog(
          transaction,
          {
            userId: context.user.id,
            workspaceId,
          },
          {
            action: previous ? "task.updated" : "task.created",
            targetType: "task",
            targetId: task.id,
            changes: [
              {
                field: "name",
                before: previous?.name ?? null,
                after: task.name,
              },
              {
                field: "durationMinutes",
                before: previous?.durationMinutes ?? null,
                after: task.durationMinutes,
              },
              {
                field: "status",
                before: previous?.status ?? null,
                after: task.status,
              },
              {
                field: "sortOrder",
                before: previous?.sortOrder ?? null,
                after: task.sortOrder,
              },
            ].filter((change) => change.before !== change.after),
            metadata: { deliveryId },
          },
        );
      }
      for (const previous of beforeDelivery.tasks) {
        if (nextTasks.has(previous.id)) continue;
        await appendDataChangeAuditLog(
          transaction,
          {
            userId: context.user.id,
            workspaceId,
          },
          {
            action: "task.archived",
            targetType: "task",
            targetId: previous.id,
            changes: [{ field: "archived", before: false, after: true }],
            metadata: { deliveryId },
          },
        );
      }
      return delivery;
    });
  } catch (error) {
    if (
      error instanceof DeliveryNotFoundError ||
      error instanceof DeliveryRelationsInvalidError ||
      error instanceof DeliveryVersionConflictError ||
      error instanceof DeliveryStateConflictError ||
      error instanceof DeliveryArchivedError
    ) {
      throw error;
    }
    translateDeliveryConstraint(error);
  }
}

export async function updateWorkspaceDeliveryBoard(
  database: Database,
  context: RequestAuthorizationContext,
  input: DeliveryBoardInput,
): Promise<DeliveryBoardResult> {
  const activeWorkspaceId = workspaceIdFromContext(context);
  const deliveryIds = input.updates.map(({ id }) => id);
  const boardPositions = input.updates.map(
    ({ columnKey, position }) => `${columnKey}\u0000${position}`,
  );
  if (
    deliveryIds.length < 1 ||
    deliveryIds.length > 500 ||
    new Set(deliveryIds).size !== deliveryIds.length ||
    new Set(boardPositions).size !== boardPositions.length
  ) {
    throw new DeliveryRelationsInvalidError();
  }

  try {
    return await database.transaction(async (transaction) => {
      await requireWorkspacePermissionForUpdate(
        transaction,
        context.user.id,
        activeWorkspaceId,
        "workspace:write",
      );

      const candidateRows = await transaction
        .select({ id: deliveries.id, workspaceId: deliveries.workspaceId })
        .from(deliveries)
        .where(inArray(deliveries.id, deliveryIds));
      if (candidateRows.length !== deliveryIds.length) {
        throw new DeliveryNotFoundError();
      }
      const targetWorkspaceIds = new Set(
        candidateRows.map(({ workspaceId }) => workspaceId),
      );
      if (targetWorkspaceIds.size !== 1) {
        throw new DeliveryNotFoundError();
      }
      const [workspaceId] = targetWorkspaceIds;
      if (!workspaceId) throw new DeliveryNotFoundError();
      if (workspaceId !== activeWorkspaceId) {
        try {
          await requireWorkspacePermissionForUpdate(
            transaction,
            context.user.id,
            workspaceId,
            "workspace:write",
          );
        } catch (cause) {
          if (cause instanceof WorkspaceNotFoundError) {
            throw new DeliveryNotFoundError();
          }
          throw cause;
        }
      }

      const lockedDeliveries = await transaction
        .select()
        .from(deliveries)
        .where(eq(deliveries.workspaceId, workspaceId))
        .orderBy(asc(deliveries.id))
        .for("update");

      const deliveryById = new Map(lockedDeliveries.map((delivery) => [delivery.id, delivery]));
      for (const update of input.updates) {
        const delivery = deliveryById.get(update.id);
        if (!delivery) throw new DeliveryNotFoundError();
        if (delivery.archivedAt) throw new DeliveryArchivedError();
        if (delivery.version !== update.version) {
          throw new DeliveryVersionConflictError();
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
          throw new DeliveryRelationsInvalidError();
        }
        for (const project of projectRows) {
          projectById.set(project.projectId, project);
        }
        for (const update of input.updates) {
          const delivery = deliveryById.get(update.id)!;
          const project = projectById.get(update.columnKey);
          if (
            !project ||
            ((project.projectArchivedAt || project.businessArchivedAt) &&
              project.projectId !== delivery.projectId)
          ) {
            throw new DeliveryRelationsInvalidError();
          }
        }
      }

      if (input.view === "business") {
        for (const update of input.updates) {
          if (deliveryById.get(update.id)!.businessId !== update.columnKey) {
            throw new DeliveryRelationsInvalidError();
          }
        }
      }

      const activeProjectRows = await transaction
        .select({ id: projects.id })
        .from(projects)
        .where(
          and(
            eq(projects.workspaceId, workspaceId),
            eq(projects.isActive, true),
          ),
        );
      const activeProjectIds = new Set(activeProjectRows.map(({ id }) => id));

      const affectedColumns = new Set<string>();
      for (const update of input.updates) {
        affectedColumns.add(
          deliveryBoardColumnKey(deliveryById.get(update.id)!, input.view),
        );
        affectedColumns.add(update.columnKey);
      }
      const receivedDeliveryIds = new Set(deliveryIds);
      const affectedDeliveryIds = lockedDeliveries
        .filter(
          (delivery) =>
            !delivery.archivedAt &&
            (activeProjectIds.has(delivery.projectId) ||
              receivedDeliveryIds.has(delivery.id)) &&
            affectedColumns.has(deliveryBoardColumnKey(delivery, input.view)),
        )
        .map(({ id }) => id);
      if (
        affectedDeliveryIds.length !== receivedDeliveryIds.size ||
        affectedDeliveryIds.some((id) => !receivedDeliveryIds.has(id))
      ) {
        throw new DeliveryStateConflictError(
          "A pauta foi alterada. Recarregue todas as tarefas das colunas afetadas e tente novamente.",
        );
      }

      const now = new Date();
      const updatedRows: (typeof deliveries.$inferSelect)[] = [];
      for (const update of input.updates) {
        const delivery = deliveryById.get(update.id)!;
        const boardOrder = {
          ...delivery.boardOrder,
          [input.view]: update.position,
        };
        const relation = projectById.get(update.columnKey);
        if (
          input.view === "project" &&
          delivery.businessId !== relation!.businessId
        ) {
          delete boardOrder.business;
        }
        const changedRows = await transaction
          .update(deliveries)
          .set({
            boardOrder,
            ...(input.view === "status"
              ? {
                  statusKey: update.columnKey,
                  completedAt:
                    update.columnKey === DELIVERY_COMPLETED_STATUS
                      ? delivery.statusKey === DELIVERY_COMPLETED_STATUS
                        ? (delivery.completedAt ?? now)
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
            version: sql`${deliveries.version} + 1`,
            updatedAt: now,
          })
          .where(
            and(
              eq(deliveries.workspaceId, workspaceId),
              eq(deliveries.id, update.id),
              eq(deliveries.version, update.version),
              isNull(deliveries.archivedAt),
            ),
          );
        if (affectedRows(changedRows) !== 1)
          throw new DeliveryVersionConflictError();
        await appendDataChangeAuditLog(
          transaction,
          {
            userId: context.user.id,
            workspaceId,
          },
          {
            action: `delivery.board_${input.view}_changed`,
            targetType: "delivery",
            targetId: update.id,
            changes: [
              {
                field: `${input.view}Position`,
                before: delivery.boardOrder[input.view] ?? 0,
                after: update.position,
              },
              ...(input.view === "status"
                ? [
                    {
                      field: "status",
                      before: delivery.statusKey,
                      after: update.columnKey,
                    },
                  ]
                : []),
              ...(input.view === "priority"
                ? [
                    {
                      field: "priority",
                      before: delivery.priorityKey,
                      after: update.columnKey,
                    },
                  ]
                : []),
              ...(input.view === "project"
                ? [
                    {
                      field: "projectId",
                      before: delivery.projectId,
                      after: relation!.projectId,
                    },
                  ]
                : []),
            ].filter((change) => change.before !== change.after),
          },
        );
        const [changed] = await transaction
          .select()
          .from(deliveries)
          .where(eq(deliveries.id, update.id))
          .limit(1);
        if (!changed) throw new DeliveryNotFoundError();
        updatedRows.push(changed);
      }

      const items = await hydrateDeliveries(
        transaction,
        updatedRows,
        context.user.id,
      );
      if (items.length !== updatedRows.length) {
        throw new DeliveryRelationsInvalidError();
      }
      return { workspaceId, view: input.view, items };
    });
  } catch (error) {
    if (
      error instanceof DeliveryNotFoundError ||
      error instanceof DeliveryRelationsInvalidError ||
      error instanceof DeliveryVersionConflictError ||
      error instanceof DeliveryStateConflictError ||
      error instanceof DeliveryArchivedError
    ) {
      throw error;
    }
    translateDeliveryConstraint(error);
  }
}

export async function setWorkspaceDeliveryState(
  database: Database,
  context: RequestAuthorizationContext,
  deliveryId: string,
  input: DeliveryStateInput,
): Promise<Delivery> {
  const workspaceId = workspaceIdFromContext(context);
  return database.transaction(async (transaction) => {
    await requireWorkspacePermissionForUpdate(
      transaction,
      context.user.id,
      workspaceId,
      "workspace:write",
    );
    const existing = await findScopedDeliveryRow(
      transaction,
      workspaceId,
      deliveryId,
      true,
    );
    if (!existing) throw new DeliveryNotFoundError();
    if (existing.archivedAt) throw new DeliveryArchivedError();

    // O alvo já alcançado é um retry seguro e não depende da versão antiga.
    if (existing.statusKey === input.status) {
      const [current] = await hydrateDeliveries(
        transaction,
        [existing],
        context.user.id,
      );
      if (!current) throw new DeliveryNotFoundError();
      return current;
    }
    if (existing.version !== input.version) {
      throw new DeliveryVersionConflictError();
    }
    const now = new Date();
    const boardOrder = { ...existing.boardOrder };
    delete boardOrder.status;
    const changedRows = await transaction
      .update(deliveries)
      .set({
        statusKey: input.status,
        completedAt: input.status === DELIVERY_COMPLETED_STATUS ? now : null,
        boardOrder,
        version: sql`${deliveries.version} + 1`,
        updatedAt: now,
      })
      .where(
        and(
          eq(deliveries.workspaceId, workspaceId),
          eq(deliveries.id, deliveryId),
          eq(deliveries.version, input.version),
        ),
      );
    if (affectedRows(changedRows) !== 1) throw new DeliveryVersionConflictError();
    await appendDataChangeAuditLog(
      transaction,
      {
        userId: context.user.id,
        workspaceId,
      },
      {
        action: "delivery.status_changed",
        targetType: "delivery",
        targetId: deliveryId,
        changes: [
          { field: "status", before: existing.statusKey, after: input.status },
          {
            field: "completedAt",
            before: existing.completedAt?.toISOString() ?? null,
            after:
              input.status === DELIVERY_COMPLETED_STATUS ? now.toISOString() : null,
          },
        ],
      },
    );
    const [updated] = await transaction
      .select()
      .from(deliveries)
      .where(eq(deliveries.id, deliveryId))
      .limit(1);
    if (!updated) throw new DeliveryNotFoundError();
    const [delivery] = await hydrateDeliveries(transaction, [updated], context.user.id);
    if (!delivery) throw new DeliveryNotFoundError();
    return delivery;
  });
}

export async function setWorkspaceTaskState(
  database: Database,
  context: RequestAuthorizationContext,
  deliveryId: string,
  taskId: string,
  input: DeliveryTaskStateInput,
): Promise<Delivery> {
  const workspaceId = workspaceIdFromContext(context);
  return database.transaction(async (transaction) => {
    await requireWorkspacePermissionForUpdate(
      transaction,
      context.user.id,
      workspaceId,
      "workspace:write",
    );
    const deliveryRow = await findScopedDeliveryRow(
      transaction,
      workspaceId,
      deliveryId,
      true,
    );
    if (!deliveryRow) throw new DeliveryNotFoundError();
    if (deliveryRow.archivedAt) throw new DeliveryArchivedError();
    const taskRow = await findScopedTaskRow(
      transaction,
      workspaceId,
      deliveryId,
      taskId,
      true,
    );
    if (!taskRow) throw new DeliveryTaskNotFoundError();

    // O alvo já alcançado é um retry seguro e não depende da versão antiga.
    if (taskRow.statusKey === input.status) {
      const [current] = await hydrateDeliveries(
        transaction,
        [deliveryRow],
        context.user.id,
      );
      if (!current) throw new DeliveryNotFoundError();
      return current;
    }
    if (deliveryRow.version !== input.version) {
      throw new DeliveryVersionConflictError();
    }
    const now = new Date();
    const changedTask = await transaction
      .update(deliveryTasks)
      .set({
        statusKey: input.status,
        completedAt: input.status === TASK_COMPLETED_STATUS ? now : null,
        updatedAt: now,
      })
      .where(
        and(
          eq(deliveryTasks.workspaceId, workspaceId),
          eq(deliveryTasks.deliveryId, deliveryId),
          eq(deliveryTasks.id, taskId),
          isNull(deliveryTasks.archivedAt),
        ),
      );
    if (affectedRows(changedTask) !== 1)
      throw new DeliveryTaskNotFoundError();
    let autoCompletedDelivery = false;
    if (
      input.status === TASK_COMPLETED_STATUS &&
      deliveryRow.statusKey !== DELIVERY_COMPLETED_STATUS
    ) {
      const deliveryTaskRows = await transaction
        .select({ status: deliveryTasks.statusKey })
        .from(deliveryTasks)
        .where(
          and(
            eq(deliveryTasks.workspaceId, workspaceId),
            eq(deliveryTasks.deliveryId, deliveryId),
            isNull(deliveryTasks.archivedAt),
          ),
        )
        .orderBy(asc(deliveryTasks.id))
        .for("update");
      autoCompletedDelivery = areAllDeliveryTasksCompleted(
        deliveryTaskRows.map(({ status }) => status),
      );
    }
    const nextBoardOrder = { ...deliveryRow.boardOrder };
    if (autoCompletedDelivery) delete nextBoardOrder.status;
    const updatedDeliveryRows = await transaction
      .update(deliveries)
      .set({
        ...(autoCompletedDelivery
          ? {
              statusKey: DELIVERY_COMPLETED_STATUS,
              completedAt: now,
              boardOrder: nextBoardOrder,
            }
          : {}),
        version: sql`${deliveries.version} + 1`,
        updatedAt: now,
      })
      .where(
        and(
          eq(deliveries.workspaceId, workspaceId),
          eq(deliveries.id, deliveryId),
          eq(deliveries.version, input.version),
        ),
      );
    if (affectedRows(updatedDeliveryRows) !== 1)
      throw new DeliveryVersionConflictError();
    await appendDataChangeAuditLog(
      transaction,
      {
        userId: context.user.id,
        workspaceId,
      },
      {
        action: "task.status_changed",
        targetType: "task",
        targetId: taskId,
        changes: [
          {
            field: "status",
            before: taskRow.statusKey,
            after: input.status,
          },
          {
            field: "completedAt",
            before: taskRow.completedAt?.toISOString() ?? null,
            after:
              input.status === TASK_COMPLETED_STATUS
                ? now.toISOString()
                : null,
          },
        ],
        metadata: { deliveryId },
      },
    );
    if (autoCompletedDelivery) {
      await appendDataChangeAuditLog(
        transaction,
        {
          userId: context.user.id,
          workspaceId,
        },
        {
          action: "delivery.status_changed",
          targetType: "delivery",
          targetId: deliveryId,
          changes: [
            {
              field: "status",
              before: deliveryRow.statusKey,
              after: DELIVERY_COMPLETED_STATUS,
            },
            {
              field: "completedAt",
              before: deliveryRow.completedAt?.toISOString() ?? null,
              after: now.toISOString(),
            },
          ],
          metadata: { reason: "all_tasks_completed" },
        },
      );
    }
    const [updatedDelivery] = await transaction
      .select()
      .from(deliveries)
      .where(eq(deliveries.id, deliveryId))
      .limit(1);
    if (!updatedDelivery) throw new DeliveryNotFoundError();
    const [delivery] = await hydrateDeliveries(
      transaction,
      [updatedDelivery],
      context.user.id,
    );
    if (!delivery) throw new DeliveryNotFoundError();
    return delivery;
  });
}

export async function archiveWorkspaceDelivery(
  database: Database,
  context: RequestAuthorizationContext,
  deliveryId: string,
  version: number,
): Promise<Delivery> {
  return database.transaction(async (transaction) => {
    const existing = await findAuthorizedDeliveryRow(
      transaction,
      context,
      deliveryId,
      "workspace:write",
      true,
    );
    const workspaceId = existing.workspaceId;

    // Arquivar novamente é idempotente e retorna o estado atual.
    if (existing.archivedAt) {
      const [current] = await hydrateDeliveries(
        transaction,
        [existing],
        context.user.id,
      );
      if (!current) throw new DeliveryNotFoundError();
      return current;
    }
    if (existing.version !== version) throw new DeliveryVersionConflictError();
    const now = new Date();
    const archivedRows = await transaction
      .update(deliveries)
      .set({
        archivedAt: now,
        version: sql`${deliveries.version} + 1`,
        updatedAt: now,
      })
      .where(
        and(
          eq(deliveries.workspaceId, workspaceId),
          eq(deliveries.id, deliveryId),
          eq(deliveries.version, version),
        ),
      );
    if (affectedRows(archivedRows) !== 1) throw new DeliveryVersionConflictError();
    await appendDataChangeAuditLog(
      transaction,
      {
        userId: context.user.id,
        workspaceId,
      },
      {
        action: "delivery.archived",
        targetType: "delivery",
        targetId: deliveryId,
        changes: [
          { field: "archivedAt", before: null, after: now.toISOString() },
        ],
      },
    );
    const [updated] = await transaction
      .select()
      .from(deliveries)
      .where(eq(deliveries.id, deliveryId))
      .limit(1);
    if (!updated) throw new DeliveryNotFoundError();
    const [delivery] = await hydrateDeliveries(transaction, [updated], context.user.id);
    if (!delivery) throw new DeliveryNotFoundError();
    return delivery;
  });
}

export async function deleteWorkspaceDelivery(
  database: Database,
  context: RequestAuthorizationContext,
  deliveryId: string,
  version: number,
): Promise<void> {
  await database.transaction(async (transaction) => {
    const existing = await findAuthorizedDeliveryRow(
      transaction,
      context,
      deliveryId,
      "workspace:write",
      true,
    );
    const workspaceId = existing.workspaceId;
    if (existing.version !== version) throw new DeliveryVersionConflictError();
    const deleted = await transaction
      .delete(deliveries)
      .where(
        and(
          eq(deliveries.workspaceId, workspaceId),
          eq(deliveries.id, deliveryId),
          eq(deliveries.version, version),
        ),
      );
    if (affectedRows(deleted) !== 1) throw new DeliveryVersionConflictError();
    await appendDataChangeAuditLog(
      transaction,
      {
        userId: context.user.id,
        workspaceId,
      },
      {
        action: "delivery.deleted",
        targetType: "delivery",
        targetId: deliveryId,
        changes: [{ field: "deleted", before: false, after: true }],
      },
    );
  });
}
