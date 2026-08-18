import { and, asc, eq, gte, inArray, isNull, lte, sql } from "drizzle-orm";
import type {
  CronogramaBlock,
  CronogramaBlockInput,
  CronogramaDeleteInput,
  CronogramaQuery,
  CronogramaReorganizationInput,
  CronogramaSnapshot,
} from "../../cronograma/api-types";
import { defaultPersonalSettings } from "../../settings/defaults";
import type { PersonalSettingsState } from "../../settings/types";
import type { RequestAuthorizationContext } from "../authorization/workspace-context";
import {
  requireActiveWorkspacePermission,
  requireWorkspacePermission,
  requireWorkspacePermissionForUpdate,
} from "../authorization/workspace-context";
import type { Database } from "../db/database";
import {
  cronogramaBlocks,
  taskResponsibles,
  tasks,
  taskSubtasks,
  userPreferences,
  workspaces,
} from "../db/schema";
import { personalSettingsSchema } from "../settings/validation";

type CronogramaDatabase = Pick<
  Database,
  "select" | "insert" | "update" | "delete"
>;
type StoredBlock = typeof cronogramaBlocks.$inferSelect;

type SubtaskRule = {
  id: string;
  taskId: string;
  name: string;
  sortOrder: number;
  completedAt: Date | null;
};

export class CronogramaVersionConflictError extends Error {
  readonly status = 409;

  constructor() {
    super(
      "O Cronograma foi alterado em outra sessão. Recarregue e tente novamente.",
    );
    this.name = "CronogramaVersionConflictError";
  }
}

export class CronogramaRuleViolationError extends Error {
  readonly status = 409;

  constructor(message: string) {
    super(message);
    this.name = "CronogramaRuleViolationError";
  }
}

export class CronogramaSubtaskNotFoundError extends Error {
  readonly status = 404;

  constructor() {
    super("A subtarefa não existe ou não está ativa neste workspace.");
    this.name = "CronogramaSubtaskNotFoundError";
  }
}

function databaseConstraint(error: unknown): string | undefined {
  let current = error;
  for (let depth = 0; depth < 4 && current; depth += 1) {
    if (typeof current !== "object") return undefined;
    if ("constraint" in current && typeof current.constraint === "string") {
      return current.constraint;
    }
    current = "cause" in current ? current.cause : undefined;
  }
  return undefined;
}

function workspaceIdFromContext(context: RequestAuthorizationContext): string {
  return requireActiveWorkspacePermission(context, "workspace:read").workspace
    .id;
}

async function lockWorkspace(
  database: CronogramaDatabase,
  workspaceId: string,
): Promise<void> {
  const locked = await database
    .select({ id: workspaces.id })
    .from(workspaces)
    .where(eq(workspaces.id, workspaceId))
    .limit(1)
    .for("update");
  if (locked.length !== 1) throw new CronogramaSubtaskNotFoundError();
}

async function responsibleMap(
  database: CronogramaDatabase,
  workspaceId: string,
): Promise<Map<string, string[]>> {
  const rows = await database
    .select({
      taskId: taskResponsibles.taskId,
      userId: taskResponsibles.userId,
    })
    .from(taskResponsibles)
    .where(eq(taskResponsibles.workspaceId, workspaceId))
    .orderBy(asc(taskResponsibles.sortOrder), asc(taskResponsibles.userId));
  const result = new Map<string, string[]>();
  for (const row of rows) {
    result.set(row.taskId, [...(result.get(row.taskId) ?? []), row.userId]);
  }
  return result;
}

async function readSnapshot(
  database: CronogramaDatabase,
  workspaceId: string,
  query: CronogramaQuery = {},
): Promise<CronogramaSnapshot> {
  const predicates = [
    eq(cronogramaBlocks.workspaceId, workspaceId),
    isNull(tasks.archivedAt),
    isNull(taskSubtasks.archivedAt),
  ];
  if (query.from)
    predicates.push(gte(cronogramaBlocks.scheduledDate, query.from));
  if (query.to) predicates.push(lte(cronogramaBlocks.scheduledDate, query.to));

  const rows = await database
    .select({
      block: cronogramaBlocks,
    })
    .from(cronogramaBlocks)
    .innerJoin(
      tasks,
      and(
        eq(tasks.workspaceId, cronogramaBlocks.workspaceId),
        eq(tasks.id, cronogramaBlocks.taskId),
      ),
    )
    .innerJoin(
      taskSubtasks,
      and(
        eq(taskSubtasks.workspaceId, cronogramaBlocks.workspaceId),
        eq(taskSubtasks.id, cronogramaBlocks.subtaskId),
        eq(taskSubtasks.taskId, cronogramaBlocks.taskId),
      ),
    )
    .where(and(...predicates))
    .orderBy(
      asc(cronogramaBlocks.scheduledDate),
      asc(cronogramaBlocks.startMinutes),
      asc(cronogramaBlocks.id),
    );
  const responsibles = await responsibleMap(database, workspaceId);

  const items = rows.flatMap(({ block }) => {
    const responsibleUserIds = responsibles.get(block.taskId) ?? [];
    if (
      query.responsibleUserId &&
      !responsibleUserIds.includes(query.responsibleUserId)
    ) {
      return [];
    }
    return [toApiBlock(block, responsibleUserIds)];
  });
  return { workspaceId, items };
}

