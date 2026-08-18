import { randomUUID } from "node:crypto";
import { and, asc, eq, gte, isNull, lte, sql } from "drizzle-orm";
import type {
  FinancialDeleteInput,
  FinancialEntry,
  FinancialEntryContentInput,
  FinancialEntryUpdateInput,
  FinancialQuery,
  FinancialSnapshot,
  FinancialStateInput,
  FinancialTotals,
} from "../../finance/api-types";
import { appendAdministrativeAuditLog } from "../authorization/audit";
import type { RequestAuthorizationContext } from "../authorization/workspace-context";
import {
  requireActiveWorkspacePermission,
  requireWorkspacePermission,
  requireWorkspacePermissionForUpdate,
} from "../authorization/workspace-context";
import type { Database } from "../db/database";
import {
  businesses,
  financialEntries,
  projectInstallments,
  projects,
  workspaces,
} from "../db/schema";

type FinanceDatabase = Pick<
  Database,
  "select" | "insert" | "update" | "delete"
>;
type StoredEntry = typeof financialEntries.$inferSelect;

export class FinancialVersionConflictError extends Error {
  readonly status = 409;

  constructor() {
    super(
      "O lançamento financeiro foi alterado em outra sessão. Recarregue e tente novamente.",
    );
    this.name = "FinancialVersionConflictError";
  }
}

export class FinancialEntryNotFoundError extends Error {
  readonly status = 404;

  constructor() {
    super("O lançamento financeiro não existe neste workspace.");
    this.name = "FinancialEntryNotFoundError";
  }
}

export class FinancialInvalidOperationError extends Error {
  readonly status = 409;

  constructor(message = "A operação financeira não é válida.") {
    super(message);
    this.name = "FinancialInvalidOperationError";
  }
}

function workspaceIdFromContext(context: RequestAuthorizationContext): string {
  return requireActiveWorkspacePermission(context, "workspace:read").workspace
    .id;
}

function centsToDecimal(cents: number): string {
  if (!Number.isSafeInteger(cents) || cents <= 0) {
    throw new FinancialInvalidOperationError("O valor monetário é inválido.");
  }
  const whole = Math.trunc(cents / 100);
  const fraction = String(cents % 100).padStart(2, "0");
  return `${whole}.${fraction}`;
}

function decimalToCents(value: string): number {
  const match = /^(\d+)(?:\.(\d{1,2}))?$/u.exec(value);
  if (!match) throw new FinancialInvalidOperationError();
  const cents =
    BigInt(match[1]!) * 100n + BigInt((match[2] ?? "").padEnd(2, "0"));
  if (cents > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new FinancialInvalidOperationError(
      "O valor monetário excede o limite seguro.",
    );
  }
  return Number(cents);
}

function addMonths(value: string, offset: number): string {
  const [year, month, day] = value.split("-").map(Number);
  const target = new Date(Date.UTC(year!, month! - 1 + offset, 1));
  const lastDay = new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0),
  ).getUTCDate();
  return `${target.getUTCFullYear()}-${String(target.getUTCMonth() + 1).padStart(2, "0")}-${String(Math.min(day!, lastDay)).padStart(2, "0")}`;
}

async function lockWorkspace(
  database: FinanceDatabase,
  workspaceId: string,
): Promise<{ ownerUserId: string }> {
  const rows = await database
    .select({ ownerUserId: workspaces.ownerUserId })
    .from(workspaces)
    .where(eq(workspaces.id, workspaceId))
    .limit(1)
    .for("update");
  if (!rows[0]) throw new FinancialEntryNotFoundError();
  return rows[0];
}

function projectStatusSettled(status: string | null): boolean {
  return ["settled", "paid", "received", "pago", "recebido"].includes(
    status ?? "",
  );
}

