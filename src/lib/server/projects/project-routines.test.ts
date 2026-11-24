import { describe, expect, it } from "vitest";
import { institutionalOccurrenceDate } from "./project-routines";

describe("institutionalOccurrenceDate", () => {
  it("usa o dia corrente para a rotina diária", () => {
    expect(institutionalOccurrenceDate("daily", "2026-11-23")).toBe(
      "2026-11-23",
    );
  });

  it("usa a sexta-feira da semana para a rotina semanal", () => {
    expect(institutionalOccurrenceDate("weekly", "2026-11-23")).toBe(
      "2026-11-27",
    );
    expect(institutionalOccurrenceDate("weekly", "2026-11-28")).toBe(
      "2026-12-04",
    );
  });

  it("usa o último dia útil do mês para a rotina mensal", () => {
    expect(institutionalOccurrenceDate("monthly", "2026-11-01")).toBe(
      "2026-11-30",
    );
    expect(institutionalOccurrenceDate("monthly", "2026-11-30")).toBe(
      "2026-11-30",
    );
  });
});
