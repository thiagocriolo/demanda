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
import { addMonthsToFinanceDate as addMonths } from "../../finance/installments";
import { recurringContractInstallments } from "../../contracts/recurrence";
import { appendAdministrativeAuditLog } from "../authorization/audit";
import type { RequestAuthorizationContext } from "../authorization/workspace-context";
import {
  requireWorkspacePermission,
  requireWorkspacePermissionForUpdate,
  workspaceIdFromContext,
} from "../authorization/workspace-context";
import { affectedRows, type Database } from "../db/database";
import {
  businesses,
  contractInstallments,
  contracts,
  financialEntries,
  projectInstallments,
  projects,
  workspaceMembers,
  workspaces,
} from "../db/schema";
import type { FinanceDatabase } from "./database";
import {
  FinancialEntryNotFoundError,
  FinancialInvalidOperationError,
  FinancialVersionConflictError,
} from "./errors";
import { centsToDecimal, decimalToCents } from "./money";

type StoredEntry = typeof financialEntries.$inferSelect;

export {
  FinancialEntryNotFoundError,
  FinancialInvalidOperationError,
  FinancialVersionConflictError,
} from "./errors";

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

function contractStatusSettled(status: string | null): boolean {
  return ["settled", "paid", "received", "pago", "recebido"].includes(
    status ?? "",
  );
}

/** Backfills the monthly occurrences of legacy recurring contracts once. */
async function materializeRecurringContractInstallments(
  database: FinanceDatabase,
  workspaceId: string,
): Promise<void> {
  const recurringContracts = await database
    .select({
      id: contracts.id,
      amountCents: contracts.amountCents,
      firstDueDate: contracts.firstDueDate,
      endDate: contracts.endDate,
    })
    .from(contracts)
    .where(
      and(
        eq(contracts.workspaceId, workspaceId),
        eq(contracts.contractType, "recurring"),
      ),
    );
  if (!recurringContracts.length) return;

  const existing = await database
    .select({ contractId: contractInstallments.contractId })
    .from(contractInstallments)
    .where(eq(contractInstallments.workspaceId, workspaceId));
  const contractIdsWithInstallments = new Set(
    existing.map(({ contractId }) => contractId),
  );
  const rows = recurringContracts.flatMap((contract) => {
    if (contractIdsWithInstallments.has(contract.id)) return [];
    return recurringContractInstallments({
      contractType: "recurring",
      amountCents: contract.amountCents,
      firstDueDate: contract.firstDueDate,
      endDate: contract.endDate,
    }).map(({ status, ...installment }) => ({
      workspaceId,
      contractId: contract.id,
      ...installment,
      statusKey: status,
    }));
  });
  if (rows.length) await database.insert(contractInstallments).values(rows);
}

