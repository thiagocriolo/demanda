import { describe, expect, it, vi } from "vitest";
import {
  ProjectApiError,
  createProjectFromService,
  entityValuesToProjectFromServiceInput,
  entityValuesToProjectInput,
  getProjectOptions,
  listAllActiveProjects,
  listProjects,
  projectRelationsFromRecord,
  projectToEntityRecord,
  type FetchLike,
} from "./client";
import type {
  Project,
  ProjectList,
  ProjectOptions,
  ProjectResponsible,
  Service,
} from "./types";

const workspaceId = "2e50fbac-2d0b-431e-a4bf-4c249bd90be5";
const businessId = "c9ad3fab-41c2-4d61-b5fb-946778633b5d";
const sourceServiceId = "b767eb94-9eb8-4397-9674-5dc514f538aa";
const additionalServiceId = "49339d1e-70cc-42fb-b21e-a07fbb006d82";
const member: ProjectResponsible = {
  userId: "815126fb-f8cc-4f55-837f-43207c520660",
  name: "Marina Costa",
  email: "marina@example.com",
  avatarUrl: null,
  role: "admin",
};

const project: Project = {
  id: "8d7a8408-5138-40e6-82b9-cf78595e0803",
  workspaceId,
  sourceServiceId,
  isInstitutional: false,
  name: "Identidade visual",
  business: {
    id: businessId,
    name: "Marca Aurora",
    archivedAt: null,
  },
  services: [
    {
      id: sourceServiceId,
      name: "Branding",
      description: "Estratégia de marca",
      icon: "palette",
      color: "violet",
      archivedAt: null,
    },
    {
      id: additionalServiceId,
      name: "Website",
      description: "Site institucional",
      icon: "globe",
      color: "blue",
      archivedAt: "2026-07-13T00:00:00.000Z",
    },
  ],
  status: "execucao",
  startDate: "2026-07-14",
  endDate: "2026-08-14",
  briefing: "Briefing completo",
  tags: [
    {
      id: "d5f7e449-a85a-4ab0-8e2f-10cc5fbfc02f",
      name: "branding",
      archivedAt: null,
    },
    {
      id: "d46ba4b5-bbde-4f9a-a05b-89ae30da23e1",
      name: "lançamento",
      archivedAt: null,
    },
  ],
  responsibles: [member],
  contractType: "one_off",
  amountCents: 1_250_050,
  firstDueDate: "2026-07-20",
  paymentMethod: "Pix",
  paymentTerms: "Entrada e entrega",
  financeNotes: "Sem juros",
  installments: [
    {
      id: "2c00a0e9-03cf-488e-a980-2ae05e5a6cf0",
      number: 1,
      dueDate: "2026-07-20",
      amountCents: 625_025,
      status: "pending",
    },
    {
      id: "c8072a19-0e9b-450d-8bb0-92d6430205be",
      number: 2,
      dueDate: "2026-08-19",
      amountCents: 625_025,
      status: "paid",
    },
  ],
  archivedAt: null,
  createdAt: "2026-07-14T00:00:00.000Z",
  updatedAt: "2026-07-14T01:00:00.000Z",
};

function projectList(items: Project[], page = 1, totalPages = 1): ProjectList {
  return {
    workspaceId,
    items,
    page,
    pageSize: 100,
    total: items.length,
    totalPages,
    facets: {
      all: items.length,
      archived: 0,
      statuses: { execucao: items.length },
      services: { [sourceServiceId]: items.length },
    },
  };
}

function service(): Service {
  return {
    id: sourceServiceId,
    workspaceId,
    version: 1,
    name: "Branding",
    description: "Estratégia de marca",
    icon: "palette",
    color: "violet",
    defaultStatus: "execucao",
    defaultDurationDays: 30,
    defaultBriefing: "Briefing padrão",
    tags: project.tags,
    responsibles: [member],
    defaultContractType: "one_off",
    defaultAmountCents: 1_250_050,
    defaultInstallmentCount: 2,
    defaultPaymentMethod: "Pix",
    defaultPaymentTerms: "Entrada e entrega",
    defaultFinanceNotes: "Sem juros",
    archivedAt: null,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
  };
}

function options(): ProjectOptions {
  return {
    workspaceId,
    workspaceName: "Aurora",
    members: [member],
    services: [service()],
    tags: project.tags,
  };
}

