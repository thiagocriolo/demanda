<script lang="ts">
  import {
    Archive,
    Copy,
    EllipsisVertical,
    Eye,
    Pencil,
    Trash2,
  } from "@lucide/svelte";
  import type { EntityCardAction, EntityCardItem } from "./entity-card";

  let { item, onaction } = $props<{
    item: EntityCardItem;
    onaction: (action: EntityCardAction, item: EntityCardItem) => void;
  }>();

  let open = $state(false);
  let root: HTMLDivElement;

  const actions = [
    { id: "view", label: "Ver", icon: Eye },
    { id: "edit", label: "Editar", icon: Pencil },
    { id: "copy", label: "Copiar", icon: Copy },
    { id: "archive", label: "Arquivar", icon: Archive },
    { id: "delete", label: "Excluir", icon: Trash2 },
  ] satisfies { id: EntityCardAction; label: string; icon: typeof Eye }[];

  function toggle(event: MouseEvent): void {
    event.stopPropagation();
    open = !open;
  }

  function choose(event: MouseEvent, action: EntityCardAction): void {
    event.stopPropagation();
    open = false;
    onaction(action, item);
  }

  function handleWindowClick(event: MouseEvent): void {
    if (open && !root?.contains(event.target as Node)) open = false;
  }
</script>

<svelte:window
  onclick={handleWindowClick}
  onkeydown={(event) => event.key === "Escape" && (open = false)}
/>

<div class="entity-card-menu" class:open bind:this={root}>
  <button
    class="menu-trigger"
    type="button"
    aria-label={`Abrir menu de ${item.title}`}
    aria-haspopup="menu"
    aria-expanded={open}
    title="Mais opções"
    onpointerdown={(event) => event.stopPropagation()}
    onclick={toggle}
  >
    <EllipsisVertical size={18} strokeWidth={2} />
  </button>

  {#if open}
    <div class="menu-popover" role="menu" aria-label={`Ações de ${item.title}`}>
      {#each actions as action (action.id)}
        {@const ActionIcon = action.icon}
        <button
          class:danger={action.id === "delete"}
          type="button"
          role="menuitem"
          onpointerdown={(event) => event.stopPropagation()}
          onclick={(event) => choose(event, action.id)}
        >
          <ActionIcon size={16} strokeWidth={1.9} />
          <span>{action.label}</span>
        </button>
      {/each}
    </div>
  {/if}
</div>

<style>
  .entity-card-menu {
    position: absolute;
    z-index: 6;
    top: var(--card-menu-top, var(--card-pad));
    right: var(--card-pad);
    transform: translateY(var(--card-menu-translate-y, 0));
  }
  .menu-trigger {
    display: grid;
    padding: 0;
    border: 0;
    color: var(--wc-card-icon);
    background: transparent;
    box-shadow: none;
    line-height: 0;
    place-items: center;
  }
  .menu-trigger :global(svg) {
    display: block;
    translate: calc(50% - 3px);
  }
  .menu-popover {
    position: absolute;
    top: calc(100% + 6px);
    right: 0;
    display: grid;
    width: 158px;
    overflow: hidden;
    padding: 5px;
    border: 1px solid var(--border);
    border-radius: 12px;
    background: var(--surface);
    box-shadow: 0 16px 38px rgba(15, 23, 42, 0.18);
    animation: menu-in var(--motion-fast) ease-out;
  }
  .menu-popover button {
    display: flex;
    width: 100%;
    min-height: 34px;
    align-items: center;
    gap: 9px;
    padding: 0 9px;
    border: 0;
    border-radius: 8px;
    color: var(--ink-700);
    background: transparent;
    font: inherit;
    font-size: var(--text-sm);
    text-align: left;
  }
  .menu-popover button:hover,
  .menu-popover button:focus-visible {
    color: var(--brand-600);
    background: var(--brand-50);
    outline: 0;
  }
  .menu-popover button.danger {
    color: var(--red-500);
  }
  .menu-popover button.danger:hover,
  .menu-popover button.danger:focus-visible {
    background: rgba(220, 38, 38, 0.07);
  }
  @keyframes menu-in {
    from {
      opacity: 0;
      transform: translateY(-3px);
    }
  }
</style>
