import { afterEach, describe, expect, it, vi } from "vitest";
import { setWorkspaceRequestScope } from "../workspaces/workspace-scope";
import {
  archiveTask,
  createTask,
  entityValuesToTaskCreateInput,
  entityValuesToTaskUpdateInput,
  listAllTasks,
  listTasks,
  setTaskState,
  setTaskSubtaskState,
  TaskApiError,
  taskToEntityRecord,
  taskVersionFromRecord,
  updateTask,
  updateTaskBoard,
  updateTaskFromEntityValues,
  withTaskBoardOrder,
  type FetchLike,
} from "./client";
import type { Task, TaskList } from "./types";

const workspaceId = "2e50fbac-2d0b-431e-a4bf-4c249bd90be5";
const projectId = "8d7a8408-5138-40e6-82b9-cf78595e0803";
const businessId = "c9ad3fab-41c2-4d61-b5fb-946778633b5d";
const taskId = "45550f56-f21d-446c-9751-fe8f542f4aee";
const subtaskId = "b767eb94-9eb8-4397-9674-5dc514f538aa";
const responsibleId = "815126fb-f8cc-4f55-837f-43207c520660";

const task: Task = {
  id: taskId,
  workspaceId,
  project: {
    id: projectId,
    name: "Identidade visual",
    status: "execucao",
    archivedAt: null,
  },
  business: { id: businessId, name: "Marca Aurora", archivedAt: null },
  name: "Apresentar rotas criativas",
  category: "criacao",
  priority: "alta",
  status: "producao",
  briefing: "Preparar a apresentação.",
  dueDate: "2026-07-20",
  durationMinutes: 150,
  sortOrder: 3,
  boardOrder: { status: 2, project: 1 },
  tags: [
    {
      id: "d5f7e449-a85a-4ab0-8e2f-10cc5fbfc02f",
      name: "criativo",
      archivedAt: null,
    },
  ],
  responsibles: [
    {
      userId: responsibleId,
      name: "Marina Costa",
      email: "marina@example.com",
      avatarUrl: null,
      role: "admin",
    },
  ],
  subtasks: [
    {
      id: subtaskId,
      name: "Montar slides",
      durationMinutes: 90,
      status: "concluida",
      sortOrder: 0,
      completedAt: "2026-07-14T10:00:00.000Z",
      createdAt: "2026-07-14T08:00:00.000Z",
      updatedAt: "2026-07-14T10:00:00.000Z",
    },
    {
      id: "49339d1e-70cc-42fb-b21e-a07fbb006d82",
      name: "Revisar narrativa",
      durationMinutes: 60,
      status: "pendente",
      sortOrder: 1,
      completedAt: null,
      createdAt: "2026-07-14T08:00:00.000Z",
      updatedAt: "2026-07-14T08:00:00.000Z",
    },
  ],
  version: 7,
  completedAt: null,
  archivedAt: null,
  createdAt: "2026-07-14T08:00:00.000Z",
  updatedAt: "2026-07-14T10:00:00.000Z",
};

function taskList(items: Task[], page = 1, totalPages = 1): TaskList {
  return {
    workspaceId,
    items,
    page,
    pageSize: 100,
    total: items.length * totalPages,
    totalPages,
    facets: {
      all: items.length,
      archived: 0,
      statuses: { producao: items.length },
      priorities: { alta: items.length },
      categories: { criacao: items.length },
      projects: { [projectId]: items.length },
    },
  };
}

