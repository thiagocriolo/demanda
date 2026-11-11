import { afterEach, describe, expect, it, vi } from "vitest";
import type { Project } from "../../projects/types";
import type { Task } from "../../tasks/types";
import { projectEntityAdapter } from "./project";
import { taskEntityAdapter } from "./task";

const project: Project = {
  id: "project-1",
  workspaceId: "workspace-1",
  sourceServiceId: "service-1",
  isInstitutional: false,
  name: "Projeto do serviço",
  business: { id: "business-1", name: "Cliente", archivedAt: null },
  services: [],
  status: "planejamento",
  startDate: "2026-08-18",
  endDate: null,
  briefing: "",
  tags: [],
  responsibles: [],
  contractType: "one_off",
  amountCents: 0,
  firstDueDate: null,
  paymentMethod: "",
  paymentTerms: "",
  financeNotes: "",
  installments: [],
  archivedAt: null,
  createdAt: "2026-08-18T00:00:00.000Z",
  updatedAt: "2026-08-18T00:00:00.000Z",
};

const task: Task = {
  id: "task-1",
  workspaceId: "workspace-1",
  project: {
    id: "project-1",
    name: "Projeto",
    status: "execucao",
    archivedAt: null,
  },
  business: { id: "business-1", name: "Cliente", archivedAt: null },
  name: "Tarefa",
  category: "criacao",
  priority: "alta",
  status: "producao",
  briefing: "",
  dueDate: null,
  durationMinutes: 60,
  sortOrder: 0,
  boardOrder: {},
  tags: [],
  responsibles: [],
  subtasks: [],
  version: 7,
  completedAt: null,
  archivedAt: null,
  createdAt: "2026-08-18T00:00:00.000Z",
  updatedAt: "2026-08-18T00:00:00.000Z",
};

function jsonResponse(value: unknown): Response {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("entity persistence adapter contracts", () => {
  it("keeps project creation from a service on its dedicated endpoint", async () => {
    const fetcher = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        jsonResponse(project),
    );
    vi.stubGlobal("fetch", fetcher);

    const record = await projectEntityAdapter.save({
      mode: "create",
      values: {
        sourceServiceId: "service-1",
        nome: "Projeto do serviço",
        negocioId: "business-1",
        dataInicio: "2026-08-18",
      },
    });

    expect(record.id).toBe("project-1");
    expect(fetcher).toHaveBeenCalledTimes(1);
    const [url, request] = fetcher.mock.calls[0] ?? [];
    expect(url).toBe("/api/projects/from-service");
    expect(request?.method).toBe("POST");
    expect(JSON.parse(String(request?.body))).toMatchObject({
      serviceId: "service-1",
      name: "Projeto do serviço",
      businessId: "business-1",
      startDate: "2026-08-18",
    });
  });

  it("archives an open task with the version already present in its record", async () => {
    const fetcher = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        jsonResponse(task),
    );
    vi.stubGlobal("fetch", fetcher);

    await taskEntityAdapter.archive("task-1", {
      id: "task-1",
      createdAt: task.createdAt,
      updatedAt: task.updatedAt,
      version: "7",
    });

    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0]?.[0]).toBe("/api/tasks/task-1?version=7");
    expect(fetcher.mock.calls[0]?.[1]?.method).toBe("PATCH");
  });

  it("loads a card task before archiving so the action remains versioned", async () => {
    const fetcher = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        jsonResponse(task),
    );
    vi.stubGlobal("fetch", fetcher);

    await taskEntityAdapter.archive("task-1");

    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(fetcher.mock.calls[0]?.[0]).toBe("/api/tasks/task-1");
    expect(fetcher.mock.calls[1]?.[0]).toBe("/api/tasks/task-1?version=7");
    expect(fetcher.mock.calls[1]?.[1]?.method).toBe("PATCH");
  });

  it("deletes a task permanently with its current version", async () => {
    const fetcher = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        jsonResponse({ deleted: true }),
    );
    vi.stubGlobal("fetch", fetcher);

    await taskEntityAdapter.delete("task-1", {
      id: "task-1",
      createdAt: task.createdAt,
      updatedAt: task.updatedAt,
      version: "7",
    });

    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0]?.[0]).toBe("/api/tasks/task-1?version=7");
    expect(fetcher.mock.calls[0]?.[1]?.method).toBe("DELETE");
  });
});
