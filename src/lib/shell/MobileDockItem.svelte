<script lang="ts">
  import { page } from "$app/state";
  import {
    navigationMode,
    type NavigationItem,
    type NavigationMode,
  } from "./navigation";

  let { item, activeMode, onSelectMode } = $props<{
    item: NavigationItem;
    activeMode?: NavigationMode;
    onSelectMode?: (mode: NavigationMode) => void;
  }>();
  let path = $derived(decodeURIComponent(page.url.pathname));
  let active = $derived(
    item.area
      ? (activeMode ?? navigationMode(path)) === item.area
      : item.exact
        ? path === item.href
        : path === item.href || path.startsWith(`${item.href}/`),
  );
  let ItemIcon = $derived(item.icon);

  function selectArea(event: MouseEvent): void {
    if (!item.area || !onSelectMode) return;
    event.preventDefault();
    onSelectMode(item.area);
  }
</script>

<a
  class:active
  href={item.href}
  aria-current={active ? "page" : undefined}
  onclick={selectArea}
>
  <ItemIcon size={23} strokeWidth={1.8} />
  <span>{item.label}</span>
</a>

<style>
  a {
    display: grid;
    width: 64px;
    min-width: 64px;
    height: 58px;
    place-items: center;
    gap: 2px;
    padding: 6px 3px;
    border: 1px solid transparent;
    border-radius: var(--radius-md);
    color: var(--muted);
    font-size: 10px;
  }
  a.active {
    border-color: var(--primary);
    color: var(--primary);
    background: var(--primary-10);
  }
  span {
    width: 100%;
    overflow: hidden;
    text-align: center;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
</style>
