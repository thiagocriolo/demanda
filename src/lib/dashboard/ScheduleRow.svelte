<script lang="ts">
  import { CalendarDays, MoreHorizontal } from "@lucide/svelte";
  import type { ScheduleItem } from "./types";
  let { item } = $props<{ item: ScheduleItem }>();
</script>

<div class="row">
  <time>{item.time}</time>
  <span
    class:green={item.tone === "green"}
    class:violet={item.tone === "violet"}
    class="marker"
  ></span>
  <div class="copy">
    <strong>{item.title}</strong>
    <small><CalendarDays size={13} /> {item.context}</small>
  </div>
  <button type="button" aria-label={`Opções de ${item.title}`}>
    <MoreHorizontal size={18} />
  </button>
</div>

<style>
  .row {
    display: grid;
    grid-template-columns: 48px 8px minmax(0, 1fr) 28px;
    align-items: center;
    gap: 12px;
    min-height: 66px;
    border-top: 1px solid var(--border);
  }
  time {
    color: var(--ink-500);
    font-size: var(--text-xs);
    font-weight: 650;
  }
  .marker {
    width: 7px;
    height: 34px;
    border-radius: var(--radius-pill);
    background: var(--brand-500);
  }
  .marker.green {
    background: var(--green-500);
  }
  .marker.violet {
    background: var(--violet-500);
  }
  .copy {
    display: grid;
    min-width: 0;
    gap: 5px;
  }
  .copy strong {
    overflow: hidden;
    color: var(--ink-800);
    font-size: var(--text-sm);
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .copy small {
    display: flex;
    align-items: center;
    gap: 5px;
    color: var(--ink-400);
    font-size: var(--text-xs);
  }
  button {
    display: grid;
    width: 28px;
    height: 28px;
    place-items: center;
    border: 0;
    border-radius: 8px;
    color: var(--ink-400);
    background: transparent;
  }
  button:hover {
    color: var(--ink-700);
    background: var(--surface-soft);
  }
</style>
