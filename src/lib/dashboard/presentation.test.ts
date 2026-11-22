import { describe, expect, it } from "vitest";
import type { EntityRecord } from "$lib/entities/types";
import type { ScheduleTask } from "$lib/cronograma/types";
import {
  buildSchedulePreview,
  localIso,
  recordDate,
  scheduledIn,
  weekBounds,
  workdayStyle,
} from "./presentation";

const task = (overrides: Partial<ScheduleTask> = {}): ScheduleTask => ({
  id: "subtask-1",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  taskId: "task-1",
  taskNome: "Planejamento",
  subtaskId: "subtask-1",
  sequence: 1,
  subtaskCount: 1,
  nome: "Definir escopo",
  duracao: "30 min",
  ...overrides,
});

describe("dashboard presentation", () => {
  it("uses local calendar dates when defining the week", () => {
    const date = new Date(2026, 6, 15, 12);

    expect(localIso(date)).toBe("2026-07-15");
    expect(weekBounds(date)).toEqual(["2026-07-13", "2026-07-19"]);
  });

  it("uses the canonical delivery fields when calculating pending work", () => {
    const records = [
      {
        id: "task-1",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
        status: "aberto",
        dataEntrega: "2026-07-15",
      },
      {
        id: "task-2",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
        status: "concluido",
        dueDate: "2026-07-15",
      },
    ] as EntityRecord[];

    expect(recordDate(records[0]!, "task")).toBe("2026-07-15");
    expect(scheduledIn(records, "task", "2026-07-15")).toBe(1);
  });

  it("renders the current half-hour slot from today's schedule only", () => {
    const preview = buildSchedulePreview(
      [
        {
          task: task(),
          entry: { date: "2026-07-15", startMinutes: 600, durationSlots: 2 },
        },
      ],
      615,
    );

    expect(preview).toHaveLength(5);
    expect(preview[2]).toMatchObject({
      current: true,
      state: "current",
      title: "Definir escopo",
    });
  });

  it("keeps workday load styles bounded to the visual scale", () => {
    expect(workdayStyle(30)).toContain("--workday-load: 100%");
  });
});
