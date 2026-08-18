<script lang="ts">
  import { page } from "$app/state";
  import { navigationMode, type NavigationItem } from "./navigation";

  let {
    item,
    collapsed,
    variant = "primary",
  } = $props<{
    item: NavigationItem;
    collapsed: boolean;
    variant?: "primary" | "secondary";
  }>();

  let path = $derived(decodeURIComponent(page.url.pathname));
  let active = $derived(
    item.area
      ? navigationMode(path) === item.area
      : item.exact
        ? path === item.href || (item.href === "/dashboard" && path === "/")
        : path === item.href || path.startsWith(`${item.href}/`),
  );
  let ItemIcon = $derived(item.icon);
</script>

<a
  class:active
  class:collapsed
  class:secondary={variant === "secondary"}
  class="nav-item"
  href={item.href}
  aria-current={active ? "page" : undefined}
  title={collapsed ? item.label : undefined}
>
  <span class="nav-icon"><ItemIcon size={21} strokeWidth={1.8} /></span>
  <span class="nav-label">{item.label}</span>
</a>

<style>
  .nav-item {
    display: grid;
    grid-template-columns: 48px minmax(0, 1fr);
    width: 100%;
    height: 48px;
    align-items: center;
    border: 1px solid transparent;
    border-radius: var(--radius-md);
    color: var(--muted);
    transition:
      color var(--motion-fast),
      border-color var(--motion-fast),
      background var(--motion-fast);
  }
  .nav-item:hover {
    color: var(--text-soft);
    background: var(--surface-hover);
  }
  .nav-item.active {
    border-color: var(--primary);
    color: var(--primary);
    background: var(--primary-10);
  }
  .nav-item.secondary {
    color: var(--text-soft);
  }
  .nav-item.secondary:hover {
    color: var(--text);
  }
  .nav-item.secondary.active {
    border-color: transparent;
    color: #000000;
    background: var(--surface-hover);
  }
  .nav-icon {
    display: grid;
    width: 48px;
    place-items: center;
  }
  .nav-label {
    min-width: 0;
    padding-right: 14px;
    overflow: hidden;
    font-size: var(--text-md);
    font-weight: 400;
    line-height: 1.25;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .collapsed {
    grid-template-columns: 48px;
    width: 48px;
  }
  .collapsed .nav-label {
    display: none;
  }
</style>
