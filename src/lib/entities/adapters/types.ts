import type { EntityConfig, EntityRecord } from "../types";

export type PersistedEntityKey = Extract<
  EntityConfig["key"],
  "pessoas" | "negocios" | "projetos" | "entregas"
>;

export type EntityPersistenceMode = "create" | "view" | "edit";

export type EntitySaveRequest = {
  mode: EntityPersistenceMode;
  values: Record<string, string>;
  current?: EntityRecord;
};

export type EntityPersistenceAdapter = {
  load(id: string): Promise<EntityRecord>;
  save(request: EntitySaveRequest): Promise<EntityRecord>;
  archive(id: string, current?: EntityRecord): Promise<void>;
  isApiError(cause: unknown): boolean;
};
