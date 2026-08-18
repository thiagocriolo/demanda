<script lang="ts">
  import { metrics } from "./dashboard.mock";
  import MetricCard from "./MetricCard.svelte";
</script>

<section aria-label="Indicadores principais">
  {#each metrics as metric (metric.label)}
    <MetricCard {metric} />
  {/each}
</section>

<style>
  section {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 14px;
    margin-bottom: 14px;
  }
  @media (max-width: 1120px) {
    section {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }
  @media (max-width: 520px) {
    section {
      grid-template-columns: minmax(0, 1fr);
    }
  }
</style>
