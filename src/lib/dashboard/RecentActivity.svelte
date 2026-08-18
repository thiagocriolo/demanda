<script lang="ts">
  import ActivityRow from "./ActivityRow.svelte";
  import { recentActivity } from "./dashboard.mock";
  import SectionHeader from "./SectionHeader.svelte";
</script>

<article class="panel">
  <SectionHeader title="Atividade recente" action="Ver histórico" />
  {#each recentActivity as activity (activity.time)}<ActivityRow
      {activity}
    />{/each}
</article>

<style>
  .panel {
    min-width: 0;
    margin-top: 14px;
    padding: 20px;
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
    background: var(--surface);
    box-shadow: var(--shadow-sm);
  }
</style>
