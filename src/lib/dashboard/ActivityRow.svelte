<script lang="ts">
  import { ArrowRight } from "@lucide/svelte";
  import type { Activity } from "./types";
  let { activity } = $props<{ activity: Activity }>();
</script>

<div class="row">
  <span class="avatar" aria-hidden="true">{activity.initials}</span>
  <p>
    <strong>{activity.person}</strong>
    {activity.action}
    <a href="/tarefas">{activity.target}</a>
  </p>
  <time>{activity.time}</time>
  <ArrowRight size={15} aria-hidden="true" />
</div>

<style>
  .row {
    display: grid;
    grid-template-columns: 36px minmax(0, 1fr) auto 16px;
    align-items: center;
    gap: 12px;
    min-height: 62px;
    border-top: 1px solid var(--border);
  }
  .avatar {
    display: grid;
    width: 34px;
    height: 34px;
    place-items: center;
    border-radius: 10px;
    color: var(--brand-700);
    background: var(--brand-50);
    font-size: 0.65rem;
    font-weight: 700;
  }
  p {
    min-width: 0;
    overflow: hidden;
    color: var(--ink-500);
    font-size: var(--text-sm);
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  p strong {
    color: var(--ink-800);
  }
  p a {
    color: var(--brand-600);
    font-weight: 600;
  }
  time {
    color: var(--ink-400);
    font-size: var(--text-xs);
  }
  .row > :global(svg) {
    color: var(--ink-400);
  }
  @media (max-width: 620px) {
    .row {
      grid-template-columns: 36px minmax(0, 1fr);
      padding-block: 12px;
    }
    time,
    .row > :global(svg) {
      display: none;
    }
    p {
      white-space: normal;
      line-height: 1.45;
    }
  }
</style>
