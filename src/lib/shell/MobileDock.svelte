<script lang="ts">
  import { page } from "$app/state";
  import MobileDockItem from "./MobileDockItem.svelte";
  import { getNavigation } from "./navigation";

  let navigation = $derived(getNavigation(page.url.pathname));
  let items = $derived(navigation.secondary);
</script>

<nav aria-label="Navegação móvel">
  {#each items as item (item.href)}
    <MobileDockItem {item} />
  {/each}
</nav>

<style>
  nav {
    position: fixed;
    z-index: 50;
    right: 0;
    bottom: 0;
    left: 0;
    display: none;
    height: calc(74px + env(safe-area-inset-bottom));
    align-items: center;
    justify-content: space-around;
    gap: 4px;
    padding: 8px 12px calc(8px + env(safe-area-inset-bottom));
    border-top: 1px solid var(--border);
    background: var(--panel);
    box-shadow: 0 -10px 24px rgba(15, 23, 42, 0.08);
  }
  @media (max-width: 920px) {
    nav {
      display: flex;
    }
  }
</style>
