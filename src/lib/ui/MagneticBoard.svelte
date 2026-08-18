<script lang="ts">
  import { GripVertical } from "@lucide/svelte";

  export type BoardItem = { id: string; title: string; detail?: string };
  export type BoardColumn = { id: string; title: string; items: BoardItem[] };
  let { columns = $bindable(), onmove } = $props<{
    columns: BoardColumn[];
    onmove?: (itemId: string, targetColumnId: string) => void;
  }>();

  let dragging = $state<{ itemId: string; fromId: string } | null>(null);
  let overColumn = $state<string | null>(null);

  function start(itemId: string, fromId: string, event: DragEvent): void {
    dragging = { itemId, fromId };
    event.dataTransfer?.setData("text/plain", itemId);
    if (event.dataTransfer) event.dataTransfer.effectAllowed = "move";
  }

  function drop(targetId: string): void {
    if (!dragging) return;
    const source = columns.find(
      (column: BoardColumn) => column.id === dragging?.fromId,
    );
    const item = source?.items.find(
      (entry: BoardItem) => entry.id === dragging?.itemId,
    );
    if (!source || !item || targetId === source.id) {
      reset();
      return;
    }
    columns = columns.map((column: BoardColumn) => {
      if (column.id === source.id)
        return {
          ...column,
          items: column.items.filter(
            (entry: BoardItem) => entry.id !== item.id,
          ),
        };
      if (column.id === targetId)
        return { ...column, items: [...column.items, item] };
      return column;
    });
    onmove?.(item.id, targetId);
    reset();
  }

  function reset(): void {
    dragging = null;
    overColumn = null;
  }
</script>

<div class="board">
  {#each columns as column (column.id)}
    <section
      aria-label={column.title}
      class:target={overColumn === column.id && dragging?.fromId !== column.id}
      ondragover={(event) => {
        event.preventDefault();
        overColumn = column.id;
      }}
      ondragleave={(event) => {
        if (event.currentTarget === event.target) overColumn = null;
      }}
      ondrop={(event) => {
        event.preventDefault();
        drop(column.id);
      }}
    >
      <header>
        <h3>{column.title}</h3>
        <span>{column.items.length}</span>
      </header>
      <div class="stack">
        {#each column.items as item (item.id)}
          <article
            draggable="true"
            class:dragging={dragging?.itemId === item.id}
            ondragstart={(event) => start(item.id, column.id, event)}
            ondragend={reset}
          >
            <GripVertical size={17} aria-hidden="true" />
            <div>
              <strong>{item.title}</strong>{#if item.detail}<small
                  >{item.detail}</small
                >{/if}
            </div>
          </article>
        {/each}
        {#if !column.items.length}<p>Solte um item aqui</p>{/if}
      </div>
    </section>
  {/each}
</div>

<style>
  .board {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(min(100%, 210px), 1fr));
    gap: 12px;
  }
  section {
    min-height: 210px;
    padding: 12px;
    border: 1px dashed var(--border-strong);
    border-radius: var(--radius-lg);
    background: var(--surface-soft);
    transition:
      border-color var(--motion-fast),
      background var(--motion-fast),
      transform var(--motion-fast);
  }
  section.target {
    border-color: var(--brand-600);
    background: var(--brand-50);
    transform: scale(1.012);
  }
  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 2px 3px 10px;
  }
  h3 {
    font-size: var(--text-sm);
    color: var(--ink-700);
  }
  header span {
    display: grid;
    min-width: 22px;
    height: 22px;
    place-items: center;
    border-radius: var(--radius-pill);
    color: var(--ink-500);
    background: var(--surface-hover);
    font-size: var(--text-xs);
  }
  .stack {
    display: grid;
    gap: 8px;
  }
  article {
    display: flex;
    min-width: 0;
    align-items: center;
    gap: 8px;
    padding: 11px 10px;
    border: 1px solid var(--border);
    border-radius: 10px;
    color: var(--ink-400);
    background: var(--surface);
    box-shadow: 0 2px 5px rgba(15, 23, 42, 0.05);
    cursor: grab;
    transition:
      opacity var(--motion-fast),
      transform var(--motion-fast);
  }
  article:active {
    cursor: grabbing;
  }
  article.dragging {
    opacity: 0.35;
    transform: scale(0.97);
  }
  article div {
    min-width: 0;
  }
  strong,
  small {
    display: block;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  strong {
    color: var(--ink-800);
    font-size: var(--text-sm);
    font-weight: 600;
  }
  small {
    margin-top: 3px;
    color: var(--ink-400);
    font-size: var(--text-xs);
  }
  p {
    padding: 25px 8px;
    color: var(--ink-400);
    font-size: var(--text-xs);
    text-align: center;
  }
</style>
