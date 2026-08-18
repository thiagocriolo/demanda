<script lang="ts">
  import type { Snippet } from "svelte";

  let {
    id,
    labelledBy,
    minHeight = "0px",
    mobileMinHeight = minHeight,
    class: className = "",
    children,
  } = $props<{
    id: string;
    labelledBy: string;
    minHeight?: string;
    mobileMinHeight?: string;
    class?: string;
    children: Snippet;
  }>();
</script>

<div
  class={`tab-panel ${className}`.trim()}
  {id}
  role="tabpanel"
  aria-labelledby={labelledBy}
  tabindex="0"
  style={`--tab-panel-min-height:${minHeight};--tab-panel-mobile-min-height:${mobileMinHeight}`}
>
  {@render children()}
</div>
