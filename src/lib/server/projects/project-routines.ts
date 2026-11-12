import { randomUUID } from "node:crypto";
import { and, asc, eq, inArray, isNotNull, isNull } from "drizzle-orm";
import type { RequestAuthorizationContext } from "../authorization/workspace-context";
import {
  requireActiveWorkspacePermission,
  requireWorkspacePermissionForUpdate,
} from "../authorization/workspace-context";
import type { Database } from "../db/database";
import {
  deliveryTemplateResponsibles,
  deliveryTemplateSubtasks,
  deliveryTemplateTags,
  deliveryTemplates,
  projectTaskRoutines,
  projects,
  serviceTaskTemplates,
  taskResponsibles,
  tasks,
  taskSubtasks,
  taskTags,
} from "../db/schema";

type RoutineDatabase = Pick<Database, "select" | "insert">;
type SnapshotSubtask = {
  name: string;
  durationMinutes: number;
  status: string;
};

const HORIZON_DAYS = 90;

function addDays(value: string, days: number): string {
  const date = new Date(`${value}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function parseJson<T>(value: string, fallback: T): T {
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function occurrences(
  start: string,
  end: string,
  routine: typeof projectTaskRoutines.$inferSelect,
): string[] {
  const days = parseJson<number[]>(routine.recurrenceDays, []);
  if (routine.recurrenceType === "one_off") return [start];
  const values: string[] = [];
  for (let date = start; date <= end; date = addDays(date, 1)) {
    const parsed = new Date(`${date}T00:00:00.000Z`);
    const weekday = parsed.getUTCDay();
    const dayOfMonth = parsed.getUTCDate();
    const include =
      (routine.recurrenceType === "weekly" && weekday === 0) ||
      (routine.recurrenceType === "monthly" && dayOfMonth === 1) ||
      (routine.recurrenceType === "custom" &&
        routine.recurrenceUnit === "week" &&
        days.includes(weekday)) ||
      (routine.recurrenceType === "custom" &&
        routine.recurrenceUnit === "month" &&
        days.includes(dayOfMonth));
    if (include) values.push(date);
  }
  return values;
}

/** Cria as tarefas ausentes sem alterar ocorrências já realizadas. Pode ser chamada repetidamente. */
export async function materializeProjectRoutinesInTransaction(
  database: RoutineDatabase,
  workspaceId: string,
  project: {
    id: string;
    businessId: string;
    startDate: string;
    endDate: string | null;
  },
  through = addDays(project.startDate, HORIZON_DAYS),
): Promise<void> {
  const limit =
    project.endDate && project.endDate < through ? project.endDate : through;
  const routines = await database
    .select()
    .from(projectTaskRoutines)
    .where(
      and(
        eq(projectTaskRoutines.workspaceId, workspaceId),
        eq(projectTaskRoutines.projectId, project.id),
      ),
    );
  const now = new Date();
  for (const routine of routines) {
    for (const occurrenceDate of occurrences(
      project.startDate,
      limit,
      routine,
    )) {
      const [existing] = await database
        .select({ id: tasks.id })
        .from(tasks)
        .where(
          and(
            eq(tasks.workspaceId, workspaceId),
            eq(tasks.projectRoutineId, routine.id),
            eq(tasks.routineOccurrenceDate, occurrenceDate),
          ),
        )
        .limit(1);
      if (existing) continue;
      const taskId = randomUUID();
      await database.insert(tasks).values({
        id: taskId,
        workspaceId,
        projectId: project.id,
        businessId: project.businessId,
        projectRoutineId: routine.id,
        routineOccurrenceDate: occurrenceDate,
        name: routine.name,
        description: routine.description,
        categoryKey: routine.categoryKey,
        priorityKey: routine.priorityKey,
        statusKey: routine.statusKey,
        dueDate: occurrenceDate,
        sortOrder: 0,
        boardOrder: {},
        createdAt: now,
        updatedAt: now,
      });
      const subtasks = parseJson<SnapshotSubtask[]>(routine.subtasks, []);
      const effectiveSubtasks = subtasks.length
        ? subtasks
        : [
            {
              name: "Concluir entrega",
              durationMinutes: 60,
              status: "pendente",
            },
          ];
      await database.insert(taskSubtasks).values(
        effectiveSubtasks.map((subtask, sortOrder) => ({
          workspaceId,
          taskId,
          name: subtask.name,
          durationMinutes: subtask.durationMinutes,
          statusKey: subtask.status,
          sortOrder,
          createdAt: now,
          updatedAt: now,
        })),
      );
      const tagIds = parseJson<string[]>(routine.tagIds, []);
      if (tagIds.length)
        await database
          .insert(taskTags)
          .values(
            tagIds.map((tagId, sortOrder) => ({
              workspaceId,
              taskId,
              tagId,
              sortOrder,
            })),
          );
      await database
        .insert(taskResponsibles)
        .values({
          workspaceId,
          taskId,
          userId: routine.responsibleUserId,
          sortOrder: 0,
        });
    }
  }
}

/** Copia os modelos do serviço como uma fotografia do contrato/projeto. */
export async function createProjectRoutinesFromServices(
  database: RoutineDatabase,
  workspaceId: string,
  project: {
    id: string;
    businessId: string;
    startDate: string;
    endDate: string | null;
  },
  serviceIds: string[],
  fallbackResponsibleUserId: string,
): Promise<void> {
  const links = await database
    .select()
    .from(serviceTaskTemplates)
    .where(
      and(
        eq(serviceTaskTemplates.workspaceId, workspaceId),
        inArray(serviceTaskTemplates.serviceId, serviceIds),
      ),
    )
    .orderBy(asc(serviceTaskTemplates.sortOrder), asc(serviceTaskTemplates.id));
  if (!links.length) return;
  const deliveryIds = [
    ...new Set(links.map((link) => link.deliveryTemplateId)),
  ];
  const deliveries = await database
    .select()
    .from(deliveryTemplates)
    .where(
      and(
        eq(deliveryTemplates.workspaceId, workspaceId),
        inArray(deliveryTemplates.id, deliveryIds),
        isNull(deliveryTemplates.archivedAt),
      ),
    );
  const byDelivery = new Map(
    deliveries.map((delivery) => [delivery.id, delivery]),
  );
  const [subtasks, tagLinks, responsibleLinks] = await Promise.all([
    database
      .select()
      .from(deliveryTemplateSubtasks)
      .where(
        and(
          eq(deliveryTemplateSubtasks.workspaceId, workspaceId),
          inArray(deliveryTemplateSubtasks.deliveryTemplateId, deliveryIds),
        ),
      )
      .orderBy(asc(deliveryTemplateSubtasks.sortOrder)),
    database
      .select()
      .from(deliveryTemplateTags)
      .where(
        and(
          eq(deliveryTemplateTags.workspaceId, workspaceId),
          inArray(deliveryTemplateTags.deliveryTemplateId, deliveryIds),
        ),
      )
      .orderBy(asc(deliveryTemplateTags.sortOrder)),
    database
      .select()
      .from(deliveryTemplateResponsibles)
      .where(
        and(
          eq(deliveryTemplateResponsibles.workspaceId, workspaceId),
          inArray(deliveryTemplateResponsibles.deliveryTemplateId, deliveryIds),
        ),
      )
      .orderBy(asc(deliveryTemplateResponsibles.sortOrder)),
  ]);
  const now = new Date();
  for (const link of links) {
    const delivery = byDelivery.get(link.deliveryTemplateId);
    if (!delivery) continue;
    const routineId = randomUUID();
    const owner =
      responsibleLinks.find((row) => row.deliveryTemplateId === delivery.id)
        ?.userId ?? fallbackResponsibleUserId;
    const taskSubtasksSnapshot = subtasks
      .filter((row) => row.deliveryTemplateId === delivery.id)
      .map((row) => ({
        name: row.name,
        durationMinutes: row.durationMinutes,
        status: row.defaultStatusKey,
      }));
    const tagIds = tagLinks
      .filter((row) => row.deliveryTemplateId === delivery.id)
      .map((row) => row.tagId);
    await database.insert(projectTaskRoutines).values({
      id: routineId,
      workspaceId,
      projectId: project.id,
      sourceServiceTaskTemplateId: link.id,
      name: link.name,
      description: delivery.description,
      categoryKey: delivery.categoryKey,
      priorityKey: delivery.defaultPriorityKey,
      statusKey: delivery.defaultStatusKey,
      responsibleUserId: owner,
      tagIds: JSON.stringify(tagIds),
      subtasks: JSON.stringify(taskSubtasksSnapshot),
      recurrenceType: link.recurrenceType,
      recurrenceUnit: link.recurrenceUnit,
      recurrenceDays: link.recurrenceDays,
      createdAt: now,
      updatedAt: now,
    });
  }
  await materializeProjectRoutinesInTransaction(database, workspaceId, project);
}

/** Mantém a janela de 90 dias abastecida quando o workspace é aberto. */
export async function materializeWorkspaceProjectRoutines(
  database: Database,
  context: RequestAuthorizationContext,
): Promise<void> {
  const workspaceId = requireActiveWorkspacePermission(
    context,
    "workspace:read",
  ).workspace.id;
  const today = new Date().toISOString().slice(0, 10);
  await database.transaction(async (transaction) => {
    await requireWorkspacePermissionForUpdate(
      transaction,
      context.user.id,
      workspaceId,
      "workspace:write",
    );
    const activeProjects = await transaction
      .select({
        id: projects.id,
        businessId: projects.businessId,
        startDate: projects.startDate,
        endDate: projects.endDate,
      })
      .from(projects)
      .where(
        and(
          eq(projects.workspaceId, workspaceId),
          isNull(projects.archivedAt),
          isNotNull(projects.startDate),
        ),
      );
    for (const project of activeProjects) {
      if (!project.startDate) continue;
      await materializeProjectRoutinesInTransaction(
        transaction,
        workspaceId,
        { ...project, startDate: project.startDate },
        addDays(today, HORIZON_DAYS),
      );
    }
  });
}
