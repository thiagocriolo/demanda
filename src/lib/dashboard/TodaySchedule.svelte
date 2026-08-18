<script lang="ts">
  import { todaySchedule } from "./dashboard.mock";
  import ScheduleRow from "./ScheduleRow.svelte";
  import SectionHeader from "./SectionHeader.svelte";
</script>

<article class="panel">
  <SectionHeader title="Agenda de hoje" action="Ver agenda" />
  {#each todaySchedule as item (item.time)}<ScheduleRow {item} />{/each}
</article>

<style>
  .panel {
    min-width: 0;
    padding: 20px;
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
    background: var(--surface);
    box-shadow: var(--shadow-sm);
  }
</style>