function toApiBlock(
  block: StoredBlock,
  responsibleUserIds: string[],
): CronogramaBlock {
  return {
    id: block.id,
    workspaceId: block.workspaceId,
    taskId: block.taskId,
    subtaskId: block.subtaskId,
    date: block.scheduledDate,
    startMinutes: block.startMinutes,
    durationMinutes: block.durationMinutes,
    version: block.version,
    responsibleUserIds,
    createdAt: block.createdAt.toISOString(),
    updatedAt: block.updatedAt.toISOString(),
  };
}

async function activeSubtasks(
  database: CronogramaDatabase,
  workspaceId: string,
): Promise<SubtaskRule[]> {
  return database
    .select({
      id: taskSubtasks.id,
      taskId: taskSubtasks.taskId,
      name: taskSubtasks.name,
      sortOrder: taskSubtasks.sortOrder,
      completedAt: taskSubtasks.completedAt,
    })
    .from(taskSubtasks)
    .innerJoin(
      tasks,
      and(
        eq(tasks.workspaceId, taskSubtasks.workspaceId),
        eq(tasks.id, taskSubtasks.taskId),
      ),
    )
    .where(
      and(
        eq(taskSubtasks.workspaceId, workspaceId),
        isNull(taskSubtasks.archivedAt),
        isNull(tasks.archivedAt),
      ),
    )
    .orderBy(
      asc(taskSubtasks.taskId),
      asc(taskSubtasks.sortOrder),
      asc(taskSubtasks.id),
    );
}

async function activeStoredBlocks(
  database: CronogramaDatabase,
  workspaceId: string,
): Promise<StoredBlock[]> {
  const rows = await database
    .select({ block: cronogramaBlocks })
    .from(cronogramaBlocks)
    .innerJoin(
      tasks,
      and(
        eq(tasks.workspaceId, cronogramaBlocks.workspaceId),
        eq(tasks.id, cronogramaBlocks.taskId),
        isNull(tasks.archivedAt),
      ),
    )
    .innerJoin(
      taskSubtasks,
      and(
        eq(taskSubtasks.workspaceId, cronogramaBlocks.workspaceId),
        eq(taskSubtasks.id, cronogramaBlocks.subtaskId),
        eq(taskSubtasks.taskId, cronogramaBlocks.taskId),
        isNull(taskSubtasks.archivedAt),
      ),
    )
    .where(eq(cronogramaBlocks.workspaceId, workspaceId))
    .orderBy(asc(cronogramaBlocks.id));
  return rows.map(({ block }) => block);
}

function blockStartsBefore(left: StoredBlock, right: StoredBlock): boolean {
  return (
    left.scheduledDate < right.scheduledDate ||
    (left.scheduledDate === right.scheduledDate &&
      left.startMinutes < right.startMinutes)
  );
}

function blockEndsBeforeOrAt(left: StoredBlock, right: StoredBlock): boolean {
  return (
    left.scheduledDate < right.scheduledDate ||
    (left.scheduledDate === right.scheduledDate &&
      left.startMinutes + left.durationMinutes <= right.startMinutes)
  );
}

function assertSequence(blocks: StoredBlock[], subtasks: SubtaskRule[]): void {
  const blockBySubtask = new Map(
    blocks.map((block) => [block.subtaskId, block]),
  );
  const byTask = new Map<string, SubtaskRule[]>();
  for (const subtask of subtasks) {
    byTask.set(subtask.taskId, [
      ...(byTask.get(subtask.taskId) ?? []),
      subtask,
    ]);
  }
  for (const group of byTask.values()) {
    for (let index = 0; index < group.length; index += 1) {
      const current = group[index]!;
      const currentBlock = blockBySubtask.get(current.id);
      if (!currentBlock) continue;
      for (let previousIndex = 0; previousIndex < index; previousIndex += 1) {
        const previous = group[previousIndex]!;
        const previousBlock = blockBySubtask.get(previous.id);
        if (!previousBlock && !previous.completedAt) {
          throw new CronogramaRuleViolationError(
            `Agende "${previous.name}" antes de "${current.name}".`,
          );
        }
        if (
          previousBlock &&
          !blockEndsBeforeOrAt(previousBlock, currentBlock)
        ) {
          throw new CronogramaRuleViolationError(
            `"${current.name}" deve começar após o término de "${previous.name}".`,
          );
        }
      }
    }
  }
}

