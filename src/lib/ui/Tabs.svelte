<script lang="ts">
  import { onMount, tick } from "svelte";

  export type TabItem = {
    id: string;
    label: string;
    badge?: string | number;
  };

  let {
    items,
    value = $bindable(),
    ariaLabel = "Navegação por abas",
    class: className = "",
    buttonClass = "",
    tabIdPrefix = "tab",
    panelIdPrefix = "panel",
    panelId,
    onchange,
  } = $props<{
    items: TabItem[];
    value: string;
    ariaLabel?: string;
    class?: string;
    buttonClass?: string;
    tabIdPrefix?: string;
    panelIdPrefix?: string;
    panelId?: string;
    onchange?: (value: string) => void;
  }>();

  let container: HTMLDivElement;
  let overlapping = $state(false);
  let overlap = $state(0);
  let measureFrame = 0;

  function scheduleMeasure(): void {
    if (measureFrame) cancelAnimationFrame(measureFrame);
    measureFrame = requestAnimationFrame(measure);
  }

  $effect(() => {
    void value;
    void items.length;
    scheduleMeasure();
  });

  async function measure(): Promise<void> {
    measureFrame = 0;
    overlapping = false;
    overlap = 0;
    await tick();
    if (!container?.isConnected) return;

    const buttons = [
      ...container.querySelectorAll<HTMLButtonElement>(".tab-button"),
    ];
    if (buttons.length < 2) return;

    const style = getComputedStyle(container);
    const available =
      container.clientWidth -
      parseFloat(style.paddingLeft) -
      parseFloat(style.paddingRight);
    const widths = buttons.map(
      (button) => button.getBoundingClientRect().width,
    );
    const gap = parseFloat(style.columnGap || style.gap) || 0;
    const naturalWidth =
      widths.reduce((total, width) => total + width, 0) +
      gap * (widths.length - 1);
    if (naturalWidth <= available + 1) return;

    const activeIndex = Math.max(
      0,
      items.findIndex((item: TabItem) => item.id === value),
    );
    const activeBoundaries =
      (activeIndex > 0 ? 1 : 0) + (activeIndex < items.length - 1 ? 1 : 0);
    const overlappingBoundaries = Math.max(
      0,
      items.length - 1 - activeBoundaries,
    );
    const activeGap = 6;
    const compactWidth =
      widths.reduce((total, width) => total + width, 0) +
      activeBoundaries * activeGap;
    if (overlappingBoundaries === 0) return;

    const needed = Math.ceil(
      (compactWidth - available) / overlappingBoundaries,
    );
    const inactiveWidths = widths.filter((_, index) => index !== activeIndex);
    const limit = inactiveWidths.length
      ? Math.max(0, Math.min(...inactiveWidths) - 34)
      : 0;

    overlap = Math.min(limit, Math.max(8, needed));
    overlapping = overlap > 0;
  }

  function stack(index: number): number {
    const activeIndex = Math.max(
      0,
      items.findIndex((item: TabItem) => item.id === value),
    );
    if (index === activeIndex) return 200;
    return (
      100 - Math.abs(index - activeIndex) * 2 + (index < activeIndex ? 1 : 0)
    );
  }

  function select(id: string): void {
    value = id;
    onchange?.(id);
    scheduleMeasure();
  }

  function tabId(id: string): string {
    return `${tabIdPrefix}-${id}`;
  }

  function controlledPanelId(id: string): string {
    return panelId ?? `${panelIdPrefix}-${id}`;
  }

  function move(event: KeyboardEvent, index: number): void {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const last = items.length - 1;
    const next =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? last
          : event.key === "ArrowRight"
            ? (index + 1) % items.length
            : (index - 1 + items.length) % items.length;
    value = items[next].id;
    onchange?.(items[next].id);
    scheduleMeasure();
    requestAnimationFrame(() => {
      document.getElementById(tabId(items[next].id))?.focus();
    });
  }

  onMount(() => {
    const observer = new ResizeObserver(scheduleMeasure);
    observer.observe(container);
    document.fonts?.ready.then(scheduleMeasure).catch(() => undefined);
    scheduleMeasure();
    return () => {
      observer.disconnect();
      if (measureFrame) cancelAnimationFrame(measureFrame);
    };
  });
</script>

<div
  class:overlapping
  class={`tabs tab-list ${className}`.trim()}
  role="tablist"
  aria-label={ariaLabel}
  style={`--tab-overlap:${overlap}px`}
  bind:this={container}
>
  {#each items as item, index (item.id)}
    <button
      id={tabId(item.id)}
      type="button"
      role="tab"
      aria-selected={value === item.id}
      aria-controls={controlledPanelId(item.id)}
      tabindex={value === item.id ? 0 : -1}
      class={`tab-button ${buttonClass} ${
        value === item.id ? "tab-button--active active" : "tab-button--inactive"
      }`.trim()}
      data-state={value === item.id ? "active" : "inactive"}
      style:z-index={stack(index)}
      onclick={() => select(item.id)}
      onkeydown={(event) => move(event, index)}
    >
      {item.label}
      {#if item.badge !== undefined}<span class="tab-button__badge"
          >{item.badge}</span
        >{/if}
    </button>
  {/each}
</div>
