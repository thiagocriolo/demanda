<script lang="ts">
  import type { WorkloadItem } from "./types";
  let { items } = $props<{ items: WorkloadItem[] }>();
</script>

<ul>
  {#each items as item (item.label)}
    <li>
      <span
        class:blue={item.color === "blue"}
        class:green={item.color === "green"}
        class="dot"
      ></span>
      <span>{item.label}</span>
      <strong>{item.value}</strong>
    </li>
  {/each}
</ul>

<style>
  ul {
    display: grid;
    gap: 16px;
  }
  li {
    display: grid;
    grid-template-columns: 8px minmax(0, 1fr) auto;
    align-items: center;
    gap: 9px;
    color: var(--ink-500);
    font-size: var(--text-xs);
  }
  strong {
    color: var(--ink-800);
    font-size: var(--text-sm);
  }
  .dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--border-strong);
  }
  .dot.blue {
    background: var(--brand-600);
  }
  .dot.green {
    background: var(--green-500);
  }
</style>
