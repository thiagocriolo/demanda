<script lang="ts">
  import EntityCard from "$lib/ui/EntityCard.svelte";
  import { toAgendaCardItem } from "./card-item";
  import type { AgendaItem } from "./types";

  let {
    item,
    level,
    timeLabel = "",
    isDragging = false,
    ondragstart,
    ondragend,
    ondropbefore,
    onunschedule,
    onopen,
  } = $props<{
    item: AgendaItem;
    level: number;
    timeLabel?: string;
    isDragging?: boolean;
    ondragstart: (event: DragEvent, item: AgendaItem) => void;
    ondragend: () => void;
    ondropbefore: (event: DragEvent, item: AgendaItem) => void;
    onunschedule: (item: AgendaItem) => void;
    onopen: (item: AgendaItem) => void;
  }>();

  let cardItem = $derived(toAgendaCardItem(item, timeLabel));

  function handleDrop(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    ondropbefore(event, item);
  }
</script>

<div
  class:dragging={isDragging}
  class="agenda-entity-card"
  draggable={true}
  role="group"
  aria-label={`${item.mode === "tasks" ? "Tarefa" : "Projeto"}: ${item.title}. Arraste para reagendar.`}
  data-agenda-card={item.id}
  data-agenda-card-level={level}
  ondragstart={(event) => ondragstart(event, item)}
  {ondragend}
  ondragover={(event) => event.preventDefault()}
  ondrop={handleDrop}
>
  <EntityCard item={cardItem} {level} />
</div>

<style>
  .agenda-entity-card {
    position: relative;
    width: 100%;
    min-width: 0;
    cursor: grab;
    transition: opacity var(--motion-fast);
  }
  .agenda-entity-card:active {
    cursor: grabbing;
  }
  .agenda-entity-card.dragging {
    opacity: 0.28;
  }
</style>
