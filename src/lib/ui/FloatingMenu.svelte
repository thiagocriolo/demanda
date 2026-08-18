<script lang="ts">
  import { onMount, type Component } from "svelte";
  import { ChevronDown } from "@lucide/svelte";

  export type FloatingMenuItem = {
    id: string;
    label: string;
    description?: string;
    icon?: Component;
    href?: string;
  };
  let {
    label,
    items,
    onselect,
    icon,
    placement = "start",
    tone = "brand",
    compactOnMobile = false,
    compact = false,
    fill = false,
    iconSize = 17,
  } = $props<{
    label: string;
    items: FloatingMenuItem[];
    onselect?: (item: FloatingMenuItem) => void;
    icon?: Component;
    placement?: "start" | "end" | "side";
    tone?: "brand" | "green";
    compactOnMobile?: boolean;
    compact?: boolean;
    fill?: boolean;
    iconSize?: number;
  }>();
  let open = $state(false);
  let root: HTMLDivElement;
  let TriggerIcon = $derived(icon);

  onMount(() => {
    const close = (event: PointerEvent) => {
      if (!root.contains(event.target as Node)) open = false;
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") open = false;
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", escape);
    };
  });

  function choose(item: FloatingMenuItem): void {
    onselect?.(item);
    open = false;
  }
</script>

<div
  class="root"
  class:align-end={placement === "end"}
  class:side={placement === "side"}
  class:compact-mobile={compactOnMobile}
  class:compact
  class:fill
  bind:this={root}