function assertNoResponsibleOverlap(
  blocks: StoredBlock[],
  responsibles: Map<string, string[]>,
): void {
  const byResponsible = new Map<string, StoredBlock[]>();
  for (const block of blocks) {
    for (const userId of responsibles.get(block.taskId) ?? []) {
      byResponsible.set(userId, [...(byResponsible.get(userId) ?? []), block]);
    }
  }
  for (const responsibleBlocks of byResponsible.values()) {
    responsibleBlocks.sort((left, right) =>
      blockStartsBefore(left, right)
        ? -1
        : blockStartsBefore(right, left)
          ? 1
          : 0,
    );
    for (let index = 1; index < responsibleBlocks.length; index += 1) {
      const previous = responsibleBlocks[index - 1]!;
      const current = responsibleBlocks[index]!;
      if (!blockEndsBeforeOrAt(previous, current)) {
        throw new CronogramaRuleViolationError(
          "O responsável já possui outro bloco nesse horário.",
        );
      }
    }
  }
}

function parseMinutes(value: string): number {
  const [hours, minutes] = value.split(":").map(Number);
  return hours! * 60 + minutes!;
}

function settingsFromStored(
  stored: Record<string, unknown> | undefined,
): PersonalSettingsState {
  const parsed = stored ? personalSettingsSchema.safeParse(stored) : null;
  return parsed?.success ? parsed.data : defaultPersonalSettings();
}

async function preferencesByUser(
  database: CronogramaDatabase,
  userIds: string[],
): Promise<Map<string, PersonalSettingsState>> {
  if (!userIds.length) return new Map();
  const rows = await database
    .select({
      userId: userPreferences.userId,
      settings: userPreferences.settings,
    })
    .from(userPreferences)
    .where(inArray(userPreferences.userId, userIds));
  const storedByUser = new Map(rows.map((row) => [row.userId, row.settings]));
  return new Map(
    userIds.map((userId) => [
      userId,
      settingsFromStored(storedByUser.get(userId)),
    ]),
  );
}

function assertInsideWorkday(
  block: StoredBlock,
  userId: string,
  settings: PersonalSettingsState,
): void {
  const weekday = new Date(`${block.scheduledDate}T00:00:00.000Z`).getUTCDay();
  if (
    weekday === 0 ||
    (weekday === 6 && settings.cronogramaDays !== "saturday")
  ) {
    throw new CronogramaRuleViolationError(
      "O bloco está fora dos dias de trabalho do responsável.",
    );
  }
  const endMinutes = block.startMinutes + block.durationMinutes;
  const fitsShift = settings.workdayShifts.some(
    (shift) =>
      block.startMinutes >= parseMinutes(shift.start) &&
      endMinutes <= parseMinutes(shift.end),
  );
  if (!fitsShift) {
    throw new CronogramaRuleViolationError(
      `O bloco está fora da jornada configurada para o responsável ${userId}.`,
    );
  }
}

async function assertRules(
  database: CronogramaDatabase,
  blocks: StoredBlock[],
  subtasks: SubtaskRule[],
  responsibles: Map<string, string[]>,
): Promise<void> {
  assertSequence(blocks, subtasks);
  assertNoResponsibleOverlap(blocks, responsibles);
  const users = new Set<string>();
  for (const block of blocks) {
    const responsibleUserIds = responsibles.get(block.taskId) ?? [];
    for (const userId of responsibleUserIds) users.add(userId);
  }
  const preferences = await preferencesByUser(database, [...users]);
  for (const block of blocks) {
    const responsibleUserIds = responsibles.get(block.taskId) ?? [];
    if (!responsibleUserIds.length) {
      assertInsideWorkday(block, "não atribuído", defaultPersonalSettings());
      continue;
    }
    for (const userId of responsibleUserIds) {
      assertInsideWorkday(
        block,
        userId,
        preferences.get(userId) ?? defaultPersonalSettings(),
      );
    }
  }
}

