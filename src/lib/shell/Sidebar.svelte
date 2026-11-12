<script lang="ts">
  import { page } from "$app/state";
  import AddButton from "./AddButton.svelte";
  import SidebarSection from "./SidebarSection.svelte";
  import SidebarToggle from "./SidebarToggle.svelte";
  import WorkspaceSelector from "./WorkspaceSelector.svelte";
  import { getNavigation, type NavigationMode } from "./navigation";

  let { collapsed, onToggle, selectedMode, onSelectMode } = $props<{
    collapsed: boolean;
    onToggle: () => void;
    selectedMode: NavigationMode | null;
    onSelectMode: (mode: NavigationMode) => void;
  }>();

  let navigation = $derived(
    getNavigation(page.url.pathname, selectedMode ?? undefined),
  );
</script>

<aside class:collapsed aria-label="Barra lateral">
  <div class="sidebar-top">
    <SidebarToggle {collapsed} {onToggle} />
  </div>

  <div class="sidebar-menus">
    {#if navigation.mode === "workspace"}
      <div class="add-action">
        <AddButton {collapsed} />
      </div>
      <div class="workspace-action">
        <WorkspaceSelector compact={collapsed} />
      </div>
    {/if}
    <SidebarSection
      label="Menu principal"
      items={navigation.primary}
      {collapsed}
      activeMode={navigation.mode}
    />
    <div class="secondary">
      <SidebarSection
        label="Trocar de área"
        items={navigation.secondary}
        {collapsed}
        variant="secondary"
        activeMode={navigation.mode}
        {onSelectMode}
      />
    </div>
  </div>
</aside>

<style>
  aside {
    position: relative;
    z-index: 20;
    display: flex;
    min-width: 0;
    height: 100dvh;
    flex-direction: column;
    overflow: hidden;
    background: var(--panel);
  }
  .sidebar-top {
    display: flex;
    height: var(--topbar-height);
    flex: 0 0 var(--topbar-height);
    align-items: center;
    padding: 0 10px;
    border-bottom: 1px solid var(--border);
  }
  .sidebar-menus {
    display: flex;
    min-height: 0;
    flex: 1;
    flex-direction: column;
    padding: 12px 10px 10px;
    overflow-y: auto;
    scrollbar-width: thin;
  }
  .add-action {
    margin-bottom: 10px;
  }
  .workspace-action {
    margin-bottom: 10px;
  }
  .secondary {
    margin-top: auto;
    padding-top: 14px;
    border-top: 1px solid var(--border);
  }
  @media (max-width: 920px) {
    aside {
      display: none;
    }
  }
</style>
