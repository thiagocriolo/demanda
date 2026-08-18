<script lang="ts">
  import RecentActivity from "./RecentActivity.svelte";
  import TodaySchedule from "./TodaySchedule.svelte";
  import WorkloadCard from "./WorkloadCard.svelte";

  let {
    period = "week",
    showTodaySchedule = true,
    showWorkload = true,
    showRecentActivity = true,
  } = $props<{
    period?: "week" | "month";
    showTodaySchedule?: boolean;
    showWorkload?: boolean;
    showRecentActivity?: boolean;
  }>();

  let primaryPanelCount = $derived(
    Number(showTodaySchedule) + Number(showWorkload),
  );
</script>

{#if primaryPanelCount > 0}
  <section
    class:single={primaryPanelCount === 1}
    class="primary-panels"
    aria-label="Resumo operacional"
  >
    {#if showTodaySchedule}<TodaySchedule />{/if}
    {#if showWorkload}<WorkloadCard {period} />{/if}
  </section>
{/if}

{#if showRecentActivity}<RecentActivity />{/if}

<style>
  .primary-panels {
    display: grid;
    grid-template-columns: minmax(0, 1.18fr) minmax(320px, 0.82fr);
    gap: 14px;
  }
  .primary-panels.single {
    grid-template-columns: minmax(0, 1fr);
  }
  @media (max-width: 1020px) {
    .primary-panels {
      grid-template-columns: minmax(0, 1fr);
    }
  }
</style>