async function mutationState(
  database: CronogramaDatabase,
  workspaceId: string,
): Promise<{
  blocks: StoredBlock[];
  subtasks: SubtaskRule[];
  responsibles: Map<string, string[]>;
}> {
  const blocks = await activeStoredBlocks(database, workspaceId);
  const subtasks = await activeSubtasks(database, workspaceId);
  const responsibles = await responsibleMap(database, workspaceId);
  return { blocks, subtasks, responsibles };
}

export async function getWorkspaceCronograma(
  database: Database,
  context: RequestAuthorizationContext,
  query: CronogramaQuery = {},
): Promise<CronogramaSnapshot> {
  const workspaceId = query.workspaceId ?? workspaceIdFromContext(context);
  await requireWorkspacePermission(
    database,
    context.user.id,
    workspaceId,
    "workspace:read",
  );
  return readSnapshot(database, workspaceId, {
    ...query,
    responsibleUserId: context.user.id,
  });
}

export async function saveCronogramaBlock(
  database: Database,
  context: RequestAuthorizationContext,
  subtaskId: string,
  input: CronogramaBlockInput,
): Promise<CronogramaSnapshot> {
  const workspaceId = workspaceIdFromContext(context);
  return database
    .transaction(async (transaction) => {
      await requireWorkspacePermissionForUpdate(
        transaction,
        context.user.id,
        workspaceId,
        "workspace:write",
      );
      await lockWorkspace(transaction, workspaceId);
      const state = await mutationState(transaction, workspaceId);
      const subtask = state.subtasks.find(({ id }) => id === subtaskId);
      if (!subtask) throw new CronogramaSubtaskNotFoundError();
      if (
        !(state.responsibles.get(subtask.taskId) ?? []).includes(
          context.user.id,
        )
      ) {
        throw new CronogramaRuleViolationError(
          "Somente o responsavel da tarefa pode alocar esta subtarefa no proprio Cronograma.",
        );
      }
      const current = state.blocks.find(
        (block) => block.subtaskId === subtaskId,
      );
      if (
        (!current && input.version !== 0) ||
        (current && current.version !== input.version)
      ) {
        throw new CronogramaVersionConflictError();
      }

      const now = new Date();
      const candidate: StoredBlock = current
        ? {
            ...current,
            scheduledDate: input.date,
            startMinutes: input.startMinutes,
            durationMinutes: input.durationMinutes,
            version: current.version + 1,
            updatedAt: now,
          }
        : {
            id: crypto.randomUUID(),
            workspaceId,
            taskId: subtask.taskId,
            subtaskId,
            scheduledDate: input.date,
            startMinutes: input.startMinutes,
            durationMinutes: input.durationMinutes,
            version: 1,
            createdAt: now,
            updatedAt: now,
          };
      const nextBlocks = [
        ...state.blocks.filter((block) => block.subtaskId !== subtaskId),
        candidate,
      ];
      await assertRules(
        transaction,
        nextBlocks,
        state.subtasks,
        state.responsibles,
      );

      if (current) {
        const updated = await transaction
          .update(cronogramaBlocks)
          .set({
            scheduledDate: input.date,
            startMinutes: input.startMinutes,
            durationMinutes: input.durationMinutes,
            version: sql`${cronogramaBlocks.version} + 1`,
            updatedAt: now,
          })
          .where(
            and(
              eq(cronogramaBlocks.id, current.id),
              eq(cronogramaBlocks.workspaceId, workspaceId),
              eq(cronogramaBlocks.version, input.version),
            ),
          )
          .returning({ id: cronogramaBlocks.id });
        if (updated.length !== 1) throw new CronogramaVersionConflictError();
      } else {
        await transaction.insert(cronogramaBlocks).values({
          workspaceId,
          taskId: subtask.taskId,
          subtaskId,
          scheduledDate: input.date,
          startMinutes: input.startMinutes,
          durationMinutes: input.durationMinutes,
        });
      }
      return readSnapshot(transaction, workspaceId, {
        responsibleUserId: context.user.id,
      });
    })
    .catch((cause: unknown) => {
      if (
        databaseConstraint(cause) === "cronograma_blocks_responsible_no_overlap"
      ) {
        throw new CronogramaRuleViolationError(
          "O responsável já possui outra subtarefa programada nesse horário.",
        );
      }
      throw cause;
    });
}

