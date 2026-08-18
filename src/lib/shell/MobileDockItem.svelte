<script lang="ts">
  import { page } from "$app/state";
  import { navigationMode, type NavigationItem } from "./navigation";

  let { item } = $props<{ item: NavigationItem }>();
  let path = $derived(decodeURIComponent(page.url.pathname));
  let active = $derived(
    item.area
      ? navigationMode(path) === item.area
      : item.exact
        ? path === item.href
        : path === item.href || path.startsWith(`${item.href}/`),
  );
  let ItemIcon = $derived(item.icon);
</script>

<a class:active href={item.href} aria-current={active ? "page" : undefined}>
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
