<script lang="ts" generics="Item">
  import type { LucideIcon } from "@lucide/svelte";
  import type { Snippet } from "svelte";

  let {
    ariaLabel,
    title,
    description,
    icon: DrawerIcon,
    items,
    getKey,
    card,
    empty,
    open,
    isDropTarget = false,
    countLabel,
    toggleAriaLabel,
    ontoggle,
    ondragover,
    ondrop,
  } = $props<{
    ariaLabel: string;
    title: string;
    description: string;
    icon: LucideIcon;
    items: readonly Item[];
    getKey: (item: Item) => string | number;
    card: Snippet<[item: Item]>;
    empty: Snippet;
    open: boolean;
    isDropTarget?: boolean;
    countLabel?: string;
    toggleAriaLabel: string;
    ontoggle: () => void;
    ondragover?: (event: DragEvent) => void;
    ondrop?: (event: DragEvent) => void;
  }>();

  function handleWheel(event: WheelEvent): void {
    const list = event.currentTarget;
    if (!(list instanceof HTMLElement)) return;

    const maximum = list.scrollWidth - list.clientWidth;
    if (maximum <= 0) return;

    const amount =
      Math.abs(event.deltaY) >= Math.abs(event.deltaX)
        ? event.deltaY
        : event.deltaX;
    if (!amount) return;

    const previous = list.scrollLeft;
    list.scrollLeft = Math.max(0, Math.min(maximum, previous + amount));
    if (list.scrollLeft !== previous) event.preventDefault();
  }

  function handleDragOver(event: DragEvent): void {
    if (!ondragover && !ondrop) return;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
    ondragover?.(event);
  }

  function handleDrop(event: DragEvent): void {
    if (!ondrop) return;
    event.preventDefault();
    ondrop(event);
  }
</script>

<section
  class:open
  class:drop-target={isDropTarget}
  class="drawer"
  data-card-drawer
  aria-label={ariaLabel}
  ondragover={handleDragOver}
  ondrop={handleDrop}
>
  <header>
    <div class="drawer-controls">
      <span
        class="count"
        aria-label={countLabel ? `${items.length} ${countLabel}` : undefined}
        >{items.length}</span
      >
      <button
        type="button"
        role="switch"
        aria-checked={open}
        aria-label={toggleAriaLabel}
        onclick={ontoggle}><span aria-hidden="true"></span></button
      >
    </div>
    <span class="drawer-icon" aria-hidden="true"><DrawerIcon size={16} /></span>
    <div class="drawer-copy">
      <strong>{title}</strong>
      <span>{description}</span>
    </div>
  </header>

  {#if open}
    <div class="drawer-list" data-card-drawer-list onwheel={handleWheel}>
      {#if items.length}
        {#each items as item (getKey(item))}
          <div class="drawer-card" data-card-drawer-card>
            {@render card(item)}
          </div>
        {/each}
      {:else}
        <div class="drawer-empty">{@render empty()}</div>
      {/if}
    </div>
  {/if}
</section>

<style>
  .drawer {
    position: relative;
    z-index: 9;
    display: grid;
    min-width: 0;
    height: 50px;
    flex: 0 0 auto;
    grid-template-rows: 49px minmax(0, 1fr);
    margin-block-end: calc(-1 * var(--shell-content-padding-block-end, 0px));
    padding: 0 14px;
    overflow: hidden;
    border: 1px solid var(--border);
    border-radius: var(--radius-xl) var(--radius-xl) 0 0;
    background: linear-gradient(
      180deg,
      rgba(250, 252, 255, 0.98),
      rgba(242, 247, 252, 0.98)
    );
    box-shadow: 0 -8px 28px rgba(15, 23, 42, 0.08);
    transition:
      height var(--motion-base),
      border-color var(--motion-fast);
  }
  .drawer.open {
    height: 166px;
  }
  .drawer.drop-target {
    border-color: var(--brand-600);
    box-shadow: inset 0 0 0 2px
      color-mix(in srgb, var(--brand-600) 35%, transparent);
  }
  header {
    display: flex;
    min-width: 0;
    align-items: center;
    gap: 9px;
  }
  .drawer-controls {
    display: flex;
    flex: 0 0 auto;
    align-items: center;
    gap: 9px;
  }
  .drawer-icon {
    display: grid;
    width: 30px;
    height: 30px;
    border: 1px solid var(--border);
    border-radius: 8px;
    color: var(--ink-700);
    background: rgba(255, 255, 255, 0.72);
    place-items: center;
  }
  .drawer-copy {
    display: grid;
    min-width: 0;
    gap: 1px;
  }
  .drawer-copy strong {
    overflow: hidden;
    color: var(--ink-800);
    font-size: var(--text-sm);
    font-weight: 600;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .drawer-copy span {
    overflow: hidden;
    color: var(--ink-500);
    font-size: 10px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .count {
    display: grid;
    min-width: 30px;
    height: 27px;
    padding-inline: 8px;
    border: 1px solid var(--border);
    border-radius: var(--radius-pill);
    color: var(--ink-700);
    background: rgba(255, 255, 255, 0.72);
    font-size: var(--text-xs);
    font-weight: 600;
    place-items: center;
  }
  header button {
    display: flex;
    width: 47px;
    height: 27px;
    flex: 0 0 auto;
    align-items: center;
    padding: 2px;
    border: 1px solid color-mix(in srgb, var(--green-500) 42%, var(--border));
    border-radius: var(--radius-pill);
    background: var(--green-500);
    transition: background var(--motion-fast);
  }
  header button span {
    width: 21px;
    height: 21px;
    border-radius: 50%;
    background: #fff;
    box-shadow: 0 1px 3px rgba(15, 23, 42, 0.22);
    transform: translateX(20px);
    transition: transform var(--motion-base);
  }
  header button[aria-checked="false"] {
    border-color: var(--border-strong);
    background: #cbd5e1;
  }
  header button[aria-checked="false"] span {
    transform: translateX(0);
  }
  .drawer-list {
    display: flex;
    min-height: 0;
    align-items: flex-start;
    gap: 8px;
    padding: 3px 2px 11px;
    overflow-x: auto;
    overflow-y: hidden;
    -ms-overflow-style: none;
    scrollbar-width: none;
  }
  .drawer-list::-webkit-scrollbar {
    display: none;
  }
  .drawer-card {
    width: clamp(205px, 22vw, 260px);
    min-width: clamp(205px, 22vw, 260px);
    min-height: 0;
    container-type: inline-size;
  }
  .drawer-empty {
    display: flex;
    min-width: 250px;
    align-items: center;
    justify-content: center;
    gap: 8px;
    border: 1px dashed var(--border-strong);
    border-radius: 10px;
    color: var(--ink-400);
    font-size: var(--text-xs);
  }
  @media (max-width: 640px) {
    .drawer {
      padding-inline: 10px;
    }
    .drawer-copy span {
      display: none;
    }
    .drawer.open {
      height: 154px;
    }
    .drawer-card {
      width: 210px;
      min-width: 210px;
    }
  }
</style>