describe("tasks client", () => {
  afterEach(() => setWorkspaceRequestScope("", []));

  it("agrega somente os workspaces concretos do escopo global", async () => {
    const secondWorkspaceId = crypto.randomUUID();
    setWorkspaceRequestScope("global", [workspaceId, secondWorkspaceId]);
    const fetcher = vi.fn<FetchLike>(async (input) => {
      const requestedWorkspaceId = new URL(
        String(input),
        "https://demanda.local",
      ).searchParams.get("workspaceId")!;
      const item = {
        ...task,
        id: crypto.randomUUID(),
        workspaceId: requestedWorkspaceId,
      };
      const result = {
        ...taskList([item]),
        workspaceId: requestedWorkspaceId,
      };
      return new Response(JSON.stringify(result));
    });

    const result = await listTasks({ page: 1, pageSize: 10 }, fetcher);

    expect(result.workspaceId).toBe("global");
    expect(result.total).toBe(2);
    expect(new Set(result.items.map(({ workspaceId }) => workspaceId))).toEqual(
      new Set([workspaceId, secondWorkspaceId]),
    );
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("serializa filtros de listagem", async () => {
    const fetcher = vi.fn<FetchLike>().mockResolvedValue(
      new Response(JSON.stringify(taskList([task])), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );

    await listTasks(
      {
        workspaceId,
        status: "producao",
        projectId,
        responsibleUserId: responsibleId,
        archived: "include",
        orderBy: "due_asc",
      },
      fetcher,
    );

    const url = String(fetcher.mock.calls[0]?.[0]);
    expect(url).toContain(`workspaceId=${workspaceId}`);
    expect(url).toContain("status=producao");
    expect(url).toContain(`projectId=${projectId}`);
    expect(url).toContain(`responsibleUserId=${responsibleId}`);
    expect(url).toContain("archived=include");
    expect(url).toContain("orderBy=due_asc");
  });

  it("carrega todas as páginas sem duplicar tarefas", async () => {
    const second = { ...task, id: "f8740172-a53d-48d3-87db-dce1b203cb3a" };
    const fetcher = vi
      .fn<FetchLike>()
      .mockResolvedValueOnce(
        new Response(JSON.stringify(taskList([task], 1, 2))),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify(taskList([task, second], 2, 2))),
      );

    expect(await listAllTasks({}, fetcher)).toEqual([task, second]);
  });

  it("rejeita mudança de workspace entre páginas", async () => {
    const foreign = { ...task, workspaceId: crypto.randomUUID() };
    const fetcher = vi
      .fn<FetchLike>()
      .mockResolvedValueOnce(
        new Response(JSON.stringify(taskList([task], 1, 2))),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify(taskList([foreign], 2, 2))),
      );

    await expect(listAllTasks({}, fetcher)).rejects.toEqual(
      new TaskApiError(
        409,
        "O workspace mudou durante o carregamento das tarefas. Tente novamente.",
      ),
    );
  });

  it("preserva relações, subtarefas, ordem e versão no adaptador", () => {
    const record = taskToEntityRecord(task);
    const input = entityValuesToTaskUpdateInput(record, record);

    expect(taskVersionFromRecord(record)).toBe(7);
    expect(record.subtarefas).toContain(subtaskId);
    expect(record).toMatchObject({
      businessArchivedAt: "",
      projectArchivedAt: "",
      projectStatus: "execucao",
    });
    expect(input).toMatchObject({
      version: 7,
      name: task.name,
      projectId,
      category: "criacao",
      priority: "alta",
      dueDate: "2026-07-20",
      sortOrder: 3,
      tagLabels: ["criativo"],
      responsibleUserIds: [responsibleId],
    });
    expect(input.subtasks).toEqual([
      {
        id: subtaskId,
        name: "Montar slides",
        durationMinutes: 90,
        status: "concluida",
      },
      {
        id: "49339d1e-70cc-42fb-b21e-a07fbb006d82",
        name: "Revisar narrativa",
        durationMinutes: 60,
        status: "pendente",
      },
    ]);
    expect(input).not.toHaveProperty("boardOrder");
    expect(
      entityValuesToTaskCreateInput(record, record, { copy: true }).boardOrder,
    ).toEqual({});
  });

  it("strips temporary subtask IDs when creating a task", () => {
    const input = entityValuesToTaskCreateInput({
      nome: "Tarefa nova",
      projetoId: projectId,
      subtarefas: JSON.stringify([
        {
          id: crypto.randomUUID(),
          nome: "Subtarefa nova",
          duracao: "1.5",
          status: "pendente",
        },
      ]),
    });

    expect(input.subtasks).toEqual([
      {
        name: "Subtarefa nova",
        durationMinutes: 90,
        status: "pendente",
      },
    ]);
  });

  it("keeps stored subtask IDs and strips new UI-only IDs on update", () => {
    const current = taskToEntityRecord(task);
    const temporaryId = crypto.randomUUID();
    const editedSubtasks = [
      ...JSON.parse(current.subtarefas),
      {
        id: temporaryId,
        nome: "Nova subtarefa",
        duracao: "2",
        status: "pendente",
      },
    ];

    const input = entityValuesToTaskUpdateInput(
      { subtarefas: JSON.stringify(editedSubtasks) },
      current,
    );

    expect(input.subtasks.map(({ id }) => id)).toEqual([
      subtaskId,
      "49339d1e-70cc-42fb-b21e-a07fbb006d82",
      undefined,
    ]);
  });

  it("round-trips half-hour and multi-day subtask durations without truncation", () => {
    const current = taskToEntityRecord({
      ...task,
      subtasks: [
        { ...task.subtasks[0]!, durationMinutes: 30 },
        { ...task.subtasks[1]!, durationMinutes: 10_080 },
      ],
      durationMinutes: 10_110,
    });

    expect(
      entityValuesToTaskUpdateInput({}, current).subtasks.map(
        ({ durationMinutes }) => durationMinutes,
      ),
    ).toEqual([30, 10_080]);
  });

  it("cria uma subtarefa principal quando o formulário não envia nenhuma", () => {
    expect(
      entityValuesToTaskCreateInput({
        nome: "Tarefa nova",
        projetoId: projectId,
        negocioId: businessId,
      }).subtasks,
    ).toEqual([
      {
        name: "Tarefa nova",
        durationMinutes: 60,
        status: "pendente",
      },
    ]);
  });

  it("atualiza uma ordem da pauta sem apagar as demais visões", () => {
    const record = taskToEntityRecord(task);
    const updated = withTaskBoardOrder(record, "priority", 4);
    expect(JSON.parse(updated.pautaOrderByView)).toEqual({
      status: 2,
      project: 1,
      priority: 4,
    });
  });

  it("envia mutações versionadas para os endpoints canônicos", async () => {
    const fetcher = vi.fn<FetchLike>().mockImplementation(
      async () =>
        new Response(JSON.stringify(task), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    );
    const record = taskToEntityRecord(task);
    const createInput = entityValuesToTaskCreateInput(record, record);
    const updateInput = entityValuesToTaskUpdateInput(record, record);

    await createTask(createInput, fetcher);
    await updateTask(taskId, updateInput, fetcher);
    await setTaskState(taskId, { version: 7, status: "conclusao" }, fetcher);
    await setTaskSubtaskState(
      taskId,
      subtaskId,
      { version: 7, status: "pendente" },
      fetcher,
    );
    await archiveTask(taskId, 7, fetcher);
    await updateTaskBoard(
      {
        view: "status",
        updates: [
          {
            id: taskId,
            version: 7,
            position: 0,
            columnKey: "producao",
          },
        ],
      },
      fetcher,
    );

    expect(fetcher.mock.calls.map(([url]) => String(url))).toEqual([
      "/api/tasks",
      `/api/tasks/${taskId}`,
      `/api/tasks/${taskId}/state`,
      `/api/tasks/${taskId}/subtasks/${subtaskId}/state`,
      `/api/tasks/${taskId}?version=7`,
      "/api/tasks/board",
    ]);
  });

  it("propaga a mensagem de conflito da API", async () => {
    const fetcher = vi.fn<FetchLike>().mockResolvedValue(
      new Response(JSON.stringify({ message: "A tarefa foi alterada." }), {
        status: 409,
        headers: { "content-type": "application/json" },
      }),
    );

    await expect(
      setTaskState(taskId, { version: 3, status: "fila" }, fetcher),
    ).rejects.toEqual(new TaskApiError(409, "A tarefa foi alterada."));
  });

  it("updates content and state atomically in one request", async () => {
    const current = taskToEntityRecord(task);
    const stateUpdated = { ...task, status: "fila", version: 8 };
    const fetcher = vi
      .fn<FetchLike>()
      .mockResolvedValueOnce(Response.json(stateUpdated));

    await expect(
      updateTaskFromEntityValues(taskId, { status: "fila" }, current, fetcher),
    ).resolves.toEqual(stateUpdated);

    expect(fetcher.mock.calls.map(([url]) => String(url))).toEqual([
      `/api/tasks/${taskId}`,
    ]);
    expect(JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body))).toMatchObject({
      version: 7,
      status: "fila",
    });
  });

  it("reopens a completed task and subtask atomically", async () => {
    const completedTask: Task = {
      ...task,
      status: "conclusao",
      version: 10,
      completedAt: "2026-07-14T12:00:00.000Z",
      subtasks: task.subtasks.map((subtask) => ({
        ...subtask,
        status: "concluida",
        completedAt: "2026-07-14T11:00:00.000Z",
      })),
    };
    const current = taskToEntityRecord(completedTask);
    const editedSubtasks = JSON.parse(current.subtarefas) as Array<
      Record<string, unknown>
    >;
    editedSubtasks[0] = { ...editedSubtasks[0], status: "pendente" };
    const updated = {
      ...completedTask,
      status: "fila",
      version: 11,
      completedAt: null,
      subtasks: completedTask.subtasks.map((subtask, index) =>
        index === 0
          ? { ...subtask, status: "pendente", completedAt: null }
          : subtask,
      ),
    };
    const fetcher = vi
      .fn<FetchLike>()
      .mockResolvedValueOnce(Response.json(updated));

    await expect(
      updateTaskFromEntityValues(
        taskId,
        { status: "fila", subtarefas: JSON.stringify(editedSubtasks) },
        current,
        fetcher,
      ),
    ).resolves.toEqual(updated);

    expect(fetcher.mock.calls.map(([url]) => String(url))).toEqual([
      `/api/tasks/${taskId}`,
    ]);
    expect(JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body))).toEqual({
      ...entityValuesToTaskUpdateInput(
        { status: "fila", subtarefas: JSON.stringify(editedSubtasks) },
        current,
      ),
    });
    const updateBody = JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body)) as {
      version: number;
      subtasks: Array<{ id?: string; status: string }>;
    };
    expect(updateBody.version).toBe(10);
    expect(updateBody.subtasks[0]).toMatchObject({
      id: subtaskId,
      status: "pendente",
    });
  });
});
