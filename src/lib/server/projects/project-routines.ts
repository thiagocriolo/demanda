import { randomUUID } from "node:crypto";
import { and, asc, eq, inArray, isNotNull, isNull, lt } from "drizzle-orm";
import type { RequestAuthorizationContext } from "../authorization/workspace-context";
import {
  requireActiveWorkspacePermission,
  requireWorkspacePermissionForUpdate,
} from "../authorization/workspace-context";
import type { Database } from "../db/database";
import {
  deliveryTemplateResponsibles,
  deliveryTemplateTasks,
  deliveryTemplateTags,
  deliveryTemplates,
  contracts,
  projectDeliveryRoutines,
  projects,
  serviceDeliveryTemplates,
  deliveryResponsibles,
  deliveries,
  deliveryTasks,
  deliveryTags,
} from "../db/schema";

type RoutineDatabase = Pick<Database, "select" | "insert" | "update">;
type SnapshotTask = {
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

function daysBetween(start: string, end: string): number {
  return Math.floor(
    (Date.parse(`${end}T00:00:00.000Z`) -
      Date.parse(`${start}T00:00:00.000Z`)) /
      86_400_000,
  );
}

function contractWeekStart(startDate: string, week: number): string {
  return addDays(startDate, (week - 1) * 7);
}

function contractWeekNumber(startDate: string, date: string): number {
  return Math.max(1, Math.floor(daysBetween(startDate, date) / 7) + 1);
}

type InstitutionalRecurrence = "one_off" | "daily" | "weekly" | "monthly";

function lastBusinessDayOfMonth(year: number, month: number): string {
  const date = new Date(Date.UTC(year, month + 1, 0));
  while (date.getUTCDay() === 0 || date.getUTCDay() === 6) {
    date.setUTCDate(date.getUTCDate() - 1);
  }
  return date.toISOString().slice(0, 10);
}

/** Returns the active cycle date without using `deliveries.due_date`.
 * Institutional deliveries deliberately remain outside the Agenda. */
export function institutionalOccurrenceDate(
  recurrenceType: InstitutionalRecurrence,
  today: string,
): string {
  if (recurrenceType === "daily") return today;
  if (recurrenceType === "weekly") {
    const current = new Date(`${today}T00:00:00.000Z`);
    return addDays(today, (5 - current.getUTCDay() + 7) % 7);
  }
  if (recurrenceType === "monthly") {
    const current = new Date(`${today}T00:00:00.000Z`);
    const currentMonth = lastBusinessDayOfMonth(
      current.getUTCFullYear(),
      current.getUTCMonth(),
    );
    if (today <= currentMonth) return currentMonth;
    return lastBusinessDayOfMonth(
      current.getUTCFullYear(),
      current.getUTCMonth() + 1,
    );
  }
  return today;
}

function institutionalArchiveName(
  name: string,
  recurrenceType: InstitutionalRecurrence,
  occurrenceDate: string,
  contractStartDate: string,
): string {
  if (recurrenceType === "weekly") {
    return `${name} - Semana ${String(contractWeekNumber(contractStartDate, occurrenceDate)).padStart(2, "0")}`;
  }
  if (recurrenceType === "monthly") return `${name} - Mês ${occurrenceDate.slice(0, 7)}`;
  return `${name} - Dia ${occurrenceDate}`;
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
  routine: typeof projectDeliveryRoutines.$inferSelect,
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
    .from(projectDeliveryRoutines)
    .where(
      and(
        eq(projectDeliveryRoutines.workspaceId, workspaceId),
        eq(projectDeliveryRoutines.projectId, project.id),
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
        .select({ id: deliveries.id })
        .from(deliveries)
        .where(
          and(
            eq(deliveries.workspaceId, workspaceId),
            eq(deliveries.projectRoutineId, routine.id),
            eq(deliveries.routineOccurrenceDate, occurrenceDate),
          ),
        )
        .limit(1);
      if (existing) continue;
      const deliveryId = randomUUID();
      await database.insert(deliveries).values({
        id: deliveryId,
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
      const tasks = parseJson<SnapshotTask[]>(routine.tasks, []);
      const effectiveTasks = tasks.length
        ? tasks
        : [
            {
              name: "Concluir entrega",
              durationMinutes: 60,
              status: "pendente",
            },
          ];
      await database.insert(deliveryTasks).values(
        effectiveTasks.map((task, sortOrder) => ({
          workspaceId,
          deliveryId,
          name: task.name,
          durationMinutes: task.durationMinutes,
          statusKey: task.status,
          sortOrder,
          createdAt: now,
          updatedAt: now,
        })),
      );
      const tagIds = parseJson<string[]>(routine.tagIds, []);
      if (tagIds.length)
        await database.insert(deliveryTags).values(
          tagIds.map((tagId, sortOrder) => ({
            workspaceId,
            deliveryId,
            tagId,
            sortOrder,
          })),
        );
      await database.insert(deliveryResponsibles).values({
        workspaceId,
        deliveryId,
        userId: routine.responsibleUserId,
        sortOrder: 0,
      });
    }
  }
}

/** Copia os modelos do serviço como uma fotografia do contrato/projeto. */
/** Rolls institutional deliveries forward. A delivery is archived as history
 * before a clean occurrence is made from its immutable routine snapshot. */
async function rollInstitutionalProjectWeekInTransaction(
  database: RoutineDatabase,
  workspaceId: string,
  project: {
    id: string;
    businessId: string;
    startDate: string;
    endDate: string | null;
  },
  today: string,
): Promise<void> {
  if (project.endDate && today > project.endDate) return;
  const routines = await database
    .select()
    .from(projectDeliveryRoutines)
    .where(
      and(
        eq(projectDeliveryRoutines.workspaceId, workspaceId),
        eq(projectDeliveryRoutines.projectId, project.id),
      ),
    );
  const now = new Date();

  for (const routine of routines) {
    const recurrenceType: InstitutionalRecurrence =
      routine.recurrenceType === "daily" ||
      routine.recurrenceType === "weekly" ||
      routine.recurrenceType === "monthly" ||
      routine.recurrenceType === "one_off"
        ? routine.recurrenceType
        : "weekly";
    if (recurrenceType === "one_off") continue;
    const occurrenceDate = institutionalOccurrenceDate(recurrenceType, today);
    if (project.endDate && occurrenceDate > project.endDate) continue;
    const [existing] = await database
      .select({ id: deliveries.id })
      .from(deliveries)
      .where(
        and(
          eq(deliveries.workspaceId, workspaceId),
          eq(deliveries.projectRoutineId, routine.id),
          eq(deliveries.routineOccurrenceDate, occurrenceDate),
        ),
      )
      .limit(1);
    if (!existing) {
      const deliveryId = randomUUID();
      await database.insert(deliveries).values({
        id: deliveryId,
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
        dueDate: null,
        sortOrder: 0,
        boardOrder: {},
        createdAt: now,
        updatedAt: now,
      });
      const snapshots = parseJson<SnapshotTask[]>(routine.tasks, []);
      const deliveryTasksSnapshot = snapshots.length
        ? snapshots
        : [{ name: "Concluir entrega", durationMinutes: 60, status: "pendente" }];
      await database.insert(deliveryTasks).values(
        deliveryTasksSnapshot.map((item, sortOrder) => ({
          workspaceId,
          deliveryId,
          name: item.name,
          durationMinutes: item.durationMinutes,
          statusKey: item.status,
          sortOrder,
          createdAt: now,
          updatedAt: now,
        })),
      );
      const tagIds = parseJson<string[]>(routine.tagIds, []);
      if (tagIds.length)
        await database.insert(deliveryTags).values(
          tagIds.map((tagId, sortOrder) => ({
            workspaceId,
            deliveryId,
            tagId,
            sortOrder,
          })),
        );
      await database.insert(deliveryResponsibles).values({
        workspaceId,
        deliveryId,
        userId: routine.responsibleUserId,
        sortOrder: 0,
      });
    }

    const expired = await database
      .select({ id: deliveries.id, occurrenceDate: deliveries.routineOccurrenceDate })
      .from(deliveries)
      .where(
        and(
          eq(deliveries.workspaceId, workspaceId),
          eq(deliveries.projectRoutineId, routine.id),
          lt(deliveries.routineOccurrenceDate, occurrenceDate),
          isNull(deliveries.archivedAt),
        ),
      );
    for (const delivery of expired) {
      if (!delivery.occurrenceDate) continue;
      await database
        .update(deliveries)
        .set({
          name: institutionalArchiveName(
            routine.name,
            recurrenceType,
            delivery.occurrenceDate,
            project.startDate,
          ),
          archivedAt: now,
          updatedAt: now,
        })
        .where(
          and(
            eq(deliveries.workspaceId, workspaceId),
            eq(deliveries.id, delivery.id),
            isNull(deliveries.archivedAt),
          ),
        );
      await database
        .update(deliveryTasks)
        .set({ archivedAt: now, updatedAt: now })
        .where(
          and(
            eq(deliveryTasks.workspaceId, workspaceId),
            eq(deliveryTasks.deliveryId, delivery.id),
            isNull(deliveryTasks.archivedAt),
          ),
        );
    }
  }
}

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
    .from(serviceDeliveryTemplates)
    .where(
      and(
        eq(serviceDeliveryTemplates.workspaceId, workspaceId),
        inArray(serviceDeliveryTemplates.serviceId, serviceIds),
      ),
    )
    .orderBy(asc(serviceDeliveryTemplates.sortOrder), asc(serviceDeliveryTemplates.id));
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
  const [tasks, tagLinks, responsibleLinks] = await Promise.all([
    database
      .select()
      .from(deliveryTemplateTasks)
      .where(
        and(
          eq(deliveryTemplateTasks.workspaceId, workspaceId),
          inArray(deliveryTemplateTasks.deliveryTemplateId, deliveryIds),
        ),
      )
      .orderBy(asc(deliveryTemplateTasks.sortOrder)),
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
    const deliveryTasksSnapshot = tasks
      .filter((row) => row.deliveryTemplateId === delivery.id)
      .map((row) => ({
        name: row.name,
        durationMinutes: row.durationMinutes,
        status: row.defaultStatusKey,
      }));
    const tagIds = tagLinks
      .filter((row) => row.deliveryTemplateId === delivery.id)
      .map((row) => row.tagId);
    await database.insert(projectDeliveryRoutines).values({
      id: routineId,
      workspaceId,
      projectId: project.id,
      sourceServiceDeliveryTemplateId: link.id,
      name: link.name,
      description: delivery.description,
      categoryKey: delivery.categoryKey,
      priorityKey: delivery.defaultPriorityKey,
      statusKey: delivery.defaultStatusKey,
      responsibleUserId: owner,
      tagIds: JSON.stringify(tagIds),
      tasks: JSON.stringify(deliveryTasksSnapshot),
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
        isInstitutional: projects.isInstitutional,
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
      // Institutional projects are managed by the contract-week rollover below;
      // they must never receive the generic 90-day pre-materialization.
      if (!project.startDate || project.isInstitutional) continue;
      await materializeProjectRoutinesInTransaction(
        transaction,
        workspaceId,
        { ...project, startDate: project.startDate },
        addDays(today, HORIZON_DAYS),
      );
    }
    const recurringInstitutionalProjects = await transaction
      .select({
        id: projects.id,
        businessId: projects.businessId,
        startDate: contracts.startDate,
        endDate: contracts.endDate,
      })
      .from(projects)
      .innerJoin(
        contracts,
        and(
          eq(contracts.workspaceId, projects.workspaceId),
          eq(contracts.id, projects.contractId),
        ),
      )
      .where(
        and(
          eq(projects.workspaceId, workspaceId),
          eq(projects.isInstitutional, true),
          eq(contracts.contractType, "recurring"),
          isNull(projects.archivedAt),
          isNull(contracts.archivedAt),
          isNotNull(contracts.startDate),
        ),
      );
    for (const project of recurringInstitutionalProjects) {
      if (!project.startDate) continue;
      await rollInstitutionalProjectWeekInTransaction(
        transaction,
        workspaceId,
        { ...project, startDate: project.startDate },
        today,
      );
    }
  });
}
