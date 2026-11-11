import type { EntityConfig, EntityRecord } from "../entities/types";
import type { EntityCardItem, EntityCardKind } from "../ui/entity-card";
import type { FilterOption } from "../ui/FilterBar.svelte";
import type { WorkspaceUser } from "../workspaces/workspace-storage";

export type RecordsTab = "pessoas" | "negocios" | "projetos" | "tarefas";
export type RecordsOrderBy = "updated" | "name_asc" | "name_desc";

export type RecordsTabConfig = {
  config: EntityConfig;
  kind: EntityCardKind;
  statusField: string;
  placeholder: string;
  emptyLabel: string;
  createLabel: string;
};

export type RecordsListRequest = {
  page: number;
  pageSize: number;
  query: string;
  filter: string;
  orderBy: RecordsOrderBy;
  showArchived: boolean;
  signal: AbortSignal;
};

export type RecordsDomain<F> = {
  initialFacets: F;
  list(request: RecordsListRequest): Promise<{
    items: EntityRecord[];
    total: number;
    totalPages: number;
    facets: F;
  }>;
  observe(onchange: () => void): () => void;
  errorMessage(cause: unknown): string;
  filterOptions(config: RecordsTabConfig, facets: F): FilterOption[];
  toCard(
    config: RecordsTabConfig,
    record: EntityRecord,
    workspaceUsers: WorkspaceUser[],
  ): EntityCardItem;
};
