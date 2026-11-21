import type {
  FinancialEntryContentInput,
  FinancialQuery,
  FinancialSnapshot,
} from "./api-types";
import type { FinanceEntry, FinanceEntryDraft } from "./finance";
import {
  jsonRequest,
  requestJson,
  type FetchLike,
} from "../http/client";

export class FinanceApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "FinanceApiError";
  }
}

function request(
  path: string,
  init: RequestInit | undefined,
  fetcher: FetchLike,
): Promise<FinancialSnapshot> {
  return requestJson<FinancialSnapshot>(fetcher, path, init, {
    fallbackMessage: "Não foi possível concluir a operação financeira.",
    createError: (status, message) => new FinanceApiError(status, message),
  });
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
    jsonRequest("POST", draftToFinancialInput(draft)),
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
    jsonRequest("PUT", { ...draftToFinancialInput(draft), version }),
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
    jsonRequest("PATCH", { version, action }),
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
    jsonRequest("DELETE", { version }),
    fetcher,
  );
}
