import type {
  FinancialEntryContentInput,
  FinancialQuery,
  FinancialSnapshot,
} from "./api-types";
import type { FinanceEntry, FinanceEntryDraft } from "./finance";
import {
  GLOBAL_WORKSPACE_SCOPE_ID,
  isGlobalWorkspaceScope,
  workspaceIdsForRequestScope,
} from "../workspaces/workspace-scope";

type FetchLike = typeof fetch;

export class FinanceApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "FinanceApiError";
  }
}

async function request(
  path: string,
  init: RequestInit | undefined,
  fetcher: FetchLike,
): Promise<FinancialSnapshot> {
  const response = await fetcher(path, init);
  if (!response.ok) {
    let message = "Não foi possível concluir a operação financeira.";
    try {
      const payload = (await response.json()) as { message?: unknown };
      if (typeof payload.message === "string") message = payload.message;
    } catch {
      // Respostas sem JSON usam a mensagem segura acima.
    }
    throw new FinanceApiError(response.status, message);
  }
  return (await response.json()) as FinancialSnapshot;
}

function cents(value: number): number {
  return Math.round(value * 100);
}

export function draftToFinancialInput(
  draft: FinanceEntryDraft,
): FinancialEntryContentInput {
  return {
    title: draft.title,
    type: draft.type === "receita" ? "revenue" : "expense",
    mode: draft.mode === "fixa" ? "recurring" : "one_off",
    amountCents: cents(draft.amount),
    competenceDate: draft.competenceDate ?? draft.date,
    dueDate: draft.date,
    category: draft.category,
    notes: draft.notes,
    recurrenceCount:
      draft.mode === "fixa" ? (draft.recurrenceMonths ?? 12) : undefined,
    installments: draft.installments?.map((item) => ({
      number: item.number,
      dueDate: item.dueDate,
      amountCents: cents(item.amount),
    })),
  };
}

export function financeEntriesFromSnapshot(
  snapshot: FinancialSnapshot,
): FinanceEntry[] {
  return snapshot.entries.map((entry) => ({
    id: entry.id,
    workspaceId: entry.workspaceId,
    title: entry.title,
    type: entry.type === "revenue" ? "receita" : "despesa",
    amount: entry.amountCents / 100,
    date: entry.dueDate,
    competenceDate: entry.competenceDate,
    mode: entry.mode === "recurring" ? "fixa" : "pontual",
    category: entry.category,
    notes: entry.notes,
    detail: entry.projectName ?? undefined,
    businessName: entry.businessName ?? undefined,
    projectId: entry.projectId ?? undefined,
    source: entry.source === "project" ? "projeto" : "manual",
    settled: entry.status === "settled",
    paused: entry.status === "paused",
    installmentGroupId:
      entry.seriesKind === "installment"
        ? (entry.seriesId ?? undefined)
        : undefined,
    installmentNumber:
      entry.seriesKind === "installment"
        ? (entry.seriesNumber ?? undefined)
        : undefined,
    installmentsCount:
      entry.seriesKind === "installment"
        ? (entry.seriesCount ?? undefined)
        : undefined,
    recurrenceGroupId:
      entry.seriesKind === "recurrence"
        ? (entry.seriesId ?? undefined)
        : undefined,
    recurrenceNumber:
      entry.seriesKind === "recurrence"
        ? (entry.seriesNumber ?? undefined)
        : undefined,
    recurrenceCount:
      entry.seriesKind === "recurrence"
        ? (entry.seriesCount ?? undefined)
        : undefined,
    version: entry.version,
  }));
}

export async function loadFinancialSnapshot(
  query: FinancialQuery = {},
  fetcher: FetchLike = fetch,
): Promise<FinancialSnapshot> {
  if (!query.workspaceId && isGlobalWorkspaceScope()) {
    const snapshots = await Promise.all(
      workspaceIdsForRequestScope().map((workspaceId) =>
        loadFinancialSnapshot({ ...query, workspaceId }, fetcher),
      ),
    );
    const sum = (key: keyof FinancialSnapshot["totals"]): number =>
      snapshots.reduce((total, snapshot) => total + snapshot.totals[key], 0);
    return {
      workspaceId: GLOBAL_WORKSPACE_SCOPE_ID,
      entries: snapshots.flatMap(({ entries }) => entries),
      totals: {
        revenueCents: sum("revenueCents"),
        expenseCents: sum("expenseCents"),
        settledRevenueCents: sum("settledRevenueCents"),
        settledExpenseCents: sum("settledExpenseCents"),
        openRevenueCents: sum("openRevenueCents"),
        openExpenseCents: sum("openExpenseCents"),
        balanceCents: sum("balanceCents"),
        expectedBalanceCents: sum("expectedBalanceCents"),
      },
    };
  }
  const params = new URLSearchParams();
  if (query.workspaceId) params.set("workspaceId", query.workspaceId);
  if (query.from) params.set("from", query.from);
  if (query.to) params.set("to", query.to);
  if (query.type) params.set("type", query.type);
  if (query.basis) params.set("basis", query.basis);
  return request(
    `/api/finance${params.size ? `?${params.toString()}` : ""}`,
    undefined,
    fetcher,
  );
}

export function createFinanceEntry(
  draft: FinanceEntryDraft,
  fetcher: FetchLike = fetch,
): Promise<FinancialSnapshot> {
  return request(
    "/api/finance",
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(draftToFinancialInput(draft)),
    },
    fetcher,
  );
}

export function updateFinanceEntry(
  entryId: string,
  version: number,
  draft: FinanceEntryDraft,
  fetcher: FetchLike = fetch,
): Promise<FinancialSnapshot> {
  return request(
    `/api/finance/${encodeURIComponent(entryId)}`,
    {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...draftToFinancialInput(draft), version }),
    },
    fetcher,
  );
}

export function changeFinanceEntryState(
  entryId: string,
  version: number,
  action: "settle" | "pause" | "resume",
  fetcher: FetchLike = fetch,
): Promise<FinancialSnapshot> {
  return request(
    `/api/finance/${encodeURIComponent(entryId)}/state`,
    {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ version, action }),
    },
    fetcher,
  );
}

export function deleteFinanceEntry(
  entryId: string,
  version: number,
  fetcher: FetchLike = fetch,
): Promise<FinancialSnapshot> {
  return request(
    `/api/finance/${encodeURIComponent(entryId)}`,
    {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ version }),
    },
    fetcher,
  );
}
