<script lang="ts">
  import type { NavigationItem } from "./navigation";
  import SidebarItem from "./SidebarItem.svelte";

  let {
    label,
    items,
    collapsed,
    variant = "primary",
  } = $props<{
    label: string;
    items: NavigationItem[];
    collapsed: boolean;
    variant?: "primary" | "secondary";
  }>();
</script>

<nav aria-label={label}>
  {#each items as item (item.href)}
    <SidebarItem {item} {collapsed} {variant} />
  {/each}
</nav>

<style>
  nav {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
</style>
