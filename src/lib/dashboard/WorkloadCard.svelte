<script lang="ts">
  import { workload } from "./dashboard.mock";
  import ProgressRing from "./ProgressRing.svelte";
  import SectionHeader from "./SectionHeader.svelte";
  import WorkloadLegend from "./WorkloadLegend.svelte";

  let { period = "week" } = $props<{ period?: "week" | "month" }>();
  let title = $derived(period === "month" ? "Carga do mês" : "Carga da semana");
</script>

<article class="panel">
  <SectionHeader {title} action="Detalhes" />
  <div class="content">
    <ProgressRing value={71} />
    <WorkloadLegend items={workload} />
  </div>
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
  .content {
    display: grid;
    grid-template-columns: 130px minmax(0, 1fr);
    align-items: center;
    gap: 24px;
    min-height: 196px;
  }
  @media (max-width: 430px) {
    .content {
      grid-template-columns: 1fr;
      justify-items: center;
    }
    .content :global(ul) {
      width: 100%;
    }
  }
</style>
