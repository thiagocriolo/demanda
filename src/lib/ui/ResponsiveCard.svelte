<script lang="ts">
  import type { Component, Snippet } from "svelte";

  let {
    title,
    description,
    icon,
    tone = "blue",
    meta,
    children,
  } = $props<{
    title: string;
    description?: string;
    icon?: Component;
    tone?: "blue" | "green" | "amber" | "violet";
    meta?: string;
    children?: Snippet;
  }>();
  let CardIcon = $derived(icon);
</script>

<article>
  <header>
    {#if CardIcon}<span
        class:green={tone === "green"}
        class:amber={tone === "amber"}
        class:violet={tone === "violet"}
        class="icon"><CardIcon size={19} /></span
      >{/if}
    {#if meta}<small>{meta}</small>{/if}
  </header>
  <div class="body">
    <h3>{title}</h3>
    {#if description}<p>{description}</p>{/if}
  </div>
  {#if children}<footer>{@render children()}</footer>{/if}
</article>

<style>
  article {
    display: flex;
    min-width: 0;
    min-height: 190px;
    flex-direction: column;
    padding: var(--card-padding);
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
    background: var(--surface);
    transition:
      transform var(--motion-fast),
      border-color var(--motion-fast),
      box-shadow var(--motion-fast);
  }
  article:hover {
    border-color: var(--border-strong);
    box-shadow: var(--shadow-md);
    transform: translateY(-2px);
  }
  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    min-height: 38px;
  }
  .icon {
    display: grid;
    width: 38px;
    height: 38px;
    place-items: center;
    border-radius: 11px;
    color: var(--brand-600);
    background: var(--brand-50);
  }
  .icon.green {
    color: #398261;
    background: #edf8f2;
  }
  .icon.amber {
    color: #b37208;
    background: #fff7e5;
  }
  .icon.violet {
    color: var(--violet-500);
    background: #f2efff;
  }
  small {
    color: var(--ink-400);
    font-size: var(--text-xs);
  }
  .body {
    margin-top: 18px;
  }
  h3 {
    color: var(--ink-950);
    font-size: var(--text-lg);
    line-height: 1.25;
  }
  p {
    margin-top: 7px;
    color: var(--ink-500);
    font-size: var(--text-sm);
    line-height: 1.5;
  }
  footer {
    margin-top: auto;
    padding-top: 18px;
  }
</style>
