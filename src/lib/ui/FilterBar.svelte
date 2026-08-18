<script lang="ts">
  import { Search, SlidersHorizontal, X } from "@lucide/svelte";

  export type FilterOption = { value: string; label: string; count?: number };
  let {
    options,
    selected = $bindable(),
    query = $bindable(""),
    placeholder = "Buscar...",
    showTitle = true,
  } = $props<{
    options: FilterOption[];
    selected: string;
    query?: string;
    placeholder?: string;
    showTitle?: boolean;
  }>();
</script>

<div class="filter-bar">
  {#if showTitle}
    <div class="filter-title">
      <SlidersHorizontal size={16} /><span>Filtrar</span>
    </div>
  {/if}
  <div class="options" aria-label="Opções de filtro">
    {#each options as option (option.value)}
      <button
        type="button"
        class:active={selected === option.value}
        onclick={() => (selected = option.value)}
      >
        {option.label}{#if option.count !== undefined}<small
            >{option.count}</small
          >{/if}
      </button>
    {/each}
  </div>
  <label>
    <Search size={16} aria-hidden="true" />
    <span class="sr-only">Pesquisar</span>
    <input bind:value={query} {placeholder} />
    {#if query}<button
        class="clear"
        type="button"
        aria-label="Limpar busca"
        onclick={() => (query = "")}><X size={15} /></button
      >{/if}
  </label>
</div>

<style>
  .filter-bar {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 10px;
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
    background: var(--surface);
  }
  .filter-title {
    display: flex;
    align-items: center;
    gap: 7px;
    padding-left: 4px;
    color: var(--ink-700);
    font-size: var(--text-sm);
    font-weight: 600;
  }
  .options {
    display: flex;
    min-width: 0;
    gap: 4px;
    overflow-x: auto;
  }
  .options button {
    display: flex;
    min-height: 34px;
    align-items: center;
    gap: 6px;
    padding: 0 11px;
    border: 0;
    border-radius: 9px;
    color: var(--ink-500);
    background: transparent;
    font-size: var(--text-sm);
    white-space: nowrap;
  }
  .options button:hover {
    background: var(--surface-soft);
  }
  .options button.active {
    color: var(--brand-600);
    background: var(--brand-50);
    font-weight: 600;
  }
  small {
    min-width: 18px;
    padding: 2px 5px;
    border-radius: var(--radius-pill);
    background: var(--surface-hover);
    font-size: 10px;
    text-align: center;
  }
  label {
    display: flex;
    width: min(240px, 100%);
    min-height: 36px;
    align-items: center;
    gap: 7px;
    margin-left: auto;
    padding: 0 10px;
    border: 1px solid var(--border);
    border-radius: 9px;
    color: var(--ink-400);
    background: var(--canvas);
  }
  label:focus-within {
    border-color: var(--brand-500);
    box-shadow: none;
  }
  input {
    width: 100%;
    min-width: 70px;
    border: 0;
    outline: 0;
    color: var(--ink-800);
    background: transparent;
    font-size: var(--text-sm);
  }
  input:focus-visible {
    box-shadow: none;
  }
  input::placeholder {
    color: var(--ink-400);
  }
  .clear {
    display: grid;
    padding: 2px;
    border: 0;
    border-radius: 50%;
    color: var(--ink-500);
    background: transparent;
  }
  @media (max-width: 760px) {
    .filter-bar {
      align-items: stretch;
      flex-wrap: wrap;
    }
    .filter-title {
      width: 100%;
    }
    .options {
      flex: 1 1 100%;
    }
    label {
      width: 100%;
      margin-left: 0;
    }
  }
</style>
