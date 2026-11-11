import {
  ContactApiError,
  contactToEntityRecord,
  listContacts,
  observeContacts,
} from "../../contacts/client";
import type { ContactList, ContactStatus } from "../../contacts/types";
import type { RecordsDomain } from "../types";
import { archivedMode, baseCard, configuredStatusOptions } from "./common";

type ContactFacets = ContactList["facets"];

const statusByFilter: Record<string, ContactStatus | undefined> = {
  lead: "lead",
  prospecto: "prospect",
  ativo: "active",
  desativado: "inactive",
};

export const contactRecordsDomain: RecordsDomain<ContactFacets> = {
  initialFacets: {
    all: 0,
    lead: 0,
    prospect: 0,
    active: 0,
    inactive: 0,
    archived: 0,
  },

  async list(request) {
    const result = await listContacts({
      page: request.page,
      pageSize: request.pageSize,
      query: request.query,
      status: statusByFilter[request.filter],
      orderBy: request.orderBy,
      archived: archivedMode(request),
      signal: request.signal,
    });
    return { ...result, items: result.items.map(contactToEntityRecord) };
  },

  observe: observeContacts,

  errorMessage(cause) {
    return cause instanceof ContactApiError
      ? cause.message
      : "Não foi possível carregar os contatos.";
  },

  filterOptions(config, facets) {
    const countByLegacyStatus: Record<string, number> = {
      lead: facets.lead,
      prospecto: facets.prospect,
      ativo: facets.active,
      desativado: facets.inactive,
      arquivado: facets.archived,
    };
    return [
      { value: "todos", label: "Todos", count: facets.all },
      ...configuredStatusOptions(config).map((option) => ({
        value: option.value,
        label: option.label,
        count: countByLegacyStatus[option.value] ?? 0,
      })),
    ];
  },

  toCard(config, record) {
    return {
      ...baseCard(config, record),
      primary: record.telefone || "Telefone não informado",
      secondary: record.email || "E-mail não informado",
      relation: record.cargo || "Contato cadastrado",
    };
  },
};
