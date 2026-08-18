<script lang="ts">
  export type SwitcherOption = { value: string; label: string };
  let {
    options,
    value = $bindable(),
    label = "Alternar visualização",
  } = $props<{ options: SwitcherOption[]; value: string; label?: string }>();
</script>

<div class="switcher" role="group" aria-label={label}>
  {#each options as option (option.value)}
    <button
      type="button"
      class:active={value === option.value}
      aria-pressed={value === option.value}
      onclick={() => (value = option.value)}>{option.label}</button
    >
  {/each}
</div>

<style>
  .switcher {
    display: inline-grid;
    grid-auto-columns: 1fr;
    grid-auto-flow: column;
    padding: 3px;
    border: 1px solid var(--border);
    border-radius: 11px;
    background: var(--surface-soft);
  }
  button {
    min-height: 34px;
    padding: 0 15px;
    border: 0;
    border-radius: 8px;
    color: var(--ink-500);
    background: transparent;
    font-size: var(--text-sm);
    font-weight: 600;
    white-space: nowrap;
  }
  button:hover {
    color: var(--ink-800);
  }
  button.active {
    color: var(--brand-600);
    background: var(--surface);
    box-shadow: 0 1px 4px rgba(15, 23, 42, 0.12);
  }
</style>