describe("cliente de projetos", () => {
  it("consulta filtros paginados sem enviar workspaceId", async () => {
    const fetcher = vi.fn(async () =>
      Response.json(projectList([project])),
    ) as FetchLike;

    await listProjects(
      {
        workspaceId,
        page: 2,
        pageSize: 25,
        query: "Identidade",
        status: "execucao",
        serviceId: sourceServiceId,
        orderBy: "name_asc",
        archived: "include",
        includeEmptyInstitutional: true,
      },
      fetcher,
    );

    const url = String(vi.mocked(fetcher).mock.calls[0]?.[0]);
    expect(url).toContain("page=2");
    expect(url).toContain("query=Identidade");
    expect(url).toContain("status=execucao");
    expect(url).toContain(`serviceId=${sourceServiceId}`);
    expect(url).toContain("archived=include");
    expect(url).toContain("includeEmptyInstitutional=true");
    expect(url).toContain(`workspaceId=${workspaceId}`);
  });

  it("carrega todas as páginas, elimina duplicatas e mantém um workspace", async () => {
    const second = {
      ...project,
      id: "3b6bfed2-3d4c-4895-8110-3cb40b023f0e",
    };
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      const page = new URL(String(input), "http://localhost").searchParams.get(
        "page",
      );
      return Response.json(
        page === "1"
          ? projectList([project], 1, 2)
          : projectList([project, second], 2, 2),
      );
    }) as FetchLike;

    expect(await listAllActiveProjects({}, fetcher)).toEqual([project, second]);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("rejeita troca de workspace entre páginas ou dentro dos itens", async () => {
    const foreignWorkspace = "df5f49cd-617e-4c69-bb55-1f8da54bdc82";
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      const page = new URL(String(input), "http://localhost").searchParams.get(
        "page",
      );
      const result = projectList([], Number(page), 2);
      if (page !== "1") {
        result.items = [{ ...project, workspaceId: foreignWorkspace }];
      }
      return Response.json(result);
    }) as FetchLike;

    await expect(listAllActiveProjects({}, fetcher)).rejects.toEqual(
      new ProjectApiError(
        409,
        "O workspace mudou durante o carregamento dos projetos. Tente novamente.",
      ),
    );
  });

  it("carrega opções relacionais com cancelamento repassado", async () => {
    const fetcher = vi.fn(async () => Response.json(options())) as FetchLike;
    const controller = new AbortController();
    expect(
      await getProjectOptions({ signal: controller.signal }, fetcher),
    ).toEqual(options());
    expect(fetcher).toHaveBeenCalledWith(
      "/api/projects/options",
      expect.objectContaining({ signal: controller.signal }),
    );
  });

  it("carrega opções relacionais de um workspace acessível", async () => {
    const fetcher = vi.fn(async () => Response.json(options())) as FetchLike;
    const controller = new AbortController();

    expect(
      await getProjectOptions(
        { workspaceId, signal: controller.signal },
        fetcher,
      ),
    ).toEqual(options());
    expect(fetcher).toHaveBeenCalledWith(
      `/api/projects/options?workspaceId=${workspaceId}`,
      expect.objectContaining({ signal: controller.signal }),
    );
  });

  it("preserva relações, centavos, datas e parcelas no round-trip visual", () => {
    const record = projectToEntityRecord(project);
    const input = entityValuesToProjectInput(record, record);

    expect(record.valor).toBe("12.500,50");
    expect(input).toEqual({
      name: project.name,
      businessId,
      serviceIds: [sourceServiceId, additionalServiceId],
      status: project.status,
      startDate: project.startDate,
      endDate: project.endDate,
      briefing: project.briefing,
      tagLabels: project.tags.map(({ name }) => name),
      responsibleUserIds: [member.userId],
      contractType: project.contractType,
      amountCents: project.amountCents,
      firstDueDate: project.firstDueDate,
      paymentMethod: project.paymentMethod,
      paymentTerms: project.paymentTerms,
      financeNotes: project.financeNotes,
      installments: project.installments.map(
        ({ number, dueDate, amountCents, status }) => ({
          number,
          dueDate,
          amountCents,
          status,
        }),
      ),
    });
    expect(projectRelationsFromRecord(record)).toEqual({
      business: project.business,
      services: project.services,
      tags: project.tags,
      responsibles: project.responsibles,
      installments: project.installments,
      sourceServiceId,
    });
    expect(input).not.toHaveProperty("workspaceId");
  });

  it("mantém o status real ao editar projeto arquivado", () => {
    const record = projectToEntityRecord({
      ...project,
      archivedAt: "2026-07-14T02:00:00.000Z",
    });
    expect(record.status).toBe("arquivado");
    expect(entityValuesToProjectInput(record, record).status).toBe("execucao");
  });

  it("permite limpar tags e parcelas explicitamente", () => {
    const record = projectToEntityRecord(project);
    const input = entityValuesToProjectInput(
      { ...record, tagLabels: "[]", installments: "[]" },
      record,
    );

    expect(input.tagLabels).toEqual([]);
    expect(input.installments).toEqual([]);
  });

  it("monta criação por modelo com source separado dos serviços extras", async () => {
    const record = projectToEntityRecord(project);
    const input = entityValuesToProjectFromServiceInput(record, record);
    const fetcher = vi.fn(async () => Response.json(project)) as FetchLike;

    await createProjectFromService(input, fetcher);

    expect(input.serviceId).toBe(sourceServiceId);
    expect(input.additionalServiceIds).toEqual([additionalServiceId]);
    expect(fetcher).toHaveBeenCalledWith(
      "/api/projects/from-service",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify(input),
      }),
    );
  });

  it("mantém os defaults do servidor quando o modelo não recebeu overrides", () => {
    const record = projectToEntityRecord(project);
    const input = entityValuesToProjectFromServiceInput(
      { ...record, sourceOverrideFields: "[]" },
      record,
    );

    expect(input).toEqual({
      serviceId: sourceServiceId,
      additionalServiceIds: [additionalServiceId],
      name: project.name,
      businessId,
      startDate: project.startDate,
    });
  });

  it("envia somente os campos do modelo alterados pelo usuário", () => {
    const record = projectToEntityRecord(project);
    const input = entityValuesToProjectFromServiceInput(
      {
        ...record,
        sourceOverrideFields: JSON.stringify(["briefing", "amountCents"]),
      },
      record,
    );

    expect(input).toMatchObject({
      briefing: project.briefing,
      amountCents: project.amountCents,
    });
    expect(input).not.toHaveProperty("status");
    expect(input).not.toHaveProperty("responsibleUserIds");
    expect(input).not.toHaveProperty("installments");
  });

  it("preserva a mensagem pública de falhas da API", async () => {
    const fetcher = vi.fn(async () =>
      Response.json({ message: "Serviço inválido." }, { status: 400 }),
    ) as FetchLike;

    await expect(listProjects({}, fetcher)).rejects.toEqual(
      new ProjectApiError(400, "Serviço inválido."),
    );
  });
});