async function synchronizeProjectEntries(
  database: FinanceDatabase,
  workspaceId: string,
  ownerUserId: string,
): Promise<void> {
  const sourceRows = await database
    .select({
      installment: projectInstallments,
      projectName: projects.name,
      projectNotes: projects.financeNotes,
    })
    .from(projectInstallments)
    .innerJoin(
      projects,
      and(
        eq(projects.workspaceId, projectInstallments.workspaceId),
        eq(projects.id, projectInstallments.projectId),
      ),
    )
    .where(eq(projectInstallments.workspaceId, workspaceId))
    .orderBy(
      asc(projectInstallments.projectId),
      asc(projectInstallments.number),
    );
  const existingRows = await database
    .select()
    .from(financialEntries)
    .where(
      and(
        eq(financialEntries.workspaceId, workspaceId),
        eq(financialEntries.source, "project"),
      ),
    );
  const existingByInstallment = new Map(
    existingRows.flatMap((row) =>
      row.projectInstallmentId
        ? [[row.projectInstallmentId, row] as const]
        : [],
    ),
  );
  const counts = new Map<string, number>();
  for (const { installment } of sourceRows) {
    counts.set(
      installment.projectId,
      (counts.get(installment.projectId) ?? 0) + 1,
    );
  }
  for (const source of sourceRows) {
    const { installment } = source;
    const current = existingByInstallment.get(installment.id);
    const amount = centsToDecimal(installment.amountCents);
    const settled = projectStatusSettled(installment.statusKey);
    const values = {
      projectId: installment.projectId,
      source: "project" as const,
      type: "revenue" as const,
      mode: "one_off" as const,
      title: source.projectName,
      category: "Contratos",
      notes: source.projectNotes ?? "",
      amount,
      competenceDate: installment.dueDate,
      dueDate: installment.dueDate,
      seriesId: installment.projectId,
      seriesKind: "installment" as const,
      seriesNumber: installment.number,
      seriesCount: counts.get(installment.projectId) ?? 1,
      updatedByUserId: ownerUserId,
    };
    if (!current) {
      await database.insert(financialEntries).values({
        workspaceId,
        projectInstallmentId: installment.id,
        ...values,
        status: settled ? "settled" : "open",
        settledAt: settled ? new Date() : null,
        createdByUserId: ownerUserId,
      });
      continue;
    }
    const changed =
      current.title !== values.title ||
      current.category !== values.category ||
      current.notes !== values.notes ||
      current.amount !== values.amount ||
      current.competenceDate !== values.competenceDate ||
      current.dueDate !== values.dueDate ||
      current.seriesNumber !== values.seriesNumber ||
      current.seriesCount !== values.seriesCount ||
      (settled && current.status !== "settled");
    if (!changed) continue;
    await database
      .update(financialEntries)
      .set({
        ...values,
        status: settled ? "settled" : current.status,
        settledAt: settled
          ? (current.settledAt ?? new Date())
          : current.settledAt,
        version: sql`${financialEntries.version} + 1`,
        updatedAt: new Date(),
      })
      .where(eq(financialEntries.id, current.id));
  }
}

function summarize(rows: StoredEntry[]): FinancialTotals {
  let revenueCents = 0;
  let expenseCents = 0;
  let settledRevenueCents = 0;
  let settledExpenseCents = 0;
  let openRevenueCents = 0;
  let openExpenseCents = 0;
  for (const row of rows) {
    const amount = decimalToCents(row.amount);
    if (row.type === "revenue") {
      revenueCents += amount;
      if (row.status === "settled") settledRevenueCents += amount;
      else if (row.status === "open") openRevenueCents += amount;
    } else {
      expenseCents += amount;
      if (row.status === "settled") settledExpenseCents += amount;
      else if (row.status === "open") openExpenseCents += amount;
    }
  }
  for (const total of [
    revenueCents,
    expenseCents,
    settledRevenueCents,
    settledExpenseCents,
    openRevenueCents,
    openExpenseCents,
  ]) {
    if (!Number.isSafeInteger(total)) {
      throw new FinancialInvalidOperationError(
        "O total monetário excede o limite seguro.",
      );
    }
  }
  return {
    revenueCents,
    expenseCents,
    settledRevenueCents,
    settledExpenseCents,
    openRevenueCents,
    openExpenseCents,
    balanceCents: settledRevenueCents - settledExpenseCents,
    expectedBalanceCents: revenueCents - expenseCents,
  };
}

