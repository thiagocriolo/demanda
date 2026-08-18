<script lang="ts">
  import { page } from "$app/state";
  import {
    addDays,
    formatWeekLabel,
    isoDate,
    resolveWeekStart,
  } from "$lib/cronograma/date";
  import {
    currentSettings,
    loadSettingsFromServer,
  } from "$lib/settings/client";
  import { ChevronLeft, ChevronRight } from "@lucide/svelte";
  import { onMount } from "svelte";

  let includeSaturday = $state(true);
  let weekStart = $derived(resolveWeekStart(page.url.searchParams.get("week")));
  let previous = $derived(isoDate(addDays(weekStart, -7)));
  let next = $derived(isoDate(addDays(weekStart, 7)));
  let label = $derived(formatWeekLabel(weekStart, includeSaturday));

  onMount(() => {
    includeSaturday = currentSettings().cronogramaDays === "saturday";
    void loadSettingsFromServer()
      .then((settings) => {
        includeSaturday = settings.cronogramaDays === "saturday";
      })
      .catch(() => undefined);
  });
</script>

<nav aria-label="Navegação semanal">
  <a href={`/cronograma?week=${previous}`} aria-label="Semana anterior">
    <ChevronLeft size={18} />
  </a>
  <span title={`Semana de ${label}`}>{label}</span>
  <a href={`/cronograma?week=${next}`} aria-label="Próxima semana">
    <ChevronRight size={18} />
  </a>
</nav>

<style>
  nav {
    display: inline-flex;
    height: 38px;
    align-items: center;
    overflow: hidden;
    border: 1px solid var(--border);
    border-radius: var(--radius-pill);
    background: var(--canvas);
  }
  a {
    display: grid;
    width: 38px;
    height: 38px;
    color: var(--ink-500);
    place-items: center;
  }
  a:hover {
    color: var(--brand-600);
    background: var(--brand-50);
  }
  span {
    min-width: 112px;
    padding: 0 10px;
    color: var(--ink-800);
    font-size: var(--text-sm);
    font-weight: 600;
    text-align: center;
    white-space: nowrap;
  }
  @media (max-width: 520px) {
    span {
      min-width: 86px;
      padding-inline: 5px;
      font-size: var(--text-xs);
    }
    a {
      width: 34px;
    }
  }
</style>
