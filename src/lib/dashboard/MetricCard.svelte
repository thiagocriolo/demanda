<script lang="ts">
  import { ArrowUpRight } from "@lucide/svelte";
  import type { Metric } from "./types";

  let { metric } = $props<{ metric: Metric }>();
  let MetricIcon = $derived(metric.icon);
</script>

<article class={metric.tone}>
  <div class="card-top">
    <span class="icon-box">
      <MetricIcon size={20} strokeWidth={2} />
    </span>
    <ArrowUpRight class="arrow" size={17} aria-hidden="true" />
  </div>

  <strong>{metric.value}</strong>
  <p>{metric.label}</p>
  <small>{metric.detail}</small>
</article>

<style>
  article {
    min-width: 0;
    padding: 18px;
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
    background: var(--surface);
    box-shadow: var(--shadow-sm);
  }
  .card-top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 20px;
  }
  .icon-box {
    display: grid;
    width: 38px;
    height: 38px;
    place-items: center;
    border-radius: 11px;
  }
  .arrow {
    color: var(--ink-400);
  }
  strong {
    display: block;
    color: var(--ink-950);
    font-size: 1.65rem;
    line-height: 1;
    letter-spacing: -0.04em;
  }
  p {
    margin-top: 7px;
    color: var(--ink-700);
    font-size: var(--text-sm);
    font-weight: 600;
  }
  small {
    display: block;
    margin-top: 6px;
    color: var(--ink-400);
    font-size: var(--text-xs);
  }
  .blue .icon-box {
    color: var(--brand-600);
    background: var(--brand-50);
  }
  .green .icon-box {
    color: #398261;
    background: #edf8f2;
  }
  .amber .icon-box {
    color: #b37208;
    background: #fff7e5;
  }
  .violet .icon-box {
    color: var(--violet-500);
    background: #f2efff;
  }
</style>
