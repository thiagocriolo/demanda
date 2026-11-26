import { describe, expect, it } from "vitest";
import {
  formatRecurrenceLabel,
  formatServiceHours,
  summarizeServicePackage,
} from "./types";

describe("service package metrics & formatting", () => {
  it("calcula projetos, entregas, tarefas, horas e valor/hora estimado", () => {
    const metrics = summarizeServicePackage(
      [
        {
          isInstitutional: true,
          projectType: "one_off",
          deliveries: [],
        },
        {
          isInstitutional: false,
          projectType: "one_off",
          deliveries: [
            {
              tasks: [{ durationMinutes: 60 }, { durationMinutes: 90 }],
            },
          ],
        },
        {
          isInstitutional: false,
          projectType: "recurring",
          deliveries: [
            {
              tasks: [{ durationMinutes: 90 }],
            },
          ],
        },
      ],
      400_000, // R$ 4.000,00 em 4h = R$ 1.000,00/h
    );

    expect(metrics.totalProjects).toBe(3);
    expect(metrics.explicitProjects).toBe(2);
    expect(metrics.oneOffProjects).toBe(1);
    expect(metrics.recurringProjects).toBe(1);
    expect(metrics.totalDeliveries).toBe(2);
    expect(metrics.totalTasks).toBe(3);
    expect(metrics.totalMinutes).toBe(240);
    expect(metrics.hourlyRateCents).toBe(100_000);
  });

  it("formata horas e recorrências de forma legível", () => {
    expect(formatServiceHours(0)).toBe("0h");
    expect(formatServiceHours(60)).toBe("1h");
    expect(formatServiceHours(90)).toBe("1,5h");
    expect(formatRecurrenceLabel("one_off", null, [])).toBe("Única");
    expect(formatRecurrenceLabel("weekly", null, [0])).toBe("Semanal");
    expect(formatRecurrenceLabel("custom", "week", [1, 3, 5])).toBe(
      "Seg, Qua, Sex",
    );
  });
});
