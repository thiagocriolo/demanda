import { describe, expect, it } from "vitest";
import type { EntityRecord } from "../entities/types";
import {
  isCronogramaTaskMuted,
  nextUnscheduledSubtasks,
  nextUnscheduledSubtasksForWorkspace,
  toScheduleSubtasks,
} from "./subtasks";

const record: EntityRecord = {
  id: "87fe7dab-ed71-4fb8-be1d-9f83c7dc0d38",
  createdAt: "2026-07-14T12:00:00.000Z",
  updatedAt: "2026-07-14T12:00:00.000Z",
  nome: "Tarefa",
  negocio: "Negócio da tarefa",
  subtarefas: JSON.stringify([
    {
      id: "d169e93f-e3c5-4ffc-9df0-7c0354b533c7",
      nome: "Primeira",
      duracao: "1",
      status: "pendente",
    },
    {
      id: "57690a4a-24fd-4239-9014-e6c86d9ec07d",
      nome: "Segunda",
      duracao: "1",
      status: "pendente",
    },
  ]),
};

describe("BE-11: projeção de subtarefas no Cronograma", () => {
  it("usa o UUID real da subtarefa como chave do bloco", () => {
    const subtasks = toScheduleSubtasks([record]);
    expect(subtasks.map(({ id }) => id)).toEqual([
      "d169e93f-e3c5-4ffc-9df0-7c0354b533c7",
      "57690a4a-24fd-4239-9014-e6c86d9ec07d",
    ]);
    expect(subtasks.map(({ negocio }) => negocio)).toEqual([
      "Negócio da tarefa",
      "Negócio da tarefa",
    ]);
    expect(
      nextUnscheduledSubtasks(subtasks, {
        "d169e93f-e3c5-4ffc-9df0-7c0354b533c7": {
          date: "2026-07-15",
          startMinutes: 480,
          durationSlots: 2,
          version: 1,
        },
      }).map(({ id }) => id),
    ).toEqual(["57690a4a-24fd-4239-9014-e6c86d9ec07d"]);
  });
});

describe("filtro visual do Cronograma por workspace", () => {
  const tasks = [
    {
      id: "subtask-a",
      subtaskId: "subtask-a",
      taskId: "task-a",
      taskNome: "Tarefa A",
      nome: "Subtarefa A",
      sequence: 0,
      subtaskCount: 1,
      duracao: "1",
      createdAt: "2026-07-14T00:00:00.000Z",
      updatedAt: "2026-07-14T00:00:00.000Z",
      workspaceId: "workspace-a",
    },
    {
      id: "subtask-b",
      subtaskId: "subtask-b",
      taskId: "task-b",
      taskNome: "Tarefa B",
      nome: "Subtarefa B",
      sequence: 0,
      subtaskCount: 1,
      duracao: "1",
      createdAt: "2026-07-14T00:00:00.000Z",
      updatedAt: "2026-07-14T00:00:00.000Z",
      workspaceId: "workspace-b",
    },
  ];

  it("mantém na gaveta somente cards do workspace selecionado", () => {
    expect(
      nextUnscheduledSubtasksForWorkspace(tasks, {}, "workspace-a").map(
        ({ id }) => id,
      ),
    ).toEqual(["subtask-a"]);
  });

  it("considera todos os cards normais quando o escopo é global", () => {
    expect(
      nextUnscheduledSubtasksForWorkspace(tasks, {}, "global").map(
        ({ id }) => id,
      ),
    ).toEqual(["subtask-a", "subtask-b"]);
    expect(tasks.map((task) => isCronogramaTaskMuted(task, "global"))).toEqual([
      false,
      false,
    ]);
  });

  it("apaga somente o card acoplado de outro workspace", () => {
    expect(isCronogramaTaskMuted(tasks[0]!, "workspace-a")).toBe(false);
    expect(isCronogramaTaskMuted(tasks[1]!, "workspace-a")).toBe(true);
  });
});
