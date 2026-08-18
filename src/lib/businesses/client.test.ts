import { describe, expect, it, vi } from "vitest";
import type { EntityRecord } from "../entities/types";
import {
  BusinessApiError,
  businessResponsiblesFromRecord,
  businessToEntityRecord,
  entityValuesToBusinessInput,
  listAllActiveBusinesses,
  listBusinessResponsibleUsers,
  listBusinesses,
  type FetchLike,
} from "./client";
import type { Business, BusinessList } from "./types";

const business: Business = {
  id: "c9ad3fab-41c2-4d61-b5fb-946778633b5d",
  workspaceId: "2e50fbac-2d0b-431e-a4bf-4c249bd90be5",
  ownerUserId: "dbb8ef47-c306-4f98-b3ee-e05d93edb852",
  name: "Portal institucional",
  category: "negocio",
  stage: "negociacao",
  responsibles: [
    {
      contactId: "80d26625-5e26-4dad-b031-fb43ac831ca9",
      name: "Maria",
      contactType: "person",
      status: "active",
      profession: "Designer",
      archivedAt: null,
    },
    {
      contactId: "149a4a3d-b777-45bc-ad25-b9a2470ba491",
      name: "João",
      contactType: "person",
      status: "prospect",
      profession: null,
      archivedAt: null,
    },
  ],
  notes: [
    {
      id: "94f589a3-40bf-465f-a259-b50bc30f90ae",
      body: "Primeira observação",
      createdAt: "2026-07-14T00:00:00.000Z",
      updatedAt: "2026-07-14T00:00:00.000Z",
    },
    {
      id: "56164158-77f5-48f5-9585-e71b03f5a150",
      body: "Histórico preservado",
      createdAt: "2026-07-13T00:00:00.000Z",
      updatedAt: "2026-07-13T00:00:00.000Z",
    },
  ],
  archivedAt: null,
  createdAt: "2026-07-14T00:00:00.000Z",
  updatedAt: "2026-07-14T00:00:00.000Z",
};

function list(items: Business[], page = 1, totalPages = 1): BusinessList {
  return {
    workspaceId: business.workspaceId,
    ownerUserId: business.ownerUserId,
    items,
    page,
    pageSize: 100,
    total: items.length,
    totalPages,
    facets: {
      all: items.length,
      archived: 0,
      stages: { negociacao: items.length },
      categories: { negocio: items.length },
    },
  };
}

function formValues(record: EntityRecord): Record<string, string> {
  return {
    nome: record.nome,
    categoria: record.categoria,
    etapa: record.etapa,
    responsaveis: record.responsaveis,
    responsavelIds: record.responsavelIds,
    observacoes: record.observacoes,
  };
}

