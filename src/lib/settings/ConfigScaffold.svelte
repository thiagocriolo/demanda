<script lang="ts">
  import TabSystem from "$lib/ui/TabSystem.svelte";
  import type { TabItem } from "$lib/ui/Tabs.svelte";
  import type { Snippet } from "svelte";
  import ConfigFilterBar, { type ConfigFilter } from "./ConfigFilterBar.svelte";
  import "./settings.css";

  let {
    tabs,
    activeTab = $bindable(),
    filters = [],
    activeFilter = $bindable(""),
    children,
  } = $props<{
    tabs: TabItem[];
    activeTab: string;
    filters?: ConfigFilter[];
    activeFilter?: string;
    children: Snippet;
  }>();
</script>

<TabSystem
  items={tabs}
  bind:value={activeTab}
  ariaLabel="Áreas de configuração"
  idPrefix="settings"
  class="settings-page settings-tab-system"
  tabListClass="settings-tabs"
  tabClass="settings-tab"
  panelClass="settings-page__panel settings-panel"
  minHeight="520px"
  mobileMinHeight="600px"
>
  {#if filters.length}
    <ConfigFilterBar options={filters} bind:value={activeFilter} />
  {/if}
  <div class="settings-page__content">{@render children()}</div>
</TabSystem>
