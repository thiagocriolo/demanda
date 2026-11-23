import { describe, expect, it } from "vitest";
import type { EntityRecord } from "../entities/types";
import {
  isCronogramaTaskMuted,
  nextUnscheduledTasks,
  nextUnscheduledTasksForWorkspace,
  toScheduleTasks,
} from "./tasks";

const record: EntityRecord = {
  id: "87fe7dab-ed71-4fb8-be1d-9f83c7dc0d38",
  createdAt: "2026-07-14T12:00:00.000Z",
  updatedAt: "2026-07-14T12:00:00.000Z",
  nome: "Tarefa",
  negocio: "Negócio da tarefa",
  tarefas: JSON.stringify([
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

describe("BE-11: projeção de tarefas no Cronograma", () => {
  it("usa o UUID real da tarefa como chave do bloco", () => {
    const tasks = toScheduleTasks([record]);
    expect(tasks.map(({ id }) => id)).toEqual([
      "d169e93f-e3c5-4ffc-9df0-7c0354b533c7",
      "57690a4a-24fd-4239-9014-e6c86d9ec07d",
    ]);
    expect(tasks.map(({ negocio }) => negocio)).toEqual([
      "Negócio da tarefa",
      "Negócio da tarefa",
    ]);
    expect(
      nextUnscheduledTasks(tasks, {
        "d169e93f-e3c5-4ffc-9df0-7c0354b533c7": {
          date: "2026-07-15",
          startMinutes: 480,
          durationSlots: 2,
          version: 1,
        },
      }).map(({ id }) => id),
    ).toEqual(["57690a4a-24fd-4239-9014-e6c86d9ec07d"]);
  });

  it("mantém todas as tarefas executáveis sem horário na gaveta", () => {
    const deliveries = toScheduleTasks([record]);
    expect(nextUnscheduledTasks(deliveries, {}).map(({ id }) => id)).toEqual([
      "d169e93f-e3c5-4ffc-9df0-7c0354b533c7",
      "57690a4a-24fd-4239-9014-e6c86d9ec07d",
    ]);
  });
});

describe("filtro visual do Cronograma por workspace", () => {
  const deliveries = [
    {
      id: "task-a",
      taskId: "task-a",
      deliveryId: "delivery-a",
      deliveryNome: "Tarefa A",
      nome: "Tarefa A",
      sequence: 0,
      taskCount: 1,
      duracao: "1",
      createdAt: "2026-07-14T00:00:00.000Z",
      updatedAt: "2026-07-14T00:00:00.000Z",
      workspaceId: "workspace-a",
    },
    {
      id: "task-b",
      taskId: "task-b",
      deliveryId: "delivery-b",
      deliveryNome: "Tarefa B",
      nome: "Tarefa B",
      sequence: 0,
      taskCount: 1,
      duracao: "1",
      createdAt: "2026-07-14T00:00:00.000Z",
      updatedAt: "2026-07-14T00:00:00.000Z",
      workspaceId: "workspace-b",
    },
  ];

  it("mantém na gaveta somente cards do workspace selecionado", () => {
    expect(
      nextUnscheduledTasksForWorkspace(deliveries, {}, "workspace-a").map(
        ({ id }) => id,
      ),
    ).toEqual(["task-a"]);
  });

  it("considera todos os cards normais quando o escopo é global", () => {
    expect(
      nextUnscheduledTasksForWorkspace(deliveries, {}, "global").map(
        ({ id }) => id,
      ),
    ).toEqual(["task-a", "task-b"]);
    expect(deliveries.map((delivery) => isCronogramaTaskMuted(delivery, "global"))).toEqual([
      false,
      false,
    ]);
  });

  it("apaga somente o card acoplado de outro workspace", () => {
    expect(isCronogramaTaskMuted(deliveries[0]!, "workspace-a")).toBe(false);
    expect(isCronogramaTaskMuted(deliveries[1]!, "workspace-a")).toBe(true);
  });
});
