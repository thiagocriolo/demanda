<script lang="ts">
  import { Menu } from "@lucide/svelte";

  let { collapsed, onToggle } = $props<{
    collapsed: boolean;
    onToggle: () => void;
  }>();
</script>

<button
  class:collapsed
  type="button"
  onclick={onToggle}
  aria-label={collapsed ? "Expandir menu" : "Recolher menu"}
  title={collapsed ? "Expandir menu" : "Recolher menu"}
>
  <span class="icon"><Menu size={22} strokeWidth={1.8} /></span>
  <span class="label">Menu</span>
</button>

<style>
  button {
    display: grid;
    grid-template-columns: 48px minmax(0, 1fr);
    width: 100%;
    height: 48px;
    align-items: center;
    padding: 0;
    overflow: hidden;
    border: 0;
    border-radius: var(--radius-md);
    color: var(--text);
    background: transparent;
    text-align: left;
  }
  button:hover {
    background: var(--surface-hover);
  }
  .icon {
    display: grid;
    width: 48px;
    place-items: center;
  }
  .label {
    padding-right: 14px;
    font-size: var(--text-md);
    white-space: nowrap;
  }
  button.collapsed {
    grid-template-columns: 48px;
    width: 48px;
  }
  .collapsed .label {
    display: none;
  }
</style>