async function synchronizeContractEntries(
  database: FinanceDatabase,
  workspaceId: string,
): Promise<void> {
  await materializeRecurringContractInstallments(database, workspaceId);
  const sourceRows = await database
    .select({
      installment: contractInstallments,
      contractName: contracts.name,
      contractNotes: contracts.financeNotes,
      contractType: contracts.contractType,
      contractOwnerUserId: contracts.ownerUserId,
    })
    .from(contractInstallments)
    .innerJoin(
      contracts,
      and(
        eq(contracts.workspaceId, contractInstallments.workspaceId),
        eq(contracts.id, contractInstallments.contractId),
      ),
    )
    .where(eq(contractInstallments.workspaceId, workspaceId))
    .orderBy(
      asc(contractInstallments.contractId),
      asc(contractInstallments.number),
    );
  const existingRows = await database
    .select()
    .from(financialEntries)
    .where(
      and(
        eq(financialEntries.workspaceId, workspaceId),
        eq(financialEntries.source, "contract"),
      ),
    );
  const existingByInstallment = new Map(
    existingRows.flatMap((row) =>
      row.contractInstallmentId
        ? [[row.contractInstallmentId, row] as const]
        : [],
    ),
  );
  const counts = new Map<string, number>();
  for (const { installment } of sourceRows) {
    counts.set(
      installment.contractId,
      (counts.get(installment.contractId) ?? 0) + 1,
    );
  }
  for (const source of sourceRows) {
    const { installment } = source;
    if (installment.amountCents <= 0) continue;
    const current = existingByInstallment.get(installment.id);
    const amount = centsToDecimal(installment.amountCents);
    const settled = contractStatusSettled(installment.statusKey);
    const values = {
      ownerUserId: source.contractOwnerUserId,
      contractId: installment.contractId,
      source: "contract" as const,
      type: "revenue" as const,
      mode: source.contractType,
      title: source.contractName,
      category: "Contratos",
      notes: source.contractNotes ?? "",
      amount,
      competenceDate: installment.dueDate,
      dueDate: installment.dueDate,
      seriesId: installment.contractId,
      seriesKind:
        source.contractType === "recurring"
          ? ("recurrence" as const)
          : ("installment" as const),
      seriesNumber: installment.number,
      seriesCount: counts.get(installment.contractId) ?? 1,
      updatedByUserId: source.contractOwnerUserId,
    };
    if (!current) {
      await database.insert(financialEntries).values({
        workspaceId,
        contractInstallmentId: installment.id,
        ...values,
        status: settled ? "settled" : "open",
        settledAt: settled ? new Date() : null,
        createdByUserId: source.contractOwnerUserId,
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

/**
 * Compatibility bridge for projects created before the contract migration.
 * New financial records are owned by contracts; this keeps historical project
 * records readable until their migration has completed.
 */
async function synchronizeLegacyProjectEntries(
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
  for (const { installment } of sourceRows)
    counts.set(
      installment.projectId,
      (counts.get(installment.projectId) ?? 0) + 1,
    );
  for (const source of sourceRows) {
    const { installment } = source;
    if (installment.amountCents <= 0) continue;
    const current = existingByInstallment.get(installment.id);
    const settled = contractStatusSettled(installment.statusKey);
    const values = {
      projectId: installment.projectId,
      ownerUserId,
      source: "project" as const,
      type: "revenue" as const,
      mode: "one_off" as const,
      title: source.projectName,
      category: "Contratos",
      notes: source.projectNotes ?? "",
      amount: centsToDecimal(installment.amountCents),
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
      current.notes !== values.notes ||
      current.amount !== values.amount ||
      current.competenceDate !== values.competenceDate ||
      current.dueDate !== values.dueDate ||
      current.seriesNumber !== values.seriesNumber ||
      current.seriesCount !== values.seriesCount ||
      (settled && current.status !== "settled");
    if (changed)
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
  scope: {
    ownerUserId: string;
    workspaceId?: string;
    responseWorkspaceId: string;
  },
  query: FinancialQuery = {},
): Promise<FinancialSnapshot> {
  const basisColumn =
    query.basis === "competence"
      ? financialEntries.competenceDate
      : financialEntries.dueDate;
  const predicates = [
    eq(financialEntries.ownerUserId, scope.ownerUserId),
    isNull(financialEntries.deletedAt),
  ];
  if (scope.workspaceId) {
    predicates.push(eq(financialEntries.workspaceId, scope.workspaceId));
  }
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
    .leftJoin(
      contracts,
      and(
        eq(contracts.workspaceId, financialEntries.workspaceId),
        eq(contracts.id, financialEntries.contractId),
      ),
    )
    .leftJoin(
      businesses,
      sql`${businesses.id} = coalesce(${contracts.businessId}, ${projects.businessId})`,
    )
    .where(and(...predicates))
    .orderBy(
      asc(financialEntries.dueDate),
      asc(financialEntries.seriesNumber),
      asc(financialEntries.id),
    );
  return {
    workspaceId: scope.responseWorkspaceId,
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
  const rows = occurrences.map((item) => ({
    id: randomUUID(),
    workspaceId,
    ownerUserId: actorUserId,
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
  }));
  await database.insert(financialEntries).values(rows);
  return rows.map(({ id }) => id);
}

async function activeEntryForUpdate(
  database: FinanceDatabase,
  ownerUserId: string,
  entryId: string,
): Promise<StoredEntry> {
  const rows = await database
    .select()
    .from(financialEntries)
    .where(
      and(
        eq(financialEntries.ownerUserId, ownerUserId),
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
  const activeWorkspaceId =
    query.workspaceId ?? workspaceIdFromContext(context);
  return database.transaction(async (transaction) => {
    await requireWorkspacePermission(
      transaction,
      context.user.id,
      activeWorkspaceId,
      "workspace:read",
    );
    if (query.workspaceId) {
      await lockWorkspace(transaction, query.workspaceId);
      await synchronizeContractEntries(transaction, query.workspaceId);
      await synchronizeLegacyProjectEntries(
        transaction,
        query.workspaceId,
        context.user.id,
      );
      return readSnapshot(
        transaction,
        {
          ownerUserId: context.user.id,
          workspaceId: query.workspaceId,
          responseWorkspaceId: query.workspaceId,
        },
        query,
      );
    }

    const syncWorkspaceIds = new Set<string>([activeWorkspaceId]);
    const ownedWorkspaceIds = new Set<string>([activeWorkspaceId]);
    const [memberWorkspaces, contractWorkspaces, ownedWorkspaces] =
      await Promise.all([
        transaction
          .select({ workspaceId: workspaceMembers.workspaceId })
          .from(workspaceMembers)
          .where(eq(workspaceMembers.userId, context.user.id)),
        transaction
          .select({ workspaceId: contracts.workspaceId })
          .from(contracts)
          .where(eq(contracts.ownerUserId, context.user.id)),
        transaction
          .select({ workspaceId: workspaces.id })
          .from(workspaces)
          .where(eq(workspaces.ownerUserId, context.user.id)),
      ]);
    for (const row of memberWorkspaces) syncWorkspaceIds.add(row.workspaceId);
    for (const row of contractWorkspaces) syncWorkspaceIds.add(row.workspaceId);
    for (const row of ownedWorkspaces) {
      syncWorkspaceIds.add(row.workspaceId);
      ownedWorkspaceIds.add(row.workspaceId);
    }

    for (const workspaceId of [...syncWorkspaceIds].toSorted()) {
      await lockWorkspace(transaction, workspaceId);
      await synchronizeContractEntries(transaction, workspaceId);
      if (ownedWorkspaceIds.has(workspaceId)) {
        await synchronizeLegacyProjectEntries(
          transaction,
          workspaceId,
          context.user.id,
        );
      }
    }

    return readSnapshot(
      transaction,
      {
        ownerUserId: context.user.id,
        responseWorkspaceId: activeWorkspaceId,
      },
      query,
    );
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
    return readSnapshot(transaction, {
      ownerUserId: context.user.id,
      responseWorkspaceId: workspaceId,
    });
  });
}

export async function updateFinancialEntry(
  database: Database,
  context: RequestAuthorizationContext,
  entryId: string,
  input: FinancialEntryUpdateInput,
): Promise<FinancialSnapshot> {
  return database.transaction(async (transaction) => {
    const current = await activeEntryForUpdate(
      transaction,
      context.user.id,
      entryId,
    );
    const workspaceId = current.workspaceId;
    const access = await requireWorkspacePermissionForUpdate(
      transaction,
      context.user.id,
      workspaceId,
      "workspace:write",
    );
    await lockWorkspace(transaction, workspaceId);
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
    return readSnapshot(transaction, {
      ownerUserId: context.user.id,
      responseWorkspaceId: workspaceId,
    });
  });
}

export async function changeFinancialEntryState(
  database: Database,
  context: RequestAuthorizationContext,
  entryId: string,
  input: FinancialStateInput,
): Promise<FinancialSnapshot> {
  return database.transaction(async (transaction) => {
    const current = await activeEntryForUpdate(
      transaction,
      context.user.id,
      entryId,
    );
    const workspaceId = current.workspaceId;
    const access = await requireWorkspacePermissionForUpdate(
      transaction,
      context.user.id,
      workspaceId,
      "workspace:write",
    );
    await lockWorkspace(transaction, workspaceId);
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
      );
    if (affectedRows(updated) !== 1) throw new FinancialVersionConflictError();
    if (status === "settled" && current.contractInstallmentId) {
      await transaction
        .update(contractInstallments)
        .set({ statusKey: "settled", updatedAt: now })
        .where(eq(contractInstallments.id, current.contractInstallmentId));
    }
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
    return readSnapshot(transaction, {
      ownerUserId: context.user.id,
      responseWorkspaceId: workspaceId,
    });
  });
}

export async function deleteFinancialEntry(
  database: Database,
  context: RequestAuthorizationContext,
  entryId: string,
  input: FinancialDeleteInput,
): Promise<FinancialSnapshot> {
  return database.transaction(async (transaction) => {
    const current = await activeEntryForUpdate(
      transaction,
      context.user.id,
      entryId,
    );
    const workspaceId = current.workspaceId;
    const access = await requireWorkspacePermissionForUpdate(
      transaction,
      context.user.id,
      workspaceId,
      "workspace:write",
    );
    await lockWorkspace(transaction, workspaceId);
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
      );
    if (affectedRows(deleted) !== 1) throw new FinancialVersionConflictError();
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
    return readSnapshot(transaction, {
      ownerUserId: context.user.id,
      responseWorkspaceId: workspaceId,
    });
  });
}
