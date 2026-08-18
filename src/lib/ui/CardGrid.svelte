<script lang="ts">
  import type { Snippet } from "svelte";
  let { children, minWidth = "220px" } = $props<{
    children: Snippet;
    minWidth?: string;
  }>();
</script>

<div class="grid" style={`--card-min:${minWidth}`}>{@render children()}</div>

<style>
  .grid {
    display: grid;
    grid-template-columns: repeat(
      auto-fit,
      minmax(min(100%, var(--card-min)), 1fr)
    );
    gap: 14px;
  }
</style>
