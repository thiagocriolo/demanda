import type { EntityConfig } from "./types";
import type { EntityCardAction, EntityCardItem } from "$lib/ui/entity-card";

export const ENTITY_CREATE_CONTEXT = Symbol("entity-create");

export type EntityCreateContext = {
  open: (key: EntityConfig["key"]) => void;
  actOnCard: (action: EntityCardAction, item: EntityCardItem) => void;
};
