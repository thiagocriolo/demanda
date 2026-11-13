import {
  ProjectApiError,
  listProjects,
  observeProjects,
  projectToEntityRecord,
} from "../../projects/client";
import type { ProjectList } from "../../projects/types";
import type { RecordsDomain } from "../types";
import { archivedMode, baseCard, dynamicStatusFilterOptions } from "./common";

type ProjectFacets = ProjectList["facets"];

function formatDate(value: string): string {
  if (!value) return "Sem prazo";
  const date = new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("pt-BR").format(date);
}

export const projectRecordsDomain: RecordsDomain<ProjectFacets> = {
  initialFacets: { all: 0, archived: 0, statuses: {}, services: {} },

  async list(request) {
    const result = await listProjects({
      page: request.page,
      pageSize: request.pageSize,
      query: request.query,
      status:
        request.filter !== "todos" && request.filter !== "arquivado"
          ? request.filter
          : undefined,
      orderBy: request.orderBy,
      archived: archivedMode(request),
      includeInactive: true,
      signal: request.signal,
    });
    return { ...result, items: result.items.map(projectToEntityRecord) };
  },

  observe: observeProjects,

  errorMessage(cause) {
    return cause instanceof ProjectApiError
      ? cause.message
      : "Não foi possível carregar os projetos.";
  },

  filterOptions(config, facets) {
    return dynamicStatusFilterOptions(
      config,
      facets.statuses,
      facets.all,
      facets.archived,
      "Arquivados",
    );
  },

  toCard(config, record) {
    return {
      ...baseCard(config, record),
      secondary: record.negocio || record.cliente || "Negócio não informado",
      relation:
        record.responsavel || record.servicos || "Responsável não informado",
      completion: formatDate(record.dataFim || record.prazo),
    };
  },
};
