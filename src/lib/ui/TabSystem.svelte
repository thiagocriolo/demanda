<script lang="ts">
  import type { Snippet } from "svelte";
  import TabPanel from "./TabPanel.svelte";
  import Tabs, { type TabItem } from "./Tabs.svelte";

  let {
    items,
    value = $bindable(),
    ariaLabel = "Navegação por abas",
    idPrefix,
    class: className = "",
    tabListClass = "",
    tabClass = "",
    panelClass = "",
    minHeight = "0px",
    mobileMinHeight = minHeight,
    onchange,
    children,
  } = $props<{
    items: TabItem[];
    value: string;
    ariaLabel?: string;
    idPrefix: string;
    class?: string;
    tabListClass?: string;
    tabClass?: string;
    panelClass?: string;
    minHeight?: string;
    mobileMinHeight?: string;
    onchange?: (value: string) => void;
    children: Snippet;
  }>();

  let tabIdPrefix = $derived(`${idPrefix}-tab`);
  let panelId = $derived(`${idPrefix}-panel`);
</script>

<section class={`tab-system ${className}`.trim()} aria-label={ariaLabel}>
  <Tabs
    {items}
    bind:value
    {ariaLabel}
    class={tabListClass}
    buttonClass={tabClass}
    {tabIdPrefix}
    {panelId}
    {onchange}
  />
  <TabPanel
    id={panelId}
    labelledBy={`${tabIdPrefix}-${value}`}
    {minHeight}
    {mobileMinHeight}
    class={panelClass}
  >
    {@render children()}
  </TabPanel>
</section>