async function readSnapshot(
  database: FinanceDatabase,
  workspaceId: string,
  query: FinancialQuery = {},
): Promise<FinancialSnapshot> {
  const basisColumn =
    query.basis === "competence"
      ? financialEntries.competenceDate
      : financialEntries.dueDate;
  const predicates = [
    eq(financialEntries.workspaceId, workspaceId),
    isNull(financialEntries.deletedAt),
  ];
  if (query.from) predicates.push(gte(basisColumn, query.from));
  if (query.to) predicates.push(lte(basisColumn, query.to));
  if (query.type) predicates.push(eq(financialEntries.type, query.type));
  const rows = await database
    .select({
      entry: financialEntries,
      projectName: projects.name,
      businessName: businesses.name,
    })
    .from(financialEntries)
    .leftJoin(
      projects,
      and(
        eq(projects.workspaceId, financialEntries.workspaceId),
        eq(projects.id, financialEntries.projectId),
      ),
    )
    .leftJoin(businesses, eq(businesses.id, projects.businessId))
    .where(and(...predicates))
    .orderBy(
      asc(financialEntries.dueDate),
      asc(financialEntries.seriesNumber),
      asc(financialEntries.id),
    );
  return {
    workspaceId,
    entries: rows.map(
      ({ entry, projectName, businessName }): FinancialEntry => ({
        id: entry.id,
        workspaceId: entry.workspaceId,
        projectId: entry.projectId,
        projectName,
        businessName,
        source: entry.source,
        type: entry.type,
        mode: entry.mode,
        title: entry.title,
        category: entry.category,
        notes: entry.notes,
        amountCents: decimalToCents(entry.amount),
        competenceDate: entry.competenceDate,
        dueDate: entry.dueDate,
        status: entry.status,
        seriesId: entry.seriesId,
        seriesKind: entry.seriesKind,
        seriesNumber: entry.seriesNumber,
        seriesCount: entry.seriesCount,
        version: entry.version,
        createdAt: entry.createdAt.toISOString(),
        updatedAt: entry.updatedAt.toISOString(),
      }),
    ),
    totals: summarize(rows.map(({ entry }) => entry)),
  };
}

function occurrenceValues(input: FinancialEntryContentInput): Array<{
  amountCents: number;
  competenceDate: string;
  dueDate: string;
  seriesNumber: number | null;
  seriesCount: number | null;
  seriesKind: "installment" | "recurrence" | null;
}> {
  if (input.installments?.length) {
    return input.installments.map((item) => ({
      amountCents: item.amountCents,
      competenceDate: item.dueDate,
      dueDate: item.dueDate,
      seriesNumber: item.number,
      seriesCount: input.installments!.length,
      seriesKind: "installment",
    }));
  }
  if (input.mode === "recurring") {
    const count = input.recurrenceCount!;
    return Array.from({ length: count }, (_, index) => ({
      amountCents: input.amountCents,
      competenceDate: addMonths(input.competenceDate, index),
      dueDate: addMonths(input.dueDate, index),
      seriesNumber: index + 1,
      seriesCount: count,
      seriesKind: "recurrence" as const,
    }));
  }
  return [
    {
      amountCents: input.amountCents,
      competenceDate: input.competenceDate,
      dueDate: input.dueDate,
      seriesNumber: null,
      seriesCount: null,
      seriesKind: null,
    },
  ];
}

async function insertManualOccurrences(
  database: FinanceDatabase,
  workspaceId: string,
  actorUserId: string,
  input: FinancialEntryContentInput,
): Promise<string[]> {
  const occurrences = occurrenceValues(input);
  const seriesId = occurrences.length > 1 ? randomUUID() : null;
  const rows = await database
    .insert(financialEntries)
    .values(
      occurrences.map((item) => ({
        workspaceId,
        source: "manual" as const,
        type: input.type,
        mode: input.mode,
        title: input.title,
        category: input.category,
        notes: input.notes,
        amount: centsToDecimal(item.amountCents),
        competenceDate: item.competenceDate,
        dueDate: item.dueDate,
        seriesId,
        seriesKind: item.seriesKind,
        seriesNumber: item.seriesNumber,
        seriesCount: item.seriesCount,
        createdByUserId: actorUserId,
        updatedByUserId: actorUserId,
      })),
    )
    .returning({ id: financialEntries.id });
  return rows.map(({ id }) => id);
}

