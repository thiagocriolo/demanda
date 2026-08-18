<script module lang="ts">
  export type {
    EntityCardAction,
    EntityCardItem,
    EntityCardKind,
  } from "./entity-card";
</script>

<script lang="ts">
  import EntityCardShowcase from "./EntityCardShowcase.svelte";
  import type { EntityCardItem } from "./entity-card";

  let {
    item,
    level,
    interactive = true,
  } = $props<{
    item: EntityCardItem;
    /** Usa a escala global quando omitido. */
    level?: number;
    interactive?: boolean;
  }>();
</script>

<EntityCardShowcase
  items={[item]}
  {level}
  {interactive}
  single
  ariaLabel={`Card de ${item.kind}: ${item.title}`}
/>
