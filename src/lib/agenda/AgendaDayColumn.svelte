<script lang="ts">
  import type { AgendaItem } from "./types";
  import { formatDayMonth, formatWeekday } from "./date-utils";
  import AgendaEntityCard from "./AgendaEntityCard.svelte";
  import CardDropPlaceholder from "$lib/dnd/CardDropPlaceholder.svelte";
  import { cardDropBeforeId } from "$lib/dnd/card-drop-position";

  let {
    date,
    items,
    today,
    variant = "weekly",
    draggingId = null,
    activeDropDate = null,
    activeDropBeforeId,
    dropPlaceholderHeight = 92,
    dropPlaceholderWidth,
    timeLabels = {},
    ondragstart,
    ondragend,
    ondragoverdate,
    ondropitem,
    onunschedule,
    onopen,
    onpanstart,
  } = $props<{
    date: string;
    items: AgendaItem[];
    today: string;
    variant?: "daily" | "weekly" | "upcoming";
    draggingId?: string | null;
    activeDropDate?: string | null;
    activeDropBeforeId?: string;
    dropPlaceholderHeight?: number;
    dropPlaceholderWidth?: number;
    timeLabels?: Record<string, string>;
    ondragstart: (event: DragEvent, item: AgendaItem) => void;
    ondragend: () => void;
    ondragoverdate: (date: string, beforeId?: string) => void;
    ondropitem: (event: DragEvent, date: string, beforeId?: string) => void;
    onunschedule: (item: AgendaItem) => void;
    onopen: (item: AgendaItem) => void;
    onpanstart?: (event: PointerEvent) => void;
  }>();

  let cardLevel = $derived(variant === "daily" ? 6 : 5);

  function handleDragOver(event: DragEvent): void {
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
    const container = event.currentTarget as HTMLElement;
    const beforeId = cardDropBeforeId(event, container, {
      cardSelector: "[data-agenda-card-slot]",
      idAttribute: "data-agenda-card-slot",
      axis: variant === "daily" ? "horizontal" : "vertical",
      excludeId: draggingId,
    });
    ondragoverdate(date, beforeId);
  }
</script>

<section
  class:today={date === today}
  class:drop-target={activeDropDate === date}
  class:has-items={items.length > 0}
  class={`day-column ${variant}`}
  role="list"
  aria-label={`${formatWeekday(date)}, ${formatDayMonth(date)}`}
  data-agenda-date={date}
  ondragover={handleDragOver}
  ondrop={(event) => ondropitem(event, date)}
