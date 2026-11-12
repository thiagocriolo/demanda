import { describe, expect, it } from "vitest";
import { buildWeekDays, isoDate, resolveWeekStart } from "./date";

describe("janela de dias do cronograma", () => {
  it("mantem a data da URL como o primeiro dia visivel", () => {
    const start = resolveWeekStart("2026-08-18", new Date(2026, 7, 17, 12));
    const days = buildWeekDays(start, new Date(2026, 7, 17, 12), true);

    expect(isoDate(start)).toBe("2026-08-18");
    expect(days[0]).toMatchObject({ iso: "2026-08-18", shortLabel: "Ter" });
  });

  it("abre na segunda-feira quando nao ha data selecionada", () => {
    expect(isoDate(resolveWeekStart(null, new Date(2026, 7, 20, 12)))).toBe(
      "2026-08-17",
    );
  });

  it("cria uma faixa com dias adjacentes para a transicao horizontal", () => {
    const days = buildWeekDays(
      new Date(2026, 7, 16, 12),
      new Date(2026, 7, 16, 12),
      true,
      8,
    );

    expect(days).toHaveLength(8);
    expect(days[0]).toMatchObject({ iso: "2026-08-16", shortLabel: "Dom" });
    expect(days.at(-1)).toMatchObject({ iso: "2026-08-23", shortLabel: "Dom" });
  });
});