describe("cliente de negócios", () => {
  it("consulta filtros paginados sem enviar workspaceId", async () => {
    const fetcher = vi.fn(async () =>
      Response.json(list([business])),
    ) as FetchLike;
    await listBusinesses(
      {
        page: 2,
        pageSize: 25,
        query: "Portal",
        stage: "negociacao",
        category: "negocio",
        archived: "include",
      },
      fetcher,
    );

    const url = String(vi.mocked(fetcher).mock.calls[0]?.[0]);
    expect(url).toContain("page=2");
    expect(url).toContain("query=Portal");
    expect(url).toContain("stage=negociacao");
    expect(url).toContain("category=negocio");
    expect(url).toContain("archived=include");
    expect(url).not.toContain("workspaceId=");
  });

  it("carrega o catálogo completo atravessando todas as páginas", async () => {
    const second = { ...business, id: "07bd38f1-2386-4fd4-81fd-e0bf66680f4e" };
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      const page = new URL(String(input), "http://localhost").searchParams.get(
        "page",
      );
      return Response.json(
        page === "1" ? list([business], 1, 2) : list([second], 2, 2),
      );
    }) as FetchLike;

    expect(await listAllActiveBusinesses({}, fetcher)).toEqual([
      business,
      second,
    ]);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("rejeita páginas pertencentes a usuários diferentes", async () => {
    const foreignOwner = "df5f49cd-617e-4c69-bb55-1f8da54bdc82";
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      const page = new URL(String(input), "http://localhost").searchParams.get(
        "page",
      );
      const result = list(page === "1" ? [business] : [], Number(page), 2);
      if (page !== "1") result.ownerUserId = foreignOwner;
      return Response.json(result);
    }) as FetchLike;

    await expect(listAllActiveBusinesses({}, fetcher)).rejects.toEqual(
      new BusinessApiError(
        409,
        "O usuário mudou durante o carregamento dos negócios. Tente novamente.",
      ),
    );
  });

  it("preserva responsáveis e todas as observações no round-trip visual", () => {
    const record = businessToEntityRecord(business);
    const input = entityValuesToBusinessInput(formValues(record), record);

    expect(input).toEqual({
      name: business.name,
      category: business.category,
      stage: business.stage,
      responsibleContactIds: business.responsibles.map(
        ({ contactId }) => contactId,
      ),
      notes: business.notes.map(({ body }) => ({ body })),
    });
    expect(businessResponsiblesFromRecord(record)).toEqual(
      business.responsibles,
    );
    expect(input).not.toHaveProperty("workspaceId");
  });

  it("altera somente a observação visível e mantém o histórico adicional", () => {
    const record = businessToEntityRecord(business);
    const input = entityValuesToBusinessInput(
      { ...formValues(record), observacoes: "Resumo atualizado" },
      record,
    );

    expect(input.notes).toEqual([
      { body: "Resumo atualizado" },
      { body: "Histórico preservado" },
    ]);
  });

  it("preserva contatos e usuários como responsáveis distintos", async () => {
    const userId = "2973555a-23ab-48b5-983d-907a53d592e5";
    const mixedBusiness: Business = {
      ...business,
      responsibles: [
        business.responsibles[0],
        {
          kind: "user",
          contactId: null,
          userId,
          name: "Thiago",
          contactType: null,
          status: null,
          profession: null,
          username: "thiago",
          email: "thiago@example.test",
          avatarUrl: null,
          archivedAt: null,
        },
      ],
    };
    const record = businessToEntityRecord(mixedBusiness);

    expect(JSON.parse(record.responsavelIds)).toEqual([
      `contact:${business.responsibles[0].contactId}`,
      `user:${userId}`,
    ]);
    expect(
      entityValuesToBusinessInput(formValues(record), record),
    ).toMatchObject({
      responsibleContactIds: [business.responsibles[0].contactId],
      responsibleUserIds: [userId],
    });

    const fetcher = vi.fn(async () =>
      Response.json([
        {
          id: userId,
          name: "Thiago",
          username: "thiago",
          email: "thiago@example.test",
          avatarUrl: null,
          current: true,
        },
      ]),
    ) as FetchLike;
    await expect(listBusinessResponsibleUsers(fetcher)).resolves.toHaveLength(
      1,
    );
    expect(fetcher).toHaveBeenCalledWith("/api/business-responsibles/users", {
      signal: undefined,
    });
  });

  it("mantém a etapa real ao mapear e editar um negócio arquivado", () => {
    const record = businessToEntityRecord({
      ...business,
      archivedAt: "2026-07-14T01:00:00.000Z",
    });
    expect(record.etapa).toBe("arquivado");
    expect(entityValuesToBusinessInput(formValues(record), record).stage).toBe(
      "negociacao",
    );
  });

  it("preserva a mensagem pública de falhas da API", async () => {
    const fetcher = vi.fn(async () =>
      Response.json({ message: "Responsável inválido." }, { status: 400 }),
    ) as FetchLike;

    await expect(listBusinesses({}, fetcher)).rejects.toEqual(
      new BusinessApiError(400, "Responsável inválido."),
    );
  });
});
