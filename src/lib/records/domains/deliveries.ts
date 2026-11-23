import {
  listDeliveries,
  observeDeliveries,
  DeliveryApiError,
  deliveryToEntityRecord,
} from "../../deliveries/client";
import type { DeliveryList } from "../../deliveries/types";
import { resolveResponsibleUser } from "../../workspaces/responsible-user";
import type { RecordsDomain } from "../types";
import { archivedMode, baseCard, dynamicStatusFilterOptions } from "./common";

type DeliveryFacets = DeliveryList["facets"];

function deliverySteps(serializedTasks: string): string {
  try {
    const tasks = JSON.parse(serializedTasks || "[]") as Array<{
      status?: unknown;
    }>;
    if (!Array.isArray(tasks)) return "0/0";
    const completed = tasks.filter(({ status }) =>
      ["concluida", "concluido", "conclusao", "done", "completed"].includes(
        String(status ?? "").toLocaleLowerCase("pt-BR"),
      ),
    ).length;
    return `${completed}/${tasks.length}`;
  } catch {
    return "0/0";
  }
}

export const deliveryRecordsDomain: RecordsDomain<DeliveryFacets> = {
  initialFacets: {
    all: 0,
    archived: 0,
    statuses: {},
    priorities: {},
    categories: {},
    projects: {},
  },

  async list(request) {
    const result = await listDeliveries({
      page: request.page,
      pageSize: request.pageSize,
      query: request.query,
      status:
        request.filter !== "todos" && request.filter !== "arquivado"
          ? request.filter
          : undefined,
      orderBy: request.orderBy,
      archived: archivedMode(request),
      includeInactiveProjects: true,
      signal: request.signal,
    });
    return { ...result, items: result.items.map(deliveryToEntityRecord) };
  },

  observe: observeDeliveries,

  errorMessage(cause) {
    return cause instanceof DeliveryApiError
      ? cause.message
      : "Não foi possível carregar as entregas.";
  },

  filterOptions(config, facets) {
    return dynamicStatusFilterOptions(
      config,
      facets.statuses,
      facets.all,
      facets.archived,
      "Arquivadas",
    );
  },

  toCard(config, record, workspaceUsers) {
    const responsibleUser = resolveResponsibleUser(record, workspaceUsers);
    return {
      ...baseCard(config, record),
      primary: record.negocio || "Negócio não informado",
      secondary: record.projeto || "Projeto não informado",
      relation: record.categoria || record.descricao || "Entrega planejada",
      responsible: record.responsavel || "Sem responsável",
      responsibleAvatarUrl: responsibleUser?.avatarUrl,
      steps: deliverySteps(record.entregas),
    };
  },
};
