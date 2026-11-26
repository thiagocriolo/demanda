import type { EntityConfig } from "./types";
import type { EntityCardAction, EntityCardItem } from "$lib/ui/entity-card";

export const ENTITY_CREATE_CONTEXT = Symbol("entity-create");

export type EntityCreateOpenOptions = {
  servicePackageId?: string;
};

export type EntityCreateContext = {
  open: (key: EntityConfig["key"], options?: EntityCreateOpenOptions) => void;
  actOnCard: (action: EntityCardAction, item: EntityCardItem) => void;
};