>
  <header
    class:pannable={variant === "weekly" && !!onpanstart}
    role={variant === "weekly" && onpanstart ? "group" : undefined}
    aria-label={variant === "weekly" && onpanstart
      ? `${formatWeekday(date)}, ${formatDayMonth(date)}. Arraste para navegar pelos dias.`
      : undefined}
    title={variant === "weekly" && onpanstart
      ? "Arraste para navegar pelos dias"
      : undefined}
    onpointerdown={(event) => onpanstart?.(event)}
  >
    <div>
      <strong>{formatWeekday(date)}</strong>
      <span>{formatDayMonth(date)}</span>
    </div>
    <span class="count">{items.length}</span>
  </header>
  <div class="day-body">
    {#if items.length}
      <div class="card-grid" style={`--item-count: ${items.length}`}>
        {#each items as item (item.id)}
          {#if activeDropDate === date && activeDropBeforeId === item.id}
            <CardDropPlaceholder
              height={dropPlaceholderHeight}
              width={variant === "daily" ? dropPlaceholderWidth : undefined}
            />
          {/if}
          <div class="card-slot" data-agenda-card-slot={item.id}>
            <AgendaEntityCard
              {item}
              level={cardLevel}
              timeLabel={timeLabels[item.id] ?? ""}
              isDragging={draggingId === item.id}
              {ondragstart}
              {ondragend}
              ondropbefore={(event) =>
                ondropitem(event, date, activeDropBeforeId)}
              {onunschedule}
              {onopen}
            />
          </div>
        {/each}
        {#if activeDropDate === date && activeDropBeforeId === undefined}
          <CardDropPlaceholder
            height={dropPlaceholderHeight}
            width={variant === "daily" ? dropPlaceholderWidth : undefined}
          />
        {/if}
      </div>
    {:else}
      {#if activeDropDate === date}
        <CardDropPlaceholder
          height={dropPlaceholderHeight}
          width={variant === "daily" ? dropPlaceholderWidth : undefined}
        />
      {:else}
        <div class="empty">
          <span></span>
          <p>Arraste um card para este dia</p>
        </div>
      {/if}
    {/if}
  </div>
</section>

<style>
  .day-column {
    display: grid;
    min-width: 0;
    min-height: 250px;
    grid-template-rows: auto minmax(0, 1fr);
    overflow: hidden;
    border: 1px solid color-mix(in srgb, var(--brand-600) 20%, var(--border));
    border-radius: var(--radius-xl);
    background:
      linear-gradient(180deg, var(--brand-50) 0%, transparent 34%),
      var(--surface);
    transition:
      border-color var(--motion-fast),
      box-shadow var(--motion-fast);
  }
  .day-column.today {
    border-color: color-mix(in srgb, var(--brand-600) 52%, var(--border));
    box-shadow: inset 0 3px 0 var(--brand-600);
  }
  .day-column.drop-target {
    border-color: var(--brand-600);
    box-shadow: inset 0 0 0 2px
      color-mix(in srgb, var(--brand-600) 42%, transparent);
  }
  header {
    display: flex;
    min-height: 62px;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 12px 14px;
    border-bottom: 1px solid var(--border);
  }
  header.pannable {
    cursor: grab;
    touch-action: pan-y;
    user-select: none;
  }
  header.pannable:active {
    cursor: grabbing;
  }
  header > div {
    display: grid;
    min-width: 0;
    gap: 2px;
  }
  header strong {
    overflow: hidden;
    color: var(--ink-800);
    font-size: var(--text-md);
    font-weight: 600;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  header span:not(.count) {
    color: var(--ink-500);
    font-size: var(--text-xs);
  }
  .count {
    display: grid;
    min-width: 28px;
    height: 26px;
    padding-inline: 8px;
    border: 1px solid color-mix(in srgb, var(--brand-600) 22%, var(--border));
    border-radius: var(--radius-pill);
    color: var(--brand-700);
    background: color-mix(in srgb, var(--brand-600) 7%, #fff);
    font-size: var(--text-xs);
    font-weight: 600;
    place-items: center;
  }
  .day-body {
    min-height: 0;
    padding: 10px;
  }
  .card-grid {
    display: grid;
    min-width: 0;
    align-items: start;
    align-content: start;
    gap: 9px;
    container-type: inline-size;
  }
  .daily .card-grid {
    display: flex;
    width: max-content;
    min-width: 100%;
    flex-wrap: nowrap;
  }
  .weekly .card-grid,
  .upcoming .card-grid {
    grid-template-columns: minmax(0, 1fr);
  }
  .daily .card-slot {
    width: clamp(290px, 28vw, 370px);
    min-width: clamp(290px, 28vw, 370px);
  }
  .empty {
    display: grid;
    min-height: 100%;
    place-content: center;
    justify-items: center;
    gap: 9px;
    color: var(--ink-400);
    text-align: center;
  }
  .empty span {
    width: 30px;
    height: 30px;
    border: 1px dashed var(--border-strong);
    border-radius: 9px;
    background: rgba(255, 255, 255, 0.45);
  }
  .empty p {
    font-size: var(--text-xs);
  }
  .weekly {
    width: 280px;
    min-width: 280px;
    height: 100%;
    min-height: 0;
    scroll-snap-align: start;
    scroll-snap-stop: always;
  }
  .weekly .day-body {
    overflow-y: auto;
  }
  .daily {
    min-height: 62px;
    grid-template-rows: auto auto;
  }
  .daily > header {
    min-height: 62px;
  }
  .daily .day-body {
    padding: 12px;
    overflow-x: auto;
    overflow-y: hidden;
    scrollbar-width: thin;
  }
  .daily:not(.has-items) {
    grid-template-rows: auto;
  }
  .daily:not(.has-items) .day-body {
    display: none;
  }
  .upcoming {
    min-height: 165px;
    border: 0;
    border-radius: 0;
    background: transparent;
  }
  .upcoming header {
    min-height: 52px;
    padding-block: 9px;
  }
  .upcoming .day-body {
    padding: 10px 14px 14px;
  }
  @media (max-width: 640px) {
    .daily {
      grid-template-rows: auto auto;
    }
    .daily > header {
      min-height: 58px;
      align-items: center;
      padding: 10px 12px;
    }
    .daily .card-slot {
      width: min(300px, calc(100vw - 68px));
      min-width: min(300px, calc(100vw - 68px));
    }
  }
</style>
