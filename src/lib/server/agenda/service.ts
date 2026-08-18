import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
import type {
  AgendaMode,
  AgendaMoveInput,
  AgendaPlacement,
  AgendaQuery,
  AgendaSnapshot,
} from "../../agenda/types";
import { isIsoDate } from "../../agenda/date-utils";
import type { RequestAuthorizationContext } from "../authorization/workspace-context";
import {
  requireActiveWorkspacePermission,
  requireWorkspacePermission,
  requireWorkspacePermissionForUpdate,
} from "../authorization/workspace-context";
import type { Database } from "../db/database";
import {
  agendaEntries,
  projects,
  tasks,
  taskSubtasks,
  workspaces,
  type AgendaEntityKind,
} from "../db/schema";

type AgendaDatabase = Pick<Database, "select" | "insert" | "update" | "delete">;

export class AgendaVersionConflictError extends Error {
  readonly status = 409;

  constructor() {
    super(
      "A Agenda foi alterada em outra sessao. Recarregue e tente novamente.",
    );
    this.name = "AgendaVersionConflictError";
  }
}

export class AgendaInvalidMovementError extends Error {
  readonly status = 400;

  constructor(message = "O movimento da Agenda nao e valido.") {
    super(message);
    this.name = "AgendaInvalidMovementError";
  }
}

function workspaceIdFromContext(context: RequestAuthorizationContext): string {
  return requireActiveWorkspacePermission(context, "workspace:read").workspace
    .id;
}

function kindForMode(mode: AgendaMode): AgendaEntityKind {
  return mode === "projects" ? "project" : "task";
}

function entityId(row: typeof agendaEntries.$inferSelect): string {
  const id = row.entityKind === "project" ? row.projectId : row.taskId;
  if (!id) throw new AgendaInvalidMovementError();
  return id;
}

function placement(row: typeof agendaEntries.$inferSelect): AgendaPlacement {
  return {
    id: entityId(row),
    date: row.scheduledDate,
    order: row.position,
    durationMinutes: row.durationMinutes,
    version: row.version,
  };
}

async function lockWorkspace(
  database: AgendaDatabase,
  workspaceId: string,
): Promise<void> {
  const locked = await database
    .select({ id: workspaces.id })
    .from(workspaces)
    .where(eq(workspaces.id, workspaceId))
    .limit(1)
    .for("update");
  if (locked.length !== 1) throw new AgendaInvalidMovementError();
}

