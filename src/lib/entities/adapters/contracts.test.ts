import { afterEach, describe, expect, it, vi } from "vitest";
import type { Project } from "../../projects/types";
import type { Delivery } from "../../deliveries/types";
import { projectEntityAdapter } from "./project";
import { deliveryEntityAdapter } from "./delivery";

const project: Project = {
  id: "project-1",
  workspaceId: "workspace-1",
  sourceServiceId: "service-1",
  isInstitutional: false,
  isActive: true,
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

const delivery: Delivery = {
  id: "delivery-1",
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
  tasks: [],
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

  it("archives an open delivery with the version already present in its record", async () => {
    const fetcher = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        jsonResponse(delivery),
    );
    vi.stubGlobal("fetch", fetcher);

    await deliveryEntityAdapter.archive("delivery-1", {
      id: "delivery-1",
      createdAt: delivery.createdAt,
      updatedAt: delivery.updatedAt,
      version: "7",
    });

    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0]?.[0]).toBe("/api/deliveries/delivery-1?version=7");
    expect(fetcher.mock.calls[0]?.[1]?.method).toBe("PATCH");
  });

  it("loads a card delivery before archiving so the action remains versioned", async () => {
    const fetcher = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        jsonResponse(delivery),
    );
    vi.stubGlobal("fetch", fetcher);

    await deliveryEntityAdapter.archive("delivery-1");

    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(fetcher.mock.calls[0]?.[0]).toBe("/api/deliveries/delivery-1");
    expect(fetcher.mock.calls[1]?.[0]).toBe("/api/deliveries/delivery-1?version=7");
    expect(fetcher.mock.calls[1]?.[1]?.method).toBe("PATCH");
  });

  it("deletes a delivery permanently with its current version", async () => {
    const fetcher = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        jsonResponse({ deleted: true }),
    );
    vi.stubGlobal("fetch", fetcher);

    await deliveryEntityAdapter.delete("delivery-1", {
      id: "delivery-1",
      createdAt: delivery.createdAt,
      updatedAt: delivery.updatedAt,
      version: "7",
    });

    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0]?.[0]).toBe("/api/deliveries/delivery-1?version=7");
    expect(fetcher.mock.calls[0]?.[1]?.method).toBe("DELETE");
  });
});