export async function deleteCronogramaBlock(
  database: Database,
  context: RequestAuthorizationContext,
  subtaskId: string,
  input: CronogramaDeleteInput,
): Promise<CronogramaSnapshot> {
  const workspaceId = workspaceIdFromContext(context);
  return database.transaction(async (transaction) => {
    await requireWorkspacePermissionForUpdate(
      transaction,
      context.user.id,
      workspaceId,
      "workspace:write",
    );
    await lockWorkspace(transaction, workspaceId);
    const state = await mutationState(transaction, workspaceId);
    const current = state.blocks.find((block) => block.subtaskId === subtaskId);
    if (!current || current.version !== input.version) {
      throw new CronogramaVersionConflictError();
    }
    if (
      !(state.responsibles.get(current.taskId) ?? []).includes(context.user.id)
    ) {
      throw new CronogramaRuleViolationError(
        "Somente o responsavel da tarefa pode retirar esta subtarefa do proprio Cronograma.",
      );
    }
    const nextBlocks = state.blocks.filter(
      (block) => block.subtaskId !== subtaskId,
    );
    await assertRules(
      transaction,
      nextBlocks,
      state.subtasks,
      state.responsibles,
    );
    const deleted = await transaction
      .delete(cronogramaBlocks)
      .where(
        and(
          eq(cronogramaBlocks.id, current.id),
          eq(cronogramaBlocks.workspaceId, workspaceId),
          eq(cronogramaBlocks.version, input.version),
        ),
      )
      .returning({ id: cronogramaBlocks.id });
    if (deleted.length !== 1) throw new CronogramaVersionConflictError();
    return readSnapshot(transaction, workspaceId, {
      responsibleUserId: context.user.id,
    });
  });
}

/** Substitui vários blocos em uma única transação, evitando conflitos temporários. */
export async function reorganizeCronogramaBlocks(
  database: Database,
  context: RequestAuthorizationContext,
  input: CronogramaReorganizationInput,
): Promise<CronogramaSnapshot> {
  const workspaceId = input.workspaceId;
  return database
    .transaction(async (transaction) => {
      await requireWorkspacePermissionForUpdate(
        transaction,
        context.user.id,
        workspaceId,
        "workspace:write",
      );
      await lockWorkspace(transaction, workspaceId);
      const state = await mutationState(transaction, workspaceId);
      const subtaskById = new Map(
        state.subtasks.map((subtask) => [subtask.id, subtask]),
      );
      const currentBySubtaskId = new Map(
        state.blocks.map((block) => [block.subtaskId, block]),
      );
      const now = new Date();

      const candidates = input.blocks.map((block): StoredBlock => {
        const subtask = subtaskById.get(block.subtaskId);
        if (!subtask) throw new CronogramaSubtaskNotFoundError();
        if (
          !(state.responsibles.get(subtask.taskId) ?? []).includes(
            context.user.id,
          )
        ) {
          throw new CronogramaRuleViolationError(
            "Somente o responsável da tarefa pode reorganizar esta subtarefa.",
          );
        }
        const current = currentBySubtaskId.get(block.subtaskId);
        if (
          (!current && block.version !== 0) ||
          (current && current.version !== block.version)
        ) {
          throw new CronogramaVersionConflictError();
        }
        return current
          ? {
              ...current,
              scheduledDate: block.date,
              startMinutes: block.startMinutes,
              durationMinutes: block.durationMinutes,
              version: current.version + 1,
              updatedAt: now,
            }
          : {
              id: crypto.randomUUID(),
              workspaceId,
              taskId: subtask.taskId,
              subtaskId: subtask.id,
              scheduledDate: block.date,
              startMinutes: block.startMinutes,
              durationMinutes: block.durationMinutes,
              version: 1,
              createdAt: now,
              updatedAt: now,
            };
      });

      const replacedIds = new Set(
        input.blocks.map(({ subtaskId }) => subtaskId),
      );
      const nextBlocks = [
        ...state.blocks.filter((block) => !replacedIds.has(block.subtaskId)),
        ...candidates,
      ];
      await assertRules(
        transaction,
        nextBlocks,
        state.subtasks,
        state.responsibles,
      );

      const existingIds = candidates
        .filter((candidate) => currentBySubtaskId.has(candidate.subtaskId))
        .map((candidate) => candidate.id);
      if (existingIds.length) {
        await transaction
          .delete(cronogramaBlocks)
          .where(
            and(
              eq(cronogramaBlocks.workspaceId, workspaceId),
              inArray(cronogramaBlocks.id, existingIds),
            ),
          );
      }
      await transaction.insert(cronogramaBlocks).values(candidates);

      return readSnapshot(transaction, workspaceId, {
        responsibleUserId: context.user.id,
      });
    })
    .catch((cause: unknown) => {
      if (
        databaseConstraint(cause) === "cronograma_blocks_responsible_no_overlap"
      ) {
        throw new CronogramaRuleViolationError(
          "O responsável já possui outra subtarefa programada nesse horário.",
        );
      }
      throw cause;
    });
}
