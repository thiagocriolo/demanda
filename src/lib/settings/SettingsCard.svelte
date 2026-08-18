<script lang="ts">
  import type { Snippet } from "svelte";
  let {
    title,
    description = "",
    tone = "default",
    allowOverflow = false,
    children,
  } = $props<{
    title: string;
    description?: string;
    tone?: "default" | "danger" | "muted";
    allowOverflow?: boolean;
    children: Snippet;
  }>();
</script>

<section
  class:danger={tone === "danger"}
  class:muted={tone === "muted"}
  class:allow-overflow={allowOverflow}
  class="settings-card"
>
  <header>
    <h2>{title}</h2>
    {#if description}<p>{description}</p>{/if}
  </header>
  <div class="settings-card__body">{@render children()}</div>
</section>
