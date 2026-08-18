<script lang="ts">
  let { title, action } = $props<{ title: string; action?: string }>();
</script>

<header>
  <h2>{title}</h2>
  {#if action}<button type="button">{action}</button>{/if}
</header>

<style>
  header {
    display: flex;
    min-height: 26px;
    align-items: center;
    justify-content: space-between;
    gap: 18px;
    margin-bottom: 15px;
  }
  h2 {
    color: var(--ink-800);
    font-size: var(--text-md);
    letter-spacing: -0.015em;
  }
  button {
    padding: 4px 0;
    border: 0;
    color: var(--brand-600);
    background: transparent;
    font-size: var(--text-xs);
    font-weight: 650;
  }
  button:hover {
    color: var(--brand-700);
  }
</style>
