<script lang="ts">
  export type ConfigFilter = { value: string; label: string; note?: string };
  let { options, value = $bindable() } = $props<{
    options: ConfigFilter[];
    value: string;
  }>();
</script>

<nav class="config-filter-bar" aria-label="Subpáginas da configuração">
  <div>
    {#each options as option (option.value)}
      <button
        type="button"
        class:active={value === option.value}
        aria-pressed={value === option.value}
        title={option.note}
        onclick={() => (value = option.value)}>{option.label}</button
      >
    {/each}
  </div>
</nav>

<style>
  .config-filter-bar {
    display: flex;
    min-width: 0;
    align-items: center;
    gap: 12px;
    padding: 9px 10px;
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
    background: var(--surface);
  }
  .config-filter-bar > div {
    display: flex;
    min-width: 0;
    gap: 4px;
    overflow-x: auto;
  }
  button {
    min-height: 34px;
    padding: 0 12px;
    border: 0;
    border-radius: 9px;
    color: var(--ink-500);
    background: transparent;
    font-size: var(--text-sm);
    white-space: nowrap;
  }
  button:hover {
    background: var(--surface-soft);
  }
  button.active {
    color: var(--brand-600);
    background: var(--brand-50);
    font-weight: 600;
  }
  @media (max-width: 640px) {
    .config-filter-bar {
      align-items: stretch;
      flex-direction: column;
    }
    .config-filter-bar > div {
      width: 100%;
    }
  }
</style>
