<script lang="ts">
  import { Plus, Trash2 } from "@lucide/svelte";
  import type { Choice } from "./types";
  let {
    items = $bindable(),
    fixed = false,
    max = 100,
    placeholder = "Rótulo",
  } = $props<{
    items: Choice[];
    fixed?: boolean;
    max?: number;
    placeholder?: string;
  }>();

  function addItem(): void {
    if (fixed || items.length >= max) return;
    items = [...items, { key: `item-${Date.now()}`, label: "" }];
  }
</script>

<div class="settings-list-head">
  <p>{items.length}{fixed ? " itens fixos" : ` de ${max} itens`}</p>
  {#if !fixed}
    <button class="settings-button" type="button" onclick={addItem}>
      <Plus size={16} />Adicionar
    </button>
  {/if}
</div>
<div class="plain-list">
  {#each items as item, index (item.key)}
    <div>
      <span>{index + 1}</span>
      <input
        class="settings-input"
        {placeholder}
        maxlength="80"
        bind:value={item.label}
      />
      {#if !fixed}
        <button
          class="settings-button remove"
          type="button"
          aria-label="Excluir item"
          onclick={() =>
            (items = items.filter(
              (_: Choice, candidate: number) => candidate !== index,
            ))}><Trash2 size={16} /></button
        >
      {/if}
    </div>
  {/each}
</div>

<style>
  .plain-list {
    display: grid;
    gap: 8px;
  }
  .plain-list > div {
    display: grid;
    grid-template-columns: 30px minmax(0, 1fr) 40px;
    gap: 9px;
    align-items: center;
  }
  .plain-list span {
    display: grid;
    width: 30px;
    height: 30px;
    place-items: center;
    border-radius: 8px;
    color: var(--ink-500);
    background: var(--surface-hover);
    font-size: var(--text-xs);
    font-weight: 700;
  }
  .remove {
    width: 40px;
    min-height: 40px;
    padding: 0;
    color: var(--danger);
  }
</style>
