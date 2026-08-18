export type FinancialEntryType = "revenue" | "expense";
export type FinancialEntryMode = "one_off" | "recurring";
export type FinancialEntryStatus = "open" | "paused" | "settled";
export type FinancialEntrySource = "manual" | "project";
export type FinancialSeriesKind = "installment" | "recurrence";

export type FinancialEntry = {
  id: string;
  workspaceId: string;
  projectId: string | null;
  projectName: string | null;
  businessName: string | null;
  source: FinancialEntrySource;
  type: FinancialEntryType;
  mode: FinancialEntryMode;
  title: string;
  category: string;
  notes: string;
  amountCents: number;
  competenceDate: string;
  dueDate: string;
  status: FinancialEntryStatus;
  seriesId: string | null;
  seriesKind: FinancialSeriesKind | null;
  seriesNumber: number | null;
  seriesCount: number | null;
  version: number;
  createdAt: string;
  updatedAt: string;
};

export type FinancialTotals = {
  revenueCents: number;
  expenseCents: number;
  settledRevenueCents: number;
  settledExpenseCents: number;
  openRevenueCents: number;
  openExpenseCents: number;
  balanceCents: number;
  expectedBalanceCents: number;
};

export type FinancialSnapshot = {
  workspaceId: string;
  entries: FinancialEntry[];
  totals: FinancialTotals;
};

export type FinancialInstallmentInput = {
  number: number;
  dueDate: string;
  amountCents: number;
};

export type FinancialEntryContentInput = {
  title: string;
  type: FinancialEntryType;
  mode: FinancialEntryMode;
  amountCents: number;
  competenceDate: string;
  dueDate: string;
  category: string;
  notes: string;
  recurrenceCount?: number;
  installments?: FinancialInstallmentInput[];
};

export type FinancialEntryUpdateInput = FinancialEntryContentInput & {
  version: number;
};

export type FinancialStateInput = {
  version: number;
  action: "settle" | "pause" | "resume";
};

export type FinancialDeleteInput = { version: number };

export type FinancialQuery = {
  workspaceId?: string;
  from?: string;
  to?: string;
  type?: FinancialEntryType;
  basis?: "due" | "competence";
};
