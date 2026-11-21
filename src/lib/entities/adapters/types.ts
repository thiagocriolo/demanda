import type { EntityConfig, EntityRecord } from "../types";

export type PersistedEntityKey = Extract<
  EntityConfig["key"],
  "pessoas" | "negocios" | "contratos" | "projetos" | "entregas"
>;

export type EntityPersistenceMode = "create" | "view" | "edit";

export type EntitySaveRequest = {
  mode: EntityPersistenceMode;
  values: Record<string, string>;
  current?: EntityRecord;
};

export type EntityDeleteOptions = {
  retainFinancialEntries?: boolean;
};

export type EntityPersistenceAdapter = {
  load(id: string): Promise<EntityRecord>;
  save(request: EntitySaveRequest): Promise<EntityRecord>;
  archive(id: string, current?: EntityRecord): Promise<void>;
  delete(
    id: string,
    current?: EntityRecord,
    options?: EntityDeleteOptions,
  ): Promise<void>;
  isApiError(cause: unknown): boolean;
};