>
  <button
    class="trigger"
    class:green={tone === "green"}
    type="button"
    aria-haspopup="menu"
    aria-expanded={open}
    aria-label={label}
    title={compact ? label : undefined}
    onclick={() => (open = !open)}
  >
    {#if TriggerIcon}
      <span class="trigger-icon">
        <TriggerIcon size={iconSize} aria-hidden="true" />
      </span>
    {/if}
    <span class="trigger-label">{label}</span>
    <span class="trigger-chevron">
      <ChevronDown size={15} class={open ? "rotated" : ""} aria-hidden="true" />
    </span>
  </button>
  {#if open}
    <div class="bubble" role="menu">
      {#each items as item (item.id)}
        {@const ItemIcon = item.icon}
        {#if item.href}
          <a role="menuitem" href={item.href} onclick={() => choose(item)}>
            {#if ItemIcon}<span class="item-icon"
                ><ItemIcon size={17} aria-hidden="true" /></span
              >{/if}
            <span
              ><strong>{item.label}</strong>{#if item.description}<small
                  >{item.description}</small
                >{/if}</span
            >
          </a>
        {:else}
          <button type="button" role="menuitem" onclick={() => choose(item)}>
            {#if ItemIcon}<span class="item-icon"
                ><ItemIcon size={17} aria-hidden="true" /></span
              >{/if}
            <span
              ><strong>{item.label}</strong>{#if item.description}<small
                  >{item.description}</small
                >{/if}</span
            >
          </button>
        {/if}
      {/each}
    </div>
  {/if}
</div>

<style>
  .root {
    position: relative;
    display: inline-block;
  }
  .root.fill {
    display: block;
    width: 100%;
  }
  .fill .trigger {
    display: grid;
    grid-template-columns: 48px minmax(0, 1fr) 40px;
    width: 100%;
    min-height: 48px;
    gap: 0;
    padding: 0;
    text-align: left;
  }
  .fill .trigger-icon,
  .fill .trigger-chevron {
    display: grid;
    place-items: center;
  }
  .fill .trigger-label {
    font-size: var(--text-md);
    font-weight: 600;
  }
  .trigger {
    display: flex;
    min-height: 40px;
    align-items: center;
    gap: 8px;
    padding: 0 14px;
    border: 0;
    border-radius: 10px;
    color: white;
    background: var(--brand-600);
    font-size: var(--text-sm);
    font-weight: 600;
    box-shadow: 0 8px 18px rgba(46, 86, 255, 0.18);
  }
  .trigger:hover {
    background: var(--brand-700);
  }
  .trigger.green {
    background: var(--green-500);
    box-shadow: 0 8px 18px rgba(93, 172, 131, 0.2);
  }
  .trigger.green:hover {
    filter: brightness(1.06);
  }
  .trigger :global(.rotated) {
    transform: rotate(180deg);
  }
  .bubble {
    position: absolute;
    z-index: 30;
    top: calc(100% + 12px);
    left: 0;
    width: 260px;
    padding: 7px;
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    background: var(--surface);
    box-shadow: 0 16px 38px rgba(15, 23, 42, 0.18);
    animation: appear var(--motion-fast) ease-out;
  }
  .align-end .bubble {
    right: 0;
    left: auto;
  }
  .fill .bubble {
    width: 100%;
  }
  .compact .trigger {
    grid-template-columns: 48px;
    width: 48px;
    min-height: 48px;
    padding: 0;
  }
  .compact .trigger-label,
  .compact .trigger-chevron {
    display: none;
  }
  .side .bubble {
    position: fixed;
    top: calc(var(--topbar-height) + 12px);
    right: auto;
    left: calc(var(--sidebar-width) + 10px);
    width: 260px;
  }
  .compact .bubble {
    position: fixed;
    top: calc(var(--topbar-height) + 12px);
    right: auto;
    left: calc(var(--sidebar-collapsed-width) + 8px);
    width: 260px;
  }
  .side .bubble::before,
  .side .bubble::after,
  .compact .bubble::before,
  .compact .bubble::after {
    top: 16px;
    right: auto;
    left: auto;
    margin: 0;
    border-style: solid;
  }
  .side .bubble::before,
  .compact .bubble::before {
    left: -9px;
    border-width: 9px 9px 9px 0;
    border-color: transparent var(--border) transparent transparent;
  }
  .side .bubble::after,
  .compact .bubble::after {
    top: 17px;
    left: -8px;
    border-width: 8px 8px 8px 0;
    border-color: transparent var(--surface) transparent transparent;
  }
  .bubble::before,
  .bubble::after {
    position: absolute;
    left: 22px;
    width: 0;
    height: 0;
    border-style: solid;
    content: "";
  }
  .bubble::before {
    top: -9px;
    border-width: 0 9px 9px;
    border-color: transparent transparent var(--border);
  }
  .bubble::after {
    top: -8px;
    margin-left: 1px;
    border-width: 0 8px 8px;
    border-color: transparent transparent var(--surface);
  }
  .align-end .bubble::before,
  .align-end .bubble::after {
    right: 22px;
    left: auto;
  }
  .align-end .bubble::after {
    margin-right: 1px;
    margin-left: 0;
  }
  .bubble > button,
  .bubble > a {
    display: flex;
    width: 100%;
    align-items: center;
    gap: 10px;
    padding: 10px;
    border: 0;
    border-radius: 9px;
    color: var(--ink-700);
    background: transparent;
    text-align: left;
  }
  .bubble > button:hover,
  .bubble > a:hover {
    color: var(--brand-600);
    background: var(--brand-50);
  }
  .item-icon {
    display: grid;
    width: 32px;
    height: 32px;
    flex: 0 0 auto;
    place-items: center;
    border-radius: 9px;
    background: var(--surface-hover);
  }
  strong,
  small {
    display: block;
  }
  strong {
    font-size: var(--text-sm);
  }
  small {
    margin-top: 2px;
    color: var(--ink-400);
    font-size: var(--text-xs);
  }
  @keyframes appear {
    from {
      opacity: 0;
      transform: translateY(-5px) scale(0.98);
    }
  }
  @media (max-width: 560px) {
    .compact-mobile .trigger {
      width: 38px;
      min-height: 38px;
      justify-content: center;
      padding: 0;
    }
    .compact-mobile .trigger-label,
    .compact-mobile .trigger-chevron {
      display: none;
    }
    .compact-mobile .bubble {
      width: min(280px, calc(100vw - 20px));
    }
  }
</style>
