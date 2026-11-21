import {
  normalizeSearch,
  type FinanceEntry,
  type FinanceEntryMode,
  type FinanceEntryType,
} from "./finance";

export const MONTH_ENTRIES_PAGE_SIZE = 20;
export const UPCOMING_ENTRIES_LIMIT = 10;

export type FinanceModeFilter = "todas" | FinanceEntryMode;

export type PaginatedFinanceEntries<T> = {
  items: T[];
  hasMore: boolean;
  remainingCount: number;
};

export function compareFinanceEntriesByDate(
  a: FinanceEntry,
  b: FinanceEntry,
): number {
  return (
    a.date.localeCompare(b.date) ||
    (a.installmentNumber ?? a.recurrenceNumber ?? 0) -
      (b.installmentNumber ?? b.recurrenceNumber ?? 0) ||
    a.title.localeCompare(b.title, "pt-BR") ||
    a.id.localeCompare(b.id)
  );
}

export function paginateFinanceEntries<T>(
  entries: readonly T[],
  visibleCount: number,
): PaginatedFinanceEntries<T> {
  const safeLimit = Math.max(0, visibleCount);
  const items = entries.slice(0, safeLimit);
  const remainingCount = Math.max(0, entries.length - items.length);
  return {
    items,
    hasMore: remainingCount > 0,
    remainingCount,
  };
}

export function nextVisibleFinanceEntriesCount(
  currentCount: number,
  pageSize = MONTH_ENTRIES_PAGE_SIZE,
): number {
  return Math.max(0, currentCount) + pageSize;
}

export function matchesFinanceFilters(
  entry: FinanceEntry,
  options: {
    modeFilter?: FinanceModeFilter;
    search?: string;
  } = {},
): boolean {
  const modeFilter = options.modeFilter ?? "todas";
  if (modeFilter !== "todas" && entry.mode !== modeFilter) {
    return false;
  }
  const query = normalizeSearch((options.search ?? "").trim());
  if (!query) return true;
  const haystack = normalizeSearch(
    [entry.title, entry.category, entry.businessName, entry.notes]
      .filter(Boolean)
      .join(" "),
  );
  return haystack.includes(query);
}

export function resolveUpcomingStartDate(
  selectedMonth: string,
  todayIso: string,
): string {
  const currentMonth = todayIso.slice(0, 7);
  if (/^\d{4}-\d{2}$/.test(selectedMonth) && selectedMonth > currentMonth) {
    return `${selectedMonth}-01`;
  }
  return todayIso;
}

export function selectUpcomingFinanceEntries(
  entries: readonly FinanceEntry[],
  options: {
    fromDate: string;
    type?: FinanceEntryType;
    modeFilter?: FinanceModeFilter;
    search?: string;
    limit?: number;
  },
): FinanceEntry[] {
  const limit = options.limit ?? UPCOMING_ENTRIES_LIMIT;
  return entries
    .filter((entry) => {
      if (entry.settled || entry.paused) return false;
      if (entry.date < options.fromDate) return false;
      if (options.type && entry.type !== options.type) return false;
      return matchesFinanceFilters(entry, {
        modeFilter: options.modeFilter,
        search: options.search,
      });
    })
    .toSorted(compareFinanceEntriesByDate)
    .slice(0, limit);
}