async function ensureAgendaEntries(
  database: AgendaDatabase,
  workspaceId: string,
): Promise<void> {
  await lockWorkspace(database, workspaceId);
  const projectRows = await database
    .select({ id: projects.id, date: projects.endDate })
    .from(projects)
    .where(
      and(eq(projects.workspaceId, workspaceId), isNull(projects.archivedAt)),
    )
    .orderBy(asc(projects.id));
  const taskRows = await database
    .select({ id: tasks.id, date: tasks.dueDate })
    .from(tasks)
    .where(and(eq(tasks.workspaceId, workspaceId), isNull(tasks.archivedAt)))
    .orderBy(asc(tasks.id));
  const subtaskRows = await database
    .select({
      taskId: taskSubtasks.taskId,
      durationMinutes: taskSubtasks.durationMinutes,
    })
    .from(taskSubtasks)
    .where(
      and(
        eq(taskSubtasks.workspaceId, workspaceId),
        isNull(taskSubtasks.archivedAt),
      ),
    );
  const storedRows = await database
    .select()
    .from(agendaEntries)
    .where(eq(agendaEntries.workspaceId, workspaceId))
    .orderBy(
      asc(agendaEntries.entityKind),
      asc(agendaEntries.scheduledDate),
      asc(agendaEntries.position),
    );

  const projectDates = new Map(projectRows.map(({ id, date }) => [id, date]));
  const taskDates = new Map(taskRows.map(({ id, date }) => [id, date]));
  const staleIds = storedRows
    .filter((row) => {
      if (row.entityKind === "project") {
        return (
          !row.projectId ||
          !projectDates.has(row.projectId) ||
          row.scheduledDate !== projectDates.get(row.projectId)
        );
      }
      return (
        !row.taskId ||
        !taskDates.has(row.taskId) ||
        row.scheduledDate !== taskDates.get(row.taskId)
      );
    })
    .map(({ id }) => id);
  if (staleIds.length) {
    await database
      .delete(agendaEntries)
      .where(inArray(agendaEntries.id, staleIds));
  }

  const retained = storedRows.filter(({ id }) => !staleIds.includes(id));
  const occupied = new Map<string, number>();
  for (const row of retained) {
    const key = `${row.entityKind}:${row.scheduledDate ?? "__unscheduled__"}`;
    occupied.set(key, Math.max(occupied.get(key) ?? -1, row.position));
  }
  const storedProjects = new Set(
    retained.flatMap((row) => (row.projectId ? [row.projectId] : [])),
  );
  const storedTasks = new Set(
    retained.flatMap((row) => (row.taskId ? [row.taskId] : [])),
  );
  const durationByTask = new Map<string, number>();
  for (const subtask of subtaskRows) {
    durationByTask.set(
      subtask.taskId,
      Math.min(
        10_080,
        (durationByTask.get(subtask.taskId) ?? 0) + subtask.durationMinutes,
      ),
    );
  }

  const nextPosition = (
    kind: AgendaEntityKind,
    date: string | null,
  ): number => {
    const key = `${kind}:${date ?? "__unscheduled__"}`;
    const next = (occupied.get(key) ?? -1) + 1;
    occupied.set(key, next);
    return next;
  };
  const values = [
    ...projectRows
      .filter(({ id }) => !storedProjects.has(id))
      .map((project) => ({
        workspaceId,
        entityKind: "project" as const,
        projectId: project.id,
        scheduledDate: project.date,
        position: nextPosition("project", project.date),
        durationMinutes: 60,
      })),
    ...taskRows
      .filter(({ id }) => !storedTasks.has(id))
      .map((task) => ({
        workspaceId,
        entityKind: "task" as const,
        taskId: task.id,
        scheduledDate: task.date,
        position: nextPosition("task", task.date),
        durationMinutes: Math.max(30, durationByTask.get(task.id) ?? 60),
      })),
  ];
  if (values.length) await database.insert(agendaEntries).values(values);
}

async function readSnapshot(
  database: AgendaDatabase,
  workspaceId: string,
): Promise<AgendaSnapshot> {
  const rows = await database
    .select()
    .from(agendaEntries)
    .where(eq(agendaEntries.workspaceId, workspaceId))
    .orderBy(
      asc(agendaEntries.entityKind),
      asc(agendaEntries.scheduledDate),
      asc(agendaEntries.position),
      asc(agendaEntries.id),
    );
  return {
    workspaceId,
    projects: rows
      .filter(({ entityKind }) => entityKind === "project")
      .map(placement),
    tasks: rows
      .filter(({ entityKind }) => entityKind === "task")
      .map(placement),
  };
}

export async function getWorkspaceAgenda(
  database: Database,
  context: RequestAuthorizationContext,
  query: AgendaQuery = {},
): Promise<AgendaSnapshot> {
  const workspaceId = query.workspaceId ?? workspaceIdFromContext(context);
  return database.transaction(async (transaction) => {
    await requireWorkspacePermission(
      transaction,
      context.user.id,
      workspaceId,
      "workspace:read",
    );
    await ensureAgendaEntries(transaction, workspaceId);
    return readSnapshot(transaction, workspaceId);
  });
}

