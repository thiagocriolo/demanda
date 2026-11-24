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
  requireWorkspacePermission,
  requireWorkspacePermissionForUpdate,
  workspaceIdFromContext,
} from "../authorization/workspace-context";
import { affectedRows, type Database } from "../db/database";
import { databaseConstraint } from "../db/helpers";
import {
  cronogramaBlocks,
  deliveryResponsibles,
  deliveries,
  deliveryTasks,
  userPreferences,
  workspaces,
} from "../db/schema";
import { personalSettingsSchema } from "../settings/validation";
import { appendDataChangeAuditLog } from "../authorization/audit";

type CronogramaDatabase = Pick<
  Database,
  "select" | "insert" | "update" | "delete"
>;
type StoredBlock = typeof cronogramaBlocks.$inferSelect;

type TaskRule = {
  id: string;
  deliveryId: string;
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

export class CronogramaTaskNotFoundError extends Error {
  readonly status = 404;

  constructor() {
    super("A tarefa não existe ou não está ativa neste workspace.");
    this.name = "CronogramaTaskNotFoundError";
  }
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
  if (locked.length !== 1) throw new CronogramaTaskNotFoundError();
}

async function responsibleMap(
  database: CronogramaDatabase,
  workspaceId: string,
): Promise<Map<string, string[]>> {
  const rows = await database
    .select({
      deliveryId: deliveryResponsibles.deliveryId,
      userId: deliveryResponsibles.userId,
    })
    .from(deliveryResponsibles)
    .where(eq(deliveryResponsibles.workspaceId, workspaceId))
    .orderBy(asc(deliveryResponsibles.sortOrder), asc(deliveryResponsibles.userId));
  const result = new Map<string, string[]>();
  for (const row of rows) {
    result.set(row.deliveryId, [...(result.get(row.deliveryId) ?? []), row.userId]);
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
    isNull(deliveries.archivedAt),
    isNull(deliveryTasks.archivedAt),
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
      deliveries,
      and(
        eq(deliveries.workspaceId, cronogramaBlocks.workspaceId),
        eq(deliveries.id, cronogramaBlocks.deliveryId),
      ),
    )
    .innerJoin(
      deliveryTasks,
      and(
        eq(deliveryTasks.workspaceId, cronogramaBlocks.workspaceId),
        eq(deliveryTasks.id, cronogramaBlocks.taskId),
        eq(deliveryTasks.deliveryId, cronogramaBlocks.deliveryId),
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
    const responsibleUserIds = responsibles.get(block.deliveryId) ?? [];
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
    deliveryId: block.deliveryId,
    taskId: block.taskId,
    date: block.scheduledDate,
    startMinutes: block.startMinutes,
    durationMinutes: block.durationMinutes,
    version: block.version,
    responsibleUserIds,
    createdAt: block.createdAt.toISOString(),
    updatedAt: block.updatedAt.toISOString(),
  };
}

async function activeTasks(
  database: CronogramaDatabase,
  workspaceId: string,
): Promise<TaskRule[]> {
  return database
    .select({
      id: deliveryTasks.id,
      deliveryId: deliveryTasks.deliveryId,
      name: deliveryTasks.name,
      sortOrder: deliveryTasks.sortOrder,
      completedAt: deliveryTasks.completedAt,
    })
    .from(deliveryTasks)
    .innerJoin(
      deliveries,
      and(
        eq(deliveries.workspaceId, deliveryTasks.workspaceId),
        eq(deliveries.id, deliveryTasks.deliveryId),
      ),
    )
    .where(
      and(
        eq(deliveryTasks.workspaceId, workspaceId),
        isNull(deliveryTasks.archivedAt),
        isNull(deliveries.archivedAt),
      ),
    )
    .orderBy(
      asc(deliveryTasks.deliveryId),
      asc(deliveryTasks.sortOrder),
      asc(deliveryTasks.id),
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
      deliveries,
      and(
        eq(deliveries.workspaceId, cronogramaBlocks.workspaceId),
        eq(deliveries.id, cronogramaBlocks.deliveryId),
        isNull(deliveries.archivedAt),
      ),
    )
    .innerJoin(
      deliveryTasks,
      and(
        eq(deliveryTasks.workspaceId, cronogramaBlocks.workspaceId),
        eq(deliveryTasks.id, cronogramaBlocks.taskId),
        eq(deliveryTasks.deliveryId, cronogramaBlocks.deliveryId),
        isNull(deliveryTasks.archivedAt),
      ),
    )
    .where(eq(cronogramaBlocks.workspaceId, workspaceId))
    .orderBy(asc(cronogramaBlocks.id));
  return rows.map(({ block }) => block);
}

async function globalResponsibleState(
  database: CronogramaDatabase,
): Promise<{ blocks: StoredBlock[]; responsibles: Map<string, string[]> }> {
  const rows = await database
    .select({
      block: cronogramaBlocks,
      userId: deliveryResponsibles.userId,
    })
    .from(cronogramaBlocks)
    .innerJoin(
      deliveries,
      and(
        eq(deliveries.workspaceId, cronogramaBlocks.workspaceId),
        eq(deliveries.id, cronogramaBlocks.deliveryId),
        isNull(deliveries.archivedAt),
      ),
    )
    .innerJoin(
      deliveryTasks,
      and(
        eq(deliveryTasks.workspaceId, cronogramaBlocks.workspaceId),
        eq(deliveryTasks.id, cronogramaBlocks.taskId),
        eq(deliveryTasks.deliveryId, cronogramaBlocks.deliveryId),
        isNull(deliveryTasks.archivedAt),
      ),
    )
    .innerJoin(
      deliveryResponsibles,
      and(
        eq(deliveryResponsibles.workspaceId, cronogramaBlocks.workspaceId),
        eq(deliveryResponsibles.deliveryId, cronogramaBlocks.deliveryId),
      ),
    );
  const byId = new Map<string, StoredBlock>();
  const responsibles = new Map<string, string[]>();
  for (const row of rows) {
    byId.set(row.block.id, row.block);
    const assigned = responsibles.get(row.block.deliveryId) ?? [];
    if (!assigned.includes(row.userId)) assigned.push(row.userId);
    responsibles.set(row.block.deliveryId, assigned);
  }
  return { blocks: [...byId.values()], responsibles };
}

async function assertGlobalResponsibleOverlap(
  database: CronogramaDatabase,
  workspaceId: string,
  replacementBlocks: StoredBlock[],
  replacementResponsibles: Map<string, string[]>,
): Promise<void> {
  const global = await globalResponsibleState(database);
  for (const [deliveryId, userIds] of replacementResponsibles) {
    global.responsibles.set(deliveryId, userIds);
  }
  assertNoResponsibleOverlap(
    [
      ...global.blocks.filter((block) => block.workspaceId !== workspaceId),
      ...replacementBlocks,
    ],
    global.responsibles,
  );
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

function assertSequence(blocks: StoredBlock[], tasks: TaskRule[]): void {
  const blockByTask = new Map(
    blocks.map((block) => [block.taskId, block]),
  );
  const byDelivery = new Map<string, TaskRule[]>();
  for (const task of tasks) {
    byDelivery.set(task.deliveryId, [
      ...(byDelivery.get(task.deliveryId) ?? []),
      task,
    ]);
  }
  for (const group of byDelivery.values()) {
    for (let index = 0; index < group.length; index += 1) {
      const current = group[index]!;
      const currentBlock = blockByTask.get(current.id);
      if (!currentBlock) continue;
      for (let previousIndex = 0; previousIndex < index; previousIndex += 1) {
        const previous = group[previousIndex]!;
        const previousBlock = blockByTask.get(previous.id);
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
    for (const userId of responsibles.get(block.deliveryId) ?? []) {
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
  tasks: TaskRule[],
  responsibles: Map<string, string[]>,
  workdayBlocks: StoredBlock[] = [],
): Promise<void> {
  assertSequence(blocks, tasks);
  assertNoResponsibleOverlap(blocks, responsibles);
  const users = new Set<string>();
  for (const block of workdayBlocks) {
    const responsibleUserIds = responsibles.get(block.deliveryId) ?? [];
    for (const userId of responsibleUserIds) users.add(userId);
  }
  const preferences = await preferencesByUser(database, [...users]);
  for (const block of workdayBlocks) {
    const responsibleUserIds = responsibles.get(block.deliveryId) ?? [];
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
  tasks: TaskRule[];
  responsibles: Map<string, string[]>;
}> {
  const blocks = await activeStoredBlocks(database, workspaceId);
  const tasks = await activeTasks(database, workspaceId);
  const responsibles = await responsibleMap(database, workspaceId);
  return { blocks, tasks, responsibles };
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
  taskId: string,
  input: CronogramaBlockInput,
): Promise<CronogramaSnapshot> {
  const workspaceId = input.workspaceId ?? workspaceIdFromContext(context);
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
      const task = state.tasks.find(({ id }) => id === taskId);
      if (!task) throw new CronogramaTaskNotFoundError();
      if (
        !(state.responsibles.get(task.deliveryId) ?? []).includes(
          context.user.id,
        )
      ) {
        throw new CronogramaRuleViolationError(
          "Somente o responsavel da tarefa pode alocar esta tarefa no proprio Cronograma.",
        );
      }
      const current = state.blocks.find(
        (block) => block.taskId === taskId,
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
            deliveryId: task.deliveryId,
            taskId,
            scheduledDate: input.date,
            startMinutes: input.startMinutes,
            durationMinutes: input.durationMinutes,
            version: 1,
            createdAt: now,
            updatedAt: now,
          };
      const nextBlocks = [
        ...state.blocks.filter((block) => block.taskId !== taskId),
        candidate,
      ];
      await assertRules(
        transaction,
        nextBlocks,
        state.tasks,
        state.responsibles,
      );
      await assertGlobalResponsibleOverlap(
        transaction,
        workspaceId,
        nextBlocks,
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
          );
        if (affectedRows(updated) !== 1) throw new CronogramaVersionConflictError();
      } else {
        await transaction.insert(cronogramaBlocks).values({
          workspaceId,
          deliveryId: task.deliveryId,
          taskId,
          scheduledDate: input.date,
          startMinutes: input.startMinutes,
          durationMinutes: input.durationMinutes,
        });
      }
      await appendDataChangeAuditLog(transaction, {
        userId: context.user.id,
        workspaceId,
      }, {
        action: current ? "cronograma.block_changed" : "cronograma.block_created",
        targetType: "cronograma",
        targetId: current?.id ?? taskId,
        changes: [
          { field: "date", before: current?.scheduledDate ?? null, after: input.date },
          { field: "startMinutes", before: current?.startMinutes ?? null, after: input.startMinutes },
          { field: "durationMinutes", before: current?.durationMinutes ?? null, after: input.durationMinutes },
        ].filter((change) => change.before !== change.after),
        metadata: { deliveryId: task.deliveryId, taskId },
      });
      return readSnapshot(transaction, workspaceId, {
        responsibleUserId: context.user.id,
      });
    })
    .catch((cause: unknown) => {
      if (
        databaseConstraint(cause) === "cronograma_blocks_responsible_no_overlap"
      ) {
        throw new CronogramaRuleViolationError(
          "O responsável já possui outra tarefa programada nesse horário.",
        );
      }
      throw cause;
    });
}

export async function deleteCronogramaBlock(
  database: Database,
  context: RequestAuthorizationContext,
  taskId: string,
  input: CronogramaDeleteInput,
): Promise<CronogramaSnapshot> {
  const workspaceId = input.workspaceId ?? workspaceIdFromContext(context);
  return database.transaction(async (transaction) => {
    await requireWorkspacePermissionForUpdate(
      transaction,
      context.user.id,
      workspaceId,
      "workspace:write",
    );
    await lockWorkspace(transaction, workspaceId);
    const state = await mutationState(transaction, workspaceId);
    const current = state.blocks.find((block) => block.taskId === taskId);
    if (!current || current.version !== input.version) {
      throw new CronogramaVersionConflictError();
    }
    if (
      !(state.responsibles.get(current.deliveryId) ?? []).includes(context.user.id)
    ) {
      throw new CronogramaRuleViolationError(
        "Somente o responsavel da tarefa pode retirar esta tarefa do proprio Cronograma.",
      );
    }
    const nextBlocks = state.blocks.filter(
      (block) => block.taskId !== taskId,
    );
    await assertRules(
      transaction,
      nextBlocks,
      state.tasks,
      state.responsibles,
    );
      await assertGlobalResponsibleOverlap(
        transaction,
        workspaceId,
        nextBlocks,
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
      );
    if (affectedRows(deleted) !== 1) throw new CronogramaVersionConflictError();
    await appendDataChangeAuditLog(transaction, {
      userId: context.user.id,
      workspaceId,
    }, {
      action: "cronograma.block_deleted",
      targetType: "cronograma",
      targetId: current.id,
      changes: [
        { field: "date", before: current.scheduledDate, after: null },
        { field: "startMinutes", before: current.startMinutes, after: null },
        { field: "durationMinutes", before: current.durationMinutes, after: null },
      ],
      metadata: { deliveryId: current.deliveryId, taskId },
    });
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
      const taskById = new Map(
        state.tasks.map((task) => [task.id, task]),
      );
      const currentByTaskId = new Map(
        state.blocks.map((block) => [block.taskId, block]),
      );
      const now = new Date();

      const candidates = input.blocks.map((block): StoredBlock => {
        const task = taskById.get(block.taskId);
        if (!task) throw new CronogramaTaskNotFoundError();
        if (
          !(state.responsibles.get(task.deliveryId) ?? []).includes(
            context.user.id,
          )
        ) {
          throw new CronogramaRuleViolationError(
            "Somente o responsável da tarefa pode reorganizar esta tarefa.",
          );
        }
        const current = currentByTaskId.get(block.taskId);
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
              deliveryId: task.deliveryId,
              taskId: task.id,
              scheduledDate: block.date,
              startMinutes: block.startMinutes,
              durationMinutes: block.durationMinutes,
              version: 1,
              createdAt: now,
              updatedAt: now,
            };
      });

      const replacedIds = new Set(
        input.blocks.map(({ taskId }) => taskId),
      );
      const nextBlocks = [
        ...state.blocks.filter((block) => !replacedIds.has(block.taskId)),
        ...candidates,
      ];
      await assertRules(
        transaction,
        nextBlocks,
        state.tasks,
        state.responsibles,
        candidates,
      );
      await assertGlobalResponsibleOverlap(
        transaction,
        workspaceId,
        nextBlocks,
        state.responsibles,
      );

      const existingIds = candidates
        .filter((candidate) => currentByTaskId.has(candidate.taskId))
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
      for (const candidate of candidates) {
        const previous = currentByTaskId.get(candidate.taskId);
        await appendDataChangeAuditLog(transaction, {
          userId: context.user.id,
          workspaceId,
        }, {
          action: previous
            ? "cronograma.block_changed"
            : "cronograma.block_created",
          targetType: "cronograma",
          targetId: candidate.id,
          changes: [
            {
              field: "date",
              before: previous?.scheduledDate ?? null,
              after: candidate.scheduledDate,
            },
            {
              field: "startMinutes",
              before: previous?.startMinutes ?? null,
              after: candidate.startMinutes,
            },
            {
              field: "durationMinutes",
              before: previous?.durationMinutes ?? null,
              after: candidate.durationMinutes,
            },
          ].filter((change) => change.before !== change.after),
          metadata: { deliveryId: candidate.deliveryId, taskId: candidate.taskId },
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
          "O responsável já possui outra tarefa programada nesse horário.",
        );
      }
      throw cause;
    });
}
