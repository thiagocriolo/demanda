<script lang="ts">
  import BrandIdentity from "./BrandIdentity.svelte";
  import SidebarToggle from "./SidebarToggle.svelte";

  let { collapsed, onToggle } = $props<{
    collapsed: boolean;
    onToggle: () => void;
  }>();
</script>

<div class:collapsed class="brand-row">
  <BrandIdentity {collapsed} />
  <SidebarToggle {collapsed} {onToggle} />
</div>

<style>
  .brand-row {
    display: flex;
    height: var(--topbar-height);
    align-items: center;
    gap: 8px;
    padding: 0 14px 0 18px;
  }
  .brand-row.collapsed {
    justify-content: center;
    padding-inline: 14px;
  }
</style>
