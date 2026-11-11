import { businessEntityAdapter } from "./business";
import { contactEntityAdapter } from "./contact";
import { projectEntityAdapter } from "./project";
import { taskEntityAdapter } from "./task";
import type { EntityPersistenceAdapter, PersistedEntityKey } from "./types";

export type {
  EntityPersistenceAdapter,
  EntityPersistenceMode,
  EntitySaveRequest,
  PersistedEntityKey,
} from "./types";

const adapters: Record<PersistedEntityKey, EntityPersistenceAdapter> = {
  pessoas: contactEntityAdapter,
  negocios: businessEntityAdapter,
  projetos: projectEntityAdapter,
  entregas: taskEntityAdapter,
};

export function getEntityPersistenceAdapter(
  key: string,
): EntityPersistenceAdapter | undefined {
  return adapters[key as PersistedEntityKey];
}

export function entityPersistenceErrorMessage(cause: unknown): string {
  return Object.values(adapters).some((adapter) => adapter.isApiError(cause)) &&
    cause instanceof Error
    ? cause.message
    : "Não foi possível concluir a operação solicitada.";
}