function assertCompleteOrder(
  rows: (typeof agendaEntries.$inferSelect)[],
  input: AgendaMoveInput,
): void {
  const byId = new Map(rows.map((row) => [entityId(row), row]));
  if (
    byId.size !== input.items.length ||
    input.items.some(({ id }) => !byId.has(id))
  ) {
    throw new AgendaVersionConflictError();
  }
  for (const item of input.items) {
    if (byId.get(item.id)?.version !== item.version)
      throw new AgendaVersionConflictError();
  }
  const positionsByDate = new Map<string, number[]>();
  for (const item of input.items) {
    if (
      item.order < 0 ||
      item.order > 999_999 ||
      item.durationMinutes < 30 ||
      item.durationMinutes > 10_080 ||
      item.durationMinutes % 30 !== 0 ||
      (item.date !== null && !isIsoDate(item.date))
    ) {
      throw new AgendaInvalidMovementError();
    }
    const key = item.date ?? "__unscheduled__";
    positionsByDate.set(key, [...(positionsByDate.get(key) ?? []), item.order]);
  }
  for (const positions of positionsByDate.values()) {
    positions.sort((left, right) => left - right);
    if (positions.some((position, index) => position !== index)) {
      throw new AgendaInvalidMovementError(
        "A ordem de cada dia deve ser continua e sem duplicidades.",
      );
    }
  }
  if (rows.some(({ position }) => position > 999_999)) {
    throw new AgendaInvalidMovementError();
  }
}

export async function moveWorkspaceAgenda(
  database: Database,
  context: RequestAuthorizationContext,
  input: AgendaMoveInput,
): Promise<AgendaSnapshot> {
  const workspaceId = workspaceIdFromContext(context);
  return database.transaction(async (transaction) => {
    await requireWorkspacePermissionForUpdate(
      transaction,
      context.user.id,
      workspaceId,
      "workspace:write",
    );
    await ensureAgendaEntries(transaction, workspaceId);
    const kind = kindForMode(input.mode);
    const rows = await transaction
      .select()
      .from(agendaEntries)
      .where(
        and(
          eq(agendaEntries.workspaceId, workspaceId),
          eq(agendaEntries.entityKind, kind),
        ),
      )
      .orderBy(asc(agendaEntries.id))
      .for("update");
    assertCompleteOrder(rows, input);

    const now = new Date();
    if (rows.length) {
      await transaction
        .update(agendaEntries)
        .set({
          position: sql`${agendaEntries.position} + 1000000`,
          updatedAt: now,
        })
        .where(
          and(
            eq(agendaEntries.workspaceId, workspaceId),
            eq(agendaEntries.entityKind, kind),
          ),
        );
    }
    const rowByEntityId = new Map(rows.map((row) => [entityId(row), row]));
    for (const item of input.items) {
      const row = rowByEntityId.get(item.id)!;
      if (row.scheduledDate !== item.date) {
        if (kind === "task") {
          await transaction
            .update(tasks)
            .set({
              dueDate: item.date,
              version: sql`${tasks.version} + 1`,
              updatedAt: now,
            })
            .where(
              and(eq(tasks.workspaceId, workspaceId), eq(tasks.id, item.id)),
            );
        } else {
          const [project] = await transaction
            .select({ startDate: projects.startDate })
            .from(projects)
            .where(
              and(
                eq(projects.workspaceId, workspaceId),
                eq(projects.id, item.id),
              ),
            )
            .limit(1);
          if (
            item.date &&
            project?.startDate &&
            item.date < project.startDate
          ) {
            throw new AgendaInvalidMovementError(
              "A data de entrega do projeto nao pode ser anterior ao inicio.",
            );
          }
          await transaction
            .update(projects)
            .set({ endDate: item.date, updatedAt: now })
            .where(
              and(
                eq(projects.workspaceId, workspaceId),
                eq(projects.id, item.id),
              ),
            );
        }
      }
      const updated = await transaction
        .update(agendaEntries)
        .set({
          scheduledDate: item.date,
          position: item.order,
          durationMinutes: item.durationMinutes,
          version: sql`${agendaEntries.version} + 1`,
          updatedAt: now,
        })
        .where(
          and(
            eq(agendaEntries.workspaceId, workspaceId),
            eq(agendaEntries.id, row.id),
          ),
        )
        .returning({ id: agendaEntries.id });
      if (updated.length !== 1) throw new AgendaVersionConflictError();
    }
    return readSnapshot(transaction, workspaceId);
  });
}
