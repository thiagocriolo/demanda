import { describe, expect, it } from "vitest";
import {
  formatYearMonth,
  parseYearMonth,
  shiftMonth,
  type FinanceEntry,
} from "./finance";
import {
  MONTH_ENTRIES_PAGE_SIZE,
  UPCOMING_ENTRIES_LIMIT,
  nextVisibleFinanceEntriesCount,
  paginateFinanceEntries,
  resolveUpcomingStartDate,
  selectUpcomingFinanceEntries,
} from "./listings";

function makeEntry(overrides: Partial<FinanceEntry> = {}): FinanceEntry {
  return {
    id: overrides.id ?? "entry-1",
    workspaceId: overrides.workspaceId ?? "ws-1",
    title: overrides.title ?? "Lançamento",
    type: overrides.type ?? "receita",
    amount: overrides.amount ?? 100,
    date: overrides.date ?? "2026-11-20",
    competenceDate: overrides.competenceDate ?? overrides.date ?? "2026-11-20",
    mode: overrides.mode ?? "pontual",
    category: overrides.category ?? "Geral",
    notes: overrides.notes ?? "",
    source: overrides.source ?? "manual",
    settled: overrides.settled ?? false,
    paused: overrides.paused ?? false,
    version: overrides.version ?? 1,
    ...overrides,
  };
}

