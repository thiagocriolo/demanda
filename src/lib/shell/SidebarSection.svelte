<script lang="ts">
  import type { NavigationItem, NavigationMode } from "./navigation";
  import SidebarItem from "./SidebarItem.svelte";

  let {
    label,
    items,
    collapsed,
    variant = "primary",
    activeMode,
    onSelectMode,
  } = $props<{
    label: string;
    items: NavigationItem[];
    collapsed: boolean;
    variant?: "primary" | "secondary";
    activeMode?: NavigationMode;
    onSelectMode?: (mode: NavigationMode) => void;
  }>();
</script>

<nav aria-label={label}>
  {#each items as item (item.href)}
    <SidebarItem
      {item}
      {collapsed}
      {variant}
      {activeMode}
      {onSelectMode}
    />
  {/each}
</nav>

<style>
  nav {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
</style>
