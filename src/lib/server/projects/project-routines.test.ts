import { describe, expect, it } from "vitest";
import {
  initialRoutineOccurrenceDate,
  institutionalOccurrenceDate,
  nextCycleOccurrenceDate,
  RECURRENCE_ANCHOR_UNIT,
  routineAnchorFromDueDate,
} from "./project-routines";

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

describe("âncora de data e rollover de entregas recorrentes", () => {
  it("mantém o dia da semana escolhido como âncora na recorrência semanal", () => {
    // 2026-11-28 é sábado (UTC day 6)
    const anchor = routineAnchorFromDueDate("weekly", "2026-11-28");
    expect(anchor).toEqual({
      recurrenceUnit: RECURRENCE_ANCHOR_UNIT,
      recurrenceDays: "[6]",
    });
    expect(
      nextCycleOccurrenceDate(
        "weekly",
        "2026-11-25",
        anchor.recurrenceUnit,
        anchor.recurrenceDays,
      ),
    ).toBe("2026-11-28");
    expect(
      nextCycleOccurrenceDate(
        "weekly",
        "2026-11-29",
        anchor.recurrenceUnit,
        anchor.recurrenceDays,
      ),
    ).toBe("2026-12-05");
  });

  it("preserva o dia âncora 31 na recorrência mensal ao passar por fevereiro", () => {
    const anchor = routineAnchorFromDueDate("monthly", "2026-01-31");
    expect(anchor).toEqual({
      recurrenceUnit: RECURRENCE_ANCHOR_UNIT,
      recurrenceDays: "[31]",
    });
    expect(
      nextCycleOccurrenceDate(
        "monthly",
        "2026-02-01",
        anchor.recurrenceUnit,
        anchor.recurrenceDays,
      ),
    ).toBe("2026-02-28");
    expect(
      nextCycleOccurrenceDate(
        "monthly",
        "2026-03-01",
        anchor.recurrenceUnit,
        anchor.recurrenceDays,
      ),
    ).toBe("2026-03-31");
  });

  it("permite rollover sem data quando dueDate é null", () => {
    const anchor = routineAnchorFromDueDate("weekly", null);
    expect(anchor).toEqual({ recurrenceUnit: null, recurrenceDays: "[]" });
    expect(
      nextCycleOccurrenceDate(
        "weekly",
        "2026-11-23",
        anchor.recurrenceUnit,
        anchor.recurrenceDays,
      ),
    ).toBe("2026-11-27");
  });

  it("evita arquivamento imediato quando a entrega é criada com data no passado", () => {
    // 2026-11-20 é sexta passada; hoje é quarta 2026-11-25 -> âncora aponta próxima sexta 2026-11-27
    expect(
      initialRoutineOccurrenceDate("weekly", "2026-11-20", "2026-11-25"),
    ).toBe("2026-11-27");
    // Data futura/hoje usa a própria data como ocorrência ativa
    expect(
      initialRoutineOccurrenceDate("weekly", "2026-11-28", "2026-11-25"),
    ).toBe("2026-11-28");
  });
});
