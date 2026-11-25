import { afterEach, describe, expect, it, vi } from "vitest";
import { setWorkspaceRequestScope } from "../workspaces/workspace-scope";
import {
  archiveDelivery,
  createDelivery,
  entityValuesToDeliveryCreateInput,
  entityValuesToDeliveryUpdateInput,
  listAllDeliveries,
  listDeliveries,
  setDeliveryState,
  setDeliveryTaskState,
  DeliveryApiError,
  deliveryToEntityRecord,
  deliveryVersionFromRecord,
  updateDelivery,
  updateDeliveryBoard,
  updateDeliveryFromEntityValues,
  withDeliveryBoardOrder,
  type FetchLike,
} from "./client";
import type { Delivery, DeliveryList } from "./types";

const workspaceId = "2e50fbac-2d0b-431e-a4bf-4c249bd90be5";
const projectId = "8d7a8408-5138-40e6-82b9-cf78595e0803";
const businessId = "c9ad3fab-41c2-4d61-b5fb-946778633b5d";
const deliveryId = "45550f56-f21d-446c-9751-fe8f542f4aee";
const taskId = "b767eb94-9eb8-4397-9674-5dc514f538aa";
const responsibleId = "815126fb-f8cc-4f55-837f-43207c520660";

const delivery: Delivery = {
  id: deliveryId,
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
  tasks: [
    {
      id: taskId,
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

function deliveryList(items: Delivery[], page = 1, totalPages = 1): DeliveryList {
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

describe("deliveries client", () => {
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
        ...delivery,
        id: crypto.randomUUID(),
        workspaceId: requestedWorkspaceId,
      };
      const result = {
        ...deliveryList([item]),
        workspaceId: requestedWorkspaceId,
      };
      return new Response(JSON.stringify(result));
    });

    const result = await listDeliveries({ page: 1, pageSize: 10 }, fetcher);

    expect(result.workspaceId).toBe("global");
    expect(result.total).toBe(2);
    expect(new Set(result.items.map(({ workspaceId }) => workspaceId))).toEqual(
      new Set([workspaceId, secondWorkspaceId]),
    );
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("serializa filtros de listagem", async () => {
    const fetcher = vi.fn<FetchLike>().mockResolvedValue(
      new Response(JSON.stringify(deliveryList([delivery])), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );

    await listDeliveries(
      {
        workspaceId,
        status: "producao",
        projectId,
        responsibleUserId: responsibleId,
        archived: "include",
        includeInactiveProjects: true,
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
    expect(url).toContain("includeInactiveProjects=true");
    expect(url).toContain("orderBy=due_asc");
  });

  it("carrega todas as páginas sem duplicar tarefas", async () => {
    const second = { ...delivery, id: "f8740172-a53d-48d3-87db-dce1b203cb3a" };
    const fetcher = vi
      .fn<FetchLike>()
      .mockResolvedValueOnce(
        new Response(JSON.stringify(deliveryList([delivery], 1, 2))),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify(deliveryList([delivery, second], 2, 2))),
      );

    expect(await listAllDeliveries({}, fetcher)).toEqual([delivery, second]);
  });

  it("rejeita mudança de workspace entre páginas", async () => {
    const foreign = { ...delivery, workspaceId: crypto.randomUUID() };
    const fetcher = vi
      .fn<FetchLike>()
      .mockResolvedValueOnce(
        new Response(JSON.stringify(deliveryList([delivery], 1, 2))),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify(deliveryList([foreign], 2, 2))),
      );

    await expect(listAllDeliveries({}, fetcher)).rejects.toEqual(
      new DeliveryApiError(
        409,
        "O workspace mudou durante o carregamento das tarefas. Tente novamente.",
      ),
    );
  });

  it("preserva relações, tarefas, ordem e versão no adaptador", () => {
    const record = deliveryToEntityRecord(delivery);
    const input = entityValuesToDeliveryUpdateInput(record, record);

    expect(deliveryVersionFromRecord(record)).toBe(7);
    expect(record.tarefas).toContain(taskId);
    expect(record).toMatchObject({
      businessArchivedAt: "",
      projectArchivedAt: "",
      projectStatus: "execucao",
    });
    expect(input).toMatchObject({
      version: 7,
      name: delivery.name,
      projectId,
      category: "criacao",
      priority: "alta",
      dueDate: "2026-07-20",
      sortOrder: 3,
      tagLabels: ["criativo"],
      responsibleUserIds: [responsibleId],
    });
    expect(input.tasks).toEqual([
      {
        id: taskId,
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
      entityValuesToDeliveryCreateInput(record, record, { copy: true }).boardOrder,
    ).toEqual({});
  });

  it("strips temporary task IDs when creating a delivery", () => {
    const input = entityValuesToDeliveryCreateInput({
      nome: "Tarefa nova",
      projetoId: projectId,
      tarefas: JSON.stringify([
        {
          id: crypto.randomUUID(),
          nome: "Tarefa nova",
          duracao: "1.5",
          status: "pendente",
        },
      ]),
    });

    expect(input.tasks).toEqual([
      {
        name: "Tarefa nova",
        durationMinutes: 90,
        status: "pendente",
      },
    ]);
  });

  it("preserva recorrência válida e omite valores pontuais no adaptador", () => {
    const recurringRecord = deliveryToEntityRecord({
      ...delivery,
      project: { ...delivery.project, contractType: "recurring" },
      dueDate: null,
      recurrence: "weekly",
    });
    expect(recurringRecord.projectContractType).toBe("recurring");
    expect(recurringRecord.recurrence).toBe("weekly");
    expect(
      entityValuesToDeliveryCreateInput(recurringRecord, recurringRecord),
    ).toMatchObject({
      dueDate: null,
      recurrence: "weekly",
    });

    const oneOffInput = entityValuesToDeliveryCreateInput({
      nome: "Entrega pontual",
      projetoId: projectId,
      recurrence: "one_off",
      dataEntrega: "2026-12-10",
    });
    expect(oneOffInput).not.toHaveProperty("recurrence");
    expect(oneOffInput.dueDate).toBe("2026-12-10");
  });

  it("omits the project ID for an institutional delivery", () => {
    const institutionalContractId = crypto.randomUUID();

    expect(
      entityValuesToDeliveryCreateInput({
        nome: "Entrega institucional",
        projetoId: "",
        institutionalContractId,
        responsavelId: crypto.randomUUID(),
      }),
    ).toMatchObject({
      projectId: undefined,
      institutionalContractId,
    });
  });

  it("keeps stored task IDs and strips new UI-only IDs on update", () => {
    const current = deliveryToEntityRecord(delivery);
    const temporaryId = crypto.randomUUID();
    const editedTasks = [
      ...JSON.parse(current.tarefas),
      {
        id: temporaryId,
        nome: "Nova tarefa",
        duracao: "2",
        status: "pendente",
      },
    ];

    const input = entityValuesToDeliveryUpdateInput(
      { tarefas: JSON.stringify(editedTasks) },
      current,
    );

    expect(input.tasks.map(({ id }) => id)).toEqual([
      taskId,
      "49339d1e-70cc-42fb-b21e-a07fbb006d82",
      undefined,
    ]);
  });

  it("round-trips half-hour and multi-day task durations without truncation", () => {
    const current = deliveryToEntityRecord({
      ...delivery,
      tasks: [
        { ...delivery.tasks[0]!, durationMinutes: 30 },
        { ...delivery.tasks[1]!, durationMinutes: 10_080 },
      ],
      durationMinutes: 10_110,
    });

    expect(
      entityValuesToDeliveryUpdateInput({}, current).tasks.map(
        ({ durationMinutes }) => durationMinutes,
      ),
    ).toEqual([30, 10_080]);
  });

  it("cria uma tarefa principal quando o formulário não envia nenhuma", () => {
    expect(
      entityValuesToDeliveryCreateInput({
        nome: "Tarefa nova",
        projetoId: projectId,
        negocioId: businessId,
      }).tasks,
    ).toEqual([
      {
        name: "Tarefa nova",
        durationMinutes: 60,
        status: "pendente",
      },
    ]);
  });

  it("atualiza uma ordem da pauta sem apagar as demais visões", () => {
    const record = deliveryToEntityRecord(delivery);
    const updated = withDeliveryBoardOrder(record, "priority", 4);
    expect(JSON.parse(updated.pautaOrderByView)).toEqual({
      status: 2,
      project: 1,
      priority: 4,
    });
  });

  it("envia mutações versionadas para os endpoints canônicos", async () => {
    const fetcher = vi.fn<FetchLike>().mockImplementation(
      async () =>
        new Response(JSON.stringify(delivery), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    );
    const record = deliveryToEntityRecord(delivery);
    const createInput = entityValuesToDeliveryCreateInput(record, record);
    const updateInput = entityValuesToDeliveryUpdateInput(record, record);

    await createDelivery(createInput, fetcher);
    await updateDelivery(deliveryId, updateInput, fetcher);
    await setDeliveryState(deliveryId, { version: 7, status: "conclusao" }, fetcher);
    await setDeliveryTaskState(
      deliveryId,
      taskId,
      { version: 7, status: "pendente" },
      fetcher,
    );
    await archiveDelivery(deliveryId, 7, fetcher);
    await updateDeliveryBoard(
      {
        view: "status",
        updates: [
          {
            id: deliveryId,
            version: 7,
            position: 0,
            columnKey: "producao",
          },
        ],
      },
      fetcher,
    );

    expect(fetcher.mock.calls.map(([url]) => String(url))).toEqual([
      "/api/deliveries",
      `/api/deliveries/${deliveryId}`,
      `/api/deliveries/${deliveryId}/state`,
      `/api/deliveries/${deliveryId}/tasks/${taskId}/state`,
      `/api/deliveries/${deliveryId}?version=7`,
      "/api/deliveries/board",
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
      setDeliveryState(deliveryId, { version: 3, status: "fila" }, fetcher),
    ).rejects.toEqual(new DeliveryApiError(409, "A tarefa foi alterada."));
  });

  it("updates content and state atomically in one request", async () => {
    const current = deliveryToEntityRecord(delivery);
    const stateUpdated = { ...delivery, status: "fila", version: 8 };
    const fetcher = vi
      .fn<FetchLike>()
      .mockResolvedValueOnce(Response.json(stateUpdated));

    await expect(
      updateDeliveryFromEntityValues(deliveryId, { status: "fila" }, current, fetcher),
    ).resolves.toEqual(stateUpdated);

    expect(fetcher.mock.calls.map(([url]) => String(url))).toEqual([
      `/api/deliveries/${deliveryId}`,
    ]);
    expect(JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body))).toMatchObject({
      version: 7,
      status: "fila",
    });
  });

  it("reopens a completed delivery and task atomically", async () => {
    const completedDelivery: Delivery = {
      ...delivery,
      status: "conclusao",
      version: 10,
      completedAt: "2026-07-14T12:00:00.000Z",
      tasks: delivery.tasks.map((task) => ({
        ...task,
        status: "concluida",
        completedAt: "2026-07-14T11:00:00.000Z",
      })),
    };
    const current = deliveryToEntityRecord(completedDelivery);
    const editedTasks = JSON.parse(current.tarefas) as Array<
      Record<string, unknown>
    >;
    editedTasks[0] = { ...editedTasks[0], status: "pendente" };
    const updated = {
      ...completedDelivery,
      status: "fila",
      version: 11,
      completedAt: null,
      tasks: completedDelivery.tasks.map((task, index) =>
        index === 0
          ? { ...task, status: "pendente", completedAt: null }
          : task,
      ),
    };
    const fetcher = vi
      .fn<FetchLike>()
      .mockResolvedValueOnce(Response.json(updated));

    await expect(
      updateDeliveryFromEntityValues(
        deliveryId,
        { status: "fila", tarefas: JSON.stringify(editedTasks) },
        current,
        fetcher,
      ),
    ).resolves.toEqual(updated);

    expect(fetcher.mock.calls.map(([url]) => String(url))).toEqual([
      `/api/deliveries/${deliveryId}`,
    ]);
    expect(JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body))).toEqual({
      ...entityValuesToDeliveryUpdateInput(
        { status: "fila", tarefas: JSON.stringify(editedTasks) },
        current,
      ),
    });
    const updateBody = JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body)) as {
      version: number;
      tasks: Array<{ id?: string; status: string }>;
    };
    expect(updateBody.version).toBe(10);
    expect(updateBody.tasks[0]).toMatchObject({
      id: taskId,
      status: "pendente",
    });
  });
});
