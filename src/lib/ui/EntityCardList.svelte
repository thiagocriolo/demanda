<script module lang="ts">
  export type {
    EntityCardAction,
    EntityCardItem,
    EntityCardKind,
  } from "./entity-card";
</script>

<script lang="ts">
  import type { EntityConfig } from "$lib/entities/types";
  import EntityCardShowcase from "./EntityCardShowcase.svelte";
  import type { EntityCardItem } from "./entity-card";

  let {
    items,
    level,
    ariaLabel,
    interactive = true,
    createKey,
    createLabel,
  } = $props<{
    items?: EntityCardItem[];
    /** Usa a escala global quando omitido. */
    level?: number;
    ariaLabel?: string;
    interactive?: boolean;
    createKey?: EntityConfig["key"];
    createLabel?: string;
  }>();
</script>

<EntityCardShowcase
  {items}
  {level}
  {ariaLabel}
  {interactive}
  {createKey}
  {createLabel}
/>
