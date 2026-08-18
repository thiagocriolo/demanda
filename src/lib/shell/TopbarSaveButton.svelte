<script lang="ts">
  import { getContext } from "svelte";
  import { Check, Save } from "@lucide/svelte";
  import {
    CONFIG_SAVE_CONTEXT,
    type ConfigSaveContext,
  } from "$lib/settings/config-save";

  const context = getContext<ConfigSaveContext>(CONFIG_SAVE_CONTEXT);
</script>

<button
  class:dirty={context.state.dirty}
  class:saved={context.state.saved}
  type="button"
  disabled={!context.state.active || context.state.saving}
  aria-label={context.state.dirty ? "Salvar alterações" : "Salvar"}
  title="Salvar alterações"
  onclick={context.save}
>
  {#if context.state.saving}
    <Save size={17} />
    <span class="label">Salvando</span>
  {:else if context.state.saved}
    <Check size={17} />
    <span class="label">Salvo</span>
  {:else}
    <Save size={17} />
    <span class="label">Salvar</span>
  {/if}
</button>

<span class="sr-only" aria-live="polite">
  {context.state.saved ? "Alterações salvas" : ""}
</span>

<style>
  button {
    display: inline-flex;
    min-width: 92px;
    height: 40px;
    align-items: center;
    justify-content: center;
    gap: 7px;
    padding: 0 14px;
    border: 1px solid var(--border-strong);
    border-radius: 10px;
    color: var(--ink-700);
    background: transparent;
    font: inherit;
    font-size: var(--text-sm);
    font-weight: 600;
    transition:
      border-color var(--motion-fast),
      color var(--motion-fast),
      background var(--motion-fast),
      box-shadow var(--motion-fast);
  }
  button:hover:not(:disabled) {
    border-color: var(--ink-400);
    color: var(--ink-800);
    background: var(--surface-soft);
  }
  button:focus-visible {
    outline: 0;
    box-shadow: var(--focus-ring);
  }
  button.dirty {
    border-color: var(--brand-600);
    color: white;
    background: var(--brand-600);
  }
  button.dirty:hover:not(:disabled) {
    border-color: var(--brand-700);
    color: white;
    background: var(--brand-700);
  }
  button:disabled {
    cursor: not-allowed;
    opacity: 0.5;
  }
  @media (max-width: 560px) {
    button {
      width: 40px;
      min-width: 40px;
      padding: 0;
    }
    .label {
      display: none;
    }
  }
</style>
