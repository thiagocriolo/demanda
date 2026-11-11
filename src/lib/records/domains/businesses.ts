import {
  BusinessApiError,
  businessToEntityRecord,
  listBusinesses,
  observeBusinesses,
} from "../../businesses/client";
import type { BusinessList } from "../../businesses/types";
import type { RecordsDomain } from "../types";
import { archivedMode, baseCard, dynamicStatusFilterOptions } from "./common";

type BusinessFacets = BusinessList["facets"];

export const businessRecordsDomain: RecordsDomain<BusinessFacets> = {
  initialFacets: { all: 0, archived: 0, stages: {}, categories: {} },

  async list(request) {
    const result = await listBusinesses({
      page: request.page,
      pageSize: request.pageSize,
      query: request.query,
      stage:
        request.filter !== "todos" && request.filter !== "arquivado"
          ? request.filter
          : undefined,
      orderBy: request.orderBy,
      archived: archivedMode(request),
      signal: request.signal,
    });
    return { ...result, items: result.items.map(businessToEntityRecord) };
  },

  observe: observeBusinesses,

  errorMessage(cause) {
    return cause instanceof BusinessApiError
      ? cause.message
      : "Não foi possível carregar os negócios.";
  },

  filterOptions(config, facets) {
    return dynamicStatusFilterOptions(
      config,
      facets.stages,
      facets.all,
      facets.archived,
      "Arquivado",
    );
  },

  toCard(config, record) {
    const responsibles = (record.responsaveis ?? "")
      .split(",")
      .map((name) => name.trim())
      .filter(Boolean);
    const category = config.config.fields
      .find((field) => field.name === "categoria")
      ?.options?.find((option) => option.value === record.categoria);
    return {
      ...baseCard(config, record),
      primary: responsibles[0] || "Responsável não informado",
      primaryMore:
        responsibles.length > 1 ? `+${responsibles.length - 1}` : undefined,
      secondary:
        category?.label || record.categoria || "Categoria não informada",
      relation: record.observacoes || "Sem resumo do cliente",
    };
  },
};