async function activeEntryForUpdate(
  database: FinanceDatabase,
  workspaceId: string,
  entryId: string,
): Promise<StoredEntry> {
  const rows = await database
    .select()
    .from(financialEntries)
    .where(
      and(
        eq(financialEntries.workspaceId, workspaceId),
        eq(financialEntries.id, entryId),
        isNull(financialEntries.deletedAt),
      ),
    )
    .limit(1)
    .for("update");
  if (!rows[0]) throw new FinancialEntryNotFoundError();
  return rows[0];
}

export async function getFinancialSnapshot(
  database: Database,
  context: RequestAuthorizationContext,
  query: FinancialQuery = {},
): Promise<FinancialSnapshot> {
  const workspaceId = query.workspaceId ?? workspaceIdFromContext(context);
  return database.transaction(async (transaction) => {
    await requireWorkspacePermission(
      transaction,
      context.user.id,
      workspaceId,
      "workspace:read",
    );
    const { ownerUserId } = await lockWorkspace(transaction, workspaceId);
    await synchronizeProjectEntries(transaction, workspaceId, ownerUserId);
    return readSnapshot(transaction, workspaceId, query);
  });
}

export async function createFinancialEntry(
  database: Database,
  context: RequestAuthorizationContext,
  input: FinancialEntryContentInput,
): Promise<FinancialSnapshot> {
  const workspaceId = workspaceIdFromContext(context);
  return database.transaction(async (transaction) => {
    const access = await requireWorkspacePermissionForUpdate(
      transaction,
      context.user.id,
      workspaceId,
      "workspace:write",
    );
    await lockWorkspace(transaction, workspaceId);
    const ids = await insertManualOccurrences(
      transaction,
      workspaceId,
      context.user.id,
      input,
    );
    await appendAdministrativeAuditLog(
      transaction,
      { userId: context.user.id, workspace: access },
      {
        action: "finance.create",
        targetType: "financial_entry",
        targetId: ids[0],
        metadata: { occurrenceCount: ids.length, type: input.type },
      },
    );
    return readSnapshot(transaction, workspaceId);
  });
}

export async function updateFinancialEntry(
  database: Database,
  context: RequestAuthorizationContext,
  entryId: string,
  input: FinancialEntryUpdateInput,
): Promise<FinancialSnapshot> {
  const workspaceId = workspaceIdFromContext(context);
  return database.transaction(async (transaction) => {
    const access = await requireWorkspacePermissionForUpdate(
      transaction,
      context.user.id,
      workspaceId,
      "workspace:write",
    );
    await lockWorkspace(transaction, workspaceId);
    const current = await activeEntryForUpdate(
      transaction,
      workspaceId,
      entryId,
    );
    if (current.version !== input.version)
      throw new FinancialVersionConflictError();
    if (current.source !== "manual") {
      throw new FinancialInvalidOperationError(
        "Lançamentos automáticos devem ser editados no projeto de origem.",
      );
    }
    const affected = current.seriesId
      ? await transaction
          .select()
          .from(financialEntries)
          .where(
            and(
              eq(financialEntries.workspaceId, workspaceId),
              eq(financialEntries.seriesId, current.seriesId),
              isNull(financialEntries.deletedAt),
            ),
          )
          .for("update")
      : [current];
    if (affected.some(({ status }) => status === "settled")) {
      throw new FinancialInvalidOperationError(
        "Uma série com lançamento liquidado não pode ser reestruturada.",
      );
    }
    const now = new Date();
    await transaction
      .update(financialEntries)
      .set({
        deletedAt: now,
        updatedAt: now,
        updatedByUserId: context.user.id,
        version: sql`${financialEntries.version} + 1`,
      })
      .where(
        current.seriesId
          ? and(
              eq(financialEntries.workspaceId, workspaceId),
              eq(financialEntries.seriesId, current.seriesId),
              isNull(financialEntries.deletedAt),
            )
          : and(
              eq(financialEntries.workspaceId, workspaceId),
              eq(financialEntries.id, current.id),
              isNull(financialEntries.deletedAt),
            ),
      );
    const ids = await insertManualOccurrences(
      transaction,
      workspaceId,
      context.user.id,
      input,
    );
    await appendAdministrativeAuditLog(
      transaction,
      { userId: context.user.id, workspace: access },
      {
        action: "finance.update",
        targetType: "financial_entry",
        targetId: entryId,
        metadata: {
          replacementIds: ids,
          previousOccurrenceCount: affected.length,
        },
      },
    );
    return readSnapshot(transaction, workspaceId);
  });
}