describe("listagens e paginação do Financeiro", () => {
  it("pagina receitas/despesas do mês de 20 em 20 até carregar todos os itens", () => {
    const entries = Array.from({ length: 45 }, (_, index) =>
      makeEntry({ id: `item-${index + 1}`, title: `Item ${index + 1}` }),
    );

    const firstPage = paginateFinanceEntries(entries, MONTH_ENTRIES_PAGE_SIZE);
    expect(firstPage.items).toHaveLength(20);
    expect(firstPage.hasMore).toBe(true);
    expect(firstPage.remainingCount).toBe(25);

    const secondLimit = nextVisibleFinanceEntriesCount(MONTH_ENTRIES_PAGE_SIZE);
    const secondPage = paginateFinanceEntries(entries, secondLimit);
    expect(secondPage.items).toHaveLength(40);
    expect(secondPage.hasMore).toBe(true);
    expect(secondPage.remainingCount).toBe(5);

    const thirdLimit = nextVisibleFinanceEntriesCount(secondLimit);
    const thirdPage = paginateFinanceEntries(entries, thirdLimit);
    expect(thirdPage.items).toHaveLength(45);
    expect(thirdPage.hasMore).toBe(false);
    expect(thirdPage.remainingCount).toBe(0);
  });

  it("não exibe carregar mais quando há 20 itens ou menos no mês", () => {
    const exactTwenty = Array.from({ length: 20 }, (_, index) =>
      makeEntry({ id: `item-${index + 1}` }),
    );
    const page = paginateFinanceEntries(exactTwenty, MONTH_ENTRIES_PAGE_SIZE);
    expect(page.items).toHaveLength(20);
    expect(page.hasMore).toBe(false);
    expect(page.remainingCount).toBe(0);
  });

  it("atravessa quantos meses forem necessários para listar as próximas 10 receitas em ordem de data", () => {
    const dates = [
      "2026-11-10", // passada -> ignorada
      "2026-11-20", // #1 (hoje)
      "2026-11-28", // #2
      "2026-12-15", // #3
      "2027-02-05", // #4 (pula jan/2027)
      "2027-03-10", // #5
      "2027-06-01", // #6 (pula abr-mai/2027)
      "2027-09-20", // #7
      "2028-01-12", // #8
      "2028-04-03", // #9
      "2028-11-30", // #10
      "2029-01-15", // #11 -> fora do limite de 10
    ];

    const entries: FinanceEntry[] = [
      ...dates.toReversed().map((date, idx) =>
        makeEntry({
          id: `rev-${idx}`,
          type: "receita",
          date,
          title: `Receita ${date}`,
        }),
      ),
      makeEntry({
        id: "rev-settled",
        type: "receita",
        date: "2026-11-21",
        settled: true,
      }),
      makeEntry({
        id: "rev-paused",
        type: "receita",
        date: "2026-11-22",
        paused: true,
      }),
      makeEntry({
        id: "exp-1",
        type: "despesa",
        date: "2026-11-23",
      }),
    ];

    const upcoming = selectUpcomingFinanceEntries(entries, {
      fromDate: "2026-11-20",
      type: "receita",
    });

    expect(upcoming).toHaveLength(UPCOMING_ENTRIES_LIMIT);
    expect(upcoming.map((entry) => entry.date)).toEqual([
      "2026-11-20",
      "2026-11-28",
      "2026-12-15",
      "2027-02-05",
      "2027-03-10",
      "2027-06-01",
      "2027-09-20",
      "2028-01-12",
      "2028-04-03",
      "2028-11-30",
    ]);
  });

  it("aplica a mesma lógica para despesas e respeita filtro de modalidade e busca", () => {
    const entries = [
      makeEntry({
        id: "e1",
        type: "despesa",
        mode: "fixa",
        title: "Aluguel escritório",
        date: "2026-11-25",
      }),
      makeEntry({
        id: "e2",
        type: "despesa",
        mode: "pontual",
        title: "Aluguel equipamento",
        date: "2026-12-02",
      }),
      makeEntry({
        id: "e3",
        type: "despesa",
        mode: "fixa",
        title: "Aluguel escritório",
        date: "2027-01-25",
      }),
      makeEntry({
        id: "r1",
        type: "receita",
        mode: "fixa",
        title: "Aluguel sublocação",
        date: "2026-11-21",
      }),
    ];

    const upcoming = selectUpcomingFinanceEntries(entries, {
      fromDate: "2026-11-20",
      type: "despesa",
      modeFilter: "fixa",
      search: "aluguel",
    });

    expect(upcoming.map((entry) => entry.id)).toEqual(["e1", "e3"]);
  });

  it("no painel combina receitas e despesas em ordem cronológica até 10 lançamentos", () => {
    const entries = [
      makeEntry({ id: "d1", type: "despesa", date: "2026-11-21" }),
      makeEntry({ id: "r1", type: "receita", date: "2026-11-20" }),
      makeEntry({ id: "d2", type: "despesa", date: "2026-12-05" }),
      makeEntry({ id: "r2", type: "receita", date: "2026-12-01" }),
      makeEntry({ id: "d3", type: "despesa", date: "2027-01-10" }),
      makeEntry({ id: "r3", type: "receita", date: "2027-01-03" }),
      makeEntry({ id: "d4", type: "despesa", date: "2027-03-01" }),
      makeEntry({ id: "r4", type: "receita", date: "2027-02-15" }),
      makeEntry({ id: "d5", type: "despesa", date: "2027-05-01" }),
      makeEntry({ id: "r5", type: "receita", date: "2027-04-20" }),
      makeEntry({ id: "r6", type: "receita", date: "2027-06-01" }),
    ];

    const upcoming = selectUpcomingFinanceEntries(entries, {
      fromDate: "2026-11-20",
    });

    expect(upcoming).toHaveLength(10);
    expect(upcoming.map((entry) => `${entry.type}:${entry.date}`)).toEqual([
      "receita:2026-11-20",
      "despesa:2026-11-21",
      "receita:2026-12-01",
      "despesa:2026-12-05",
      "receita:2027-01-03",
      "despesa:2027-01-10",
      "receita:2027-02-15",
      "despesa:2027-03-01",
      "receita:2027-04-20",
      "despesa:2027-05-01",
    ]);
  });

  it("usa a data atual no mês corrente ou passado e o início do mês ao navegar para meses futuros", () => {
    expect(resolveUpcomingStartDate("2026-11", "2026-11-20")).toBe(
      "2026-11-20",
    );
    expect(resolveUpcomingStartDate("2026-09", "2026-11-20")).toBe(
      "2026-11-20",
    );
    expect(resolveUpcomingStartDate("2027-01", "2026-11-20")).toBe(
      "2027-01-01",
    );
  });

  it("navega corretamente entre meses e viradas de ano", () => {
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
    expect(shiftMonth("2026-12", 1)).toBe("2027-01");
    expect(shiftMonth("2026-11", -2)).toBe("2026-09");
    expect(parseYearMonth("2026-07")).toEqual({ year: 2026, month: 7 });
    expect(formatYearMonth(2028, 3)).toBe("2028-03");
  });
});
