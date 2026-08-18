import { describe, expect, it } from "vitest";
import { autoScheduleScore, autoScheduleWeek } from "./auto-schedule";
import type { ScheduleTask } from "./types";

function task(id: string, overrides: Partial<ScheduleTask> = {}): ScheduleTask {
  return {
    id,
    taskId: overrides.taskId ?? id,
    subtaskId: id,
    taskNome: overrides.taskNome ?? `Tarefa ${id}`,
    nome: overrides.nome ?? `Subtarefa ${id}`,
    sequence: overrides.sequence ?? 0,
    subtaskCount: overrides.subtaskCount ?? 1,
    duracao: overrides.duracao ?? "1",
    createdAt: overrides.createdAt ?? "2026-08-01T10:00:00.000Z",
    updatedAt: overrides.updatedAt ?? "2026-08-01T10:00:00.000Z",
    status: overrides.status ?? "pendente",
    taskStatus: overrides.taskStatus ?? "fila",
    priority: overrides.priority ?? "normal",
    responsibleUserIds: overrides.responsibleUserIds ?? '["user-1"]',
    ...overrides,
  };
}

const week = [
  "2026-08-17",
  "2026-08-18",
  "2026-08-19",
  "2026-08-20",
  "2026-08-21",
];

describe("autoScheduleWeek", () => {
  it("prioriza prazo, status, prioridade e antiguidade de forma explicável", () => {
    const overdue = task("overdue", {
      dueDate: "2026-08-16",
      priority: "baixa",
      taskStatus: "planejamento",
    });
    const urgent = task("urgent", { priority: "urgente" });
    const normal = task("normal");

    expect(autoScheduleScore(overdue, week[0]!)).toBeGreaterThan(
      autoScheduleScore(urgent, week[0]!),
    );
    expect(autoScheduleScore(urgent, week[0]!)).toBeGreaterThan(
      autoScheduleScore(normal, week[0]!),
    );
  });

  it("agenda subtarefas em sequência e ocupa primeiro os cards mais críticos", () => {
    const first = task("a-1", {
      taskId: "a",
      sequence: 0,
      subtaskCount: 2,
      priority: "urgente",
      dueDate: "2026-08-18",
    });
    const second = task("a-2", {
      taskId: "a",
      sequence: 1,
      subtaskCount: 2,
      priority: "urgente",
      dueDate: "2026-08-18",
    });
    const low = task("b-1", { priority: "baixa" });
    const result = autoScheduleWeek({
      tasks: [low, second, first],
      candidateTaskIds: [low.id, second.id, first.id],
      schedules: {},
      days: week,
      shifts: [{ start: "08:00", end: "12:00" }],
      now: new Date(2026, 7, 16, 10),
    });

    expect(result.schedule[first.id]).toMatchObject({
      date: week[0],
      startMinutes: 8 * 60,
    });
    expect(result.schedule[second.id]).toMatchObject({
      date: week[0],
      startMinutes: 9 * 60,
    });
    expect(result.schedule[low.id]?.startMinutes).toBe(10 * 60);
  });

  it("respeita intervalos, conflitos fixos e não agenda no passado", () => {
    const fixed = task("fixed");
    const candidate = task("candidate", { duracao: "2" });
    const result = autoScheduleWeek({
      tasks: [fixed, candidate],
      candidateTaskIds: [candidate.id],
      schedules: {
        [fixed.id]: {
          date: week[0]!,
          startMinutes: 14 * 60,
          durationSlots: 2,
          version: 1,
        },
      },
      days: week,
      shifts: [
        { start: "08:00", end: "12:00" },
        { start: "14:00", end: "18:00" },
      ],
      now: new Date(2026, 7, 17, 10, 10),
    });

    expect(result.schedule[candidate.id]).toMatchObject({
      date: week[0],
      startMinutes: 15 * 60,
      durationSlots: 4,
    });
  });
});