export async function changeFinancialEntryState(
  database: Database,
  context: RequestAuthorizationContext,
  entryId: string,
  input: FinancialStateInput,
): Promise<FinancialSnapshot> {
  const workspaceId = workspaceIdFromContext(context);
  return database.transaction(async (transaction) => {
    const access = await requireWorkspacePermissionForUpdate(
      transaction,
      context.user.id,
      workspaceId,
      "workspace:write",
    );
    await lockWorkspace(transaction, workspaceId);
    const current = await activeEntryForUpdate(
      transaction,
      workspaceId,
      entryId,
    );
    if (current.version !== input.version)
      throw new FinancialVersionConflictError();
    if (input.action === "settle" && current.status === "settled") {
      throw new FinancialInvalidOperationError(
        "O lançamento já foi liquidado.",
      );
    }
    if (input.action === "pause" && current.status !== "open") {
      throw new FinancialInvalidOperationError(
        "Somente lançamentos em aberto podem ser pausados.",
      );
    }
    if (input.action === "resume" && current.status !== "paused") {
      throw new FinancialInvalidOperationError(
        "Somente lançamentos pausados podem ser retomados.",
      );
    }
    const status =
      input.action === "settle"
        ? "settled"
        : input.action === "pause"
          ? "paused"
          : "open";
    const now = new Date();
    const updated = await transaction
      .update(financialEntries)
      .set({
        status,
        settledAt: status === "settled" ? now : null,
        settledByUserId: status === "settled" ? context.user.id : null,
        updatedByUserId: context.user.id,
        updatedAt: now,
        version: sql`${financialEntries.version} + 1`,
      })
      .where(
        and(
          eq(financialEntries.id, current.id),
          eq(financialEntries.version, input.version),
        ),
      )
      .returning({ id: financialEntries.id });
    if (updated.length !== 1) throw new FinancialVersionConflictError();
    if (status === "settled" && current.projectInstallmentId) {
      await transaction
        .update(projectInstallments)
        .set({ statusKey: "settled", updatedAt: now })
        .where(eq(projectInstallments.id, current.projectInstallmentId));
    }
    await appendAdministrativeAuditLog(
      transaction,
      { userId: context.user.id, workspace: access },
      {
        action: `finance.${input.action}`,
        targetType: "financial_entry",
        targetId: entryId,
        metadata: { previousStatus: current.status, status },
      },
    );
    return readSnapshot(transaction, workspaceId);
  });
}

export async function deleteFinancialEntry(
  database: Database,
  context: RequestAuthorizationContext,
  entryId: string,
  input: FinancialDeleteInput,
): Promise<FinancialSnapshot> {
  const workspaceId = workspaceIdFromContext(context);
  return database.transaction(async (transaction) => {
    const access = await requireWorkspacePermissionForUpdate(
      transaction,
      context.user.id,
      workspaceId,
      "workspace:write",
    );
    await lockWorkspace(transaction, workspaceId);
    const current = await activeEntryForUpdate(
      transaction,
      workspaceId,
      entryId,
    );
    if (current.version !== input.version)
      throw new FinancialVersionConflictError();
    const now = new Date();
    const deleted = await transaction
      .update(financialEntries)
      .set({
        deletedAt: now,
        updatedAt: now,
        updatedByUserId: context.user.id,
        version: sql`${financialEntries.version} + 1`,
      })
      .where(
        and(
          eq(financialEntries.id, current.id),
          eq(financialEntries.version, input.version),
          isNull(financialEntries.deletedAt),
        ),
      )
      .returning({ id: financialEntries.id });
    if (deleted.length !== 1) throw new FinancialVersionConflictError();
    await appendAdministrativeAuditLog(
      transaction,
      { userId: context.user.id, workspace: access },
      {
        action: "finance.delete",
        targetType: "financial_entry",
        targetId: entryId,
        metadata: {
          source: current.source,
          amountCents: decimalToCents(current.amount),
        },
      },
    );
    return readSnapshot(transaction, workspaceId);
  });
}
