export type FinanceEntryType = "receita" | "despesa";
export type FinanceEntryMode = "pontual" | "fixa";

export type FinanceInstallment = {
  number: number;
  dueDate: string;
  amount: number;
};

export type FinanceEntry = {
  id: string;
  workspaceId: string;
  title: string;
  type: FinanceEntryType;
  amount: number;
  date: string;
  competenceDate: string;
  mode: FinanceEntryMode;
  category: string;
  notes: string;
  detail?: string;
  businessName?: string;
  projectId?: string;
  source: "projeto" | "manual";
  settled: boolean;
  paused: boolean;
  installmentGroupId?: string;
  installmentNumber?: number;
  installmentsCount?: number;
  recurrenceGroupId?: string;
  recurrenceNumber?: number;
  recurrenceCount?: number;
  version: number;
};

type FinanceEntryBaseDraft = Omit<
  FinanceEntry,
  | "id"
  | "workspaceId"
  | "source"
  | "settled"
  | "paused"
  | "installmentGroupId"
  | "installmentNumber"
  | "installmentsCount"
  | "recurrenceGroupId"
  | "recurrenceNumber"
  | "recurrenceCount"
  | "version"
  | "detail"
  | "businessName"
  | "projectId"
  | "competenceDate"
>;

export type FinanceEntryDraft = FinanceEntryBaseDraft & {
  competenceDate?: string;
  recurrenceMonths?: number;
  installments?: FinanceInstallment[];
};

export function formatMoney(value: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
  }).format(value);
}

export function formatFinanceDate(date: string): string {
  const [year, month, day] = date.split("-");
  return year && month && day ? `${day}.${month}.${year}` : date;
}

export function formatMonth(month: string): string {
  const [year, monthNumber] = month.split("-").map(Number);
  if (!year || !monthNumber) return "Planejamento financeiro";
  const label = new Intl.DateTimeFormat("pt-BR", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, monthNumber - 1, 1)));
  return label.charAt(0).toUpperCase() + label.slice(1);
}

export function parseMoney(value: string): number {
  const normalized = value
    .trim()
    .replace(/\s/g, "")
    .replace(/^R\$/i, "")
    .replace(/\.(?=\d{3}(?:\D|$))/g, "")
    .replace(",", ".")
    .replace(/[^0-9.-]/g, "");
  const amount = Number(normalized);
  return Number.isFinite(amount) ? Math.max(0, amount) : 0;
}

export function normalizeSearch(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR");
}
