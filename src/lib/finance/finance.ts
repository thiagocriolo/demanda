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

export const MONTH_SHORT_LABELS = [
  "Jan",
  "Fev",
  "Mar",
  "Abr",
  "Mai",
  "Jun",
  "Jul",
  "Ago",
  "Set",
  "Out",
  "Nov",
  "Dez",
] as const;

export function parseYearMonth(value: string): { year: number; month: number } {
  const match = /^(\d{4})-(\d{2})$/.exec(value);
  if (!match) {
    const today = new Date();
    return { year: today.getFullYear(), month: today.getMonth() + 1 };
  }
  const year = Number(match[1]);
  const month = Math.min(12, Math.max(1, Number(match[2])));
  return { year, month };
}

export function formatYearMonth(year: number, month: number): string {
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}`;
}

export function shiftMonth(value: string, offset: number): string {
  const { year, month } = parseYearMonth(value);
  const date = new Date(Date.UTC(year, month - 1 + offset, 1));
  return formatYearMonth(date.getUTCFullYear(), date.getUTCMonth() + 1);
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
