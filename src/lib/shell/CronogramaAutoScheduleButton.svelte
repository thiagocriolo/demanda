<script lang="ts">
  import { LoaderCircle, Sparkles } from "@lucide/svelte";
  import { onMount } from "svelte";
  import {
    CRONOGRAMA_AUTO_SCHEDULE_REQUEST_EVENT,
    CRONOGRAMA_AUTO_SCHEDULE_STATE_EVENT,
    type CronogramaAutoScheduleState,
  } from "$lib/cronograma/auto-schedule-events";

  let state = $state<CronogramaAutoScheduleState>({
    ready: false,
    busy: false,
  });

  onMount(() => {
    const update = (event: Event) => {
      state = (event as CustomEvent<CronogramaAutoScheduleState>).detail;
    };
    window.addEventListener(CRONOGRAMA_AUTO_SCHEDULE_STATE_EVENT, update);
    return () =>
      window.removeEventListener(CRONOGRAMA_AUTO_SCHEDULE_STATE_EVENT, update);
  });

  function organize(): void {
    window.dispatchEvent(
      new CustomEvent(CRONOGRAMA_AUTO_SCHEDULE_REQUEST_EVENT),
    );
  }
</script>

<button
  type="button"
  disabled={!state.ready || state.busy}
  aria-label={state.busy
    ? "Reorganizando o cronograma"
    : "Reorganizar cronograma automaticamente"}
  title="Reorganizar por prazo, status, prioridade e data de solicitação"
  onclick={organize}
>
  {#if state.busy}
    <LoaderCircle class="spinner" size={17} aria-hidden="true" />
    <span>Organizando</span>
  {:else}
    <Sparkles size={17} aria-hidden="true" />
    <span>Organizar</span>
  {/if}
</button>

<style>
  button {
    display: inline-flex;
    height: 40px;
    align-items: center;
    justify-content: center;
    gap: 7px;
    padding: 0 13px;
    border: 1px solid color-mix(in srgb, var(--brand-600) 35%, var(--border));
    border-radius: 10px;
    color: var(--brand-700);
    background: color-mix(in srgb, var(--brand-600) 7%, white);
    font: inherit;
    font-size: var(--text-sm);
    font-weight: 650;
    white-space: nowrap;
    transition:
      border-color var(--motion-fast),
      color var(--motion-fast),
      background var(--motion-fast),
      box-shadow var(--motion-fast);
  }
  button:hover:not(:disabled) {
    border-color: var(--brand-600);
    color: white;
    background: var(--brand-600);
  }
  button:focus-visible {
    outline: 0;
    box-shadow: var(--focus-ring);
  }
  button:disabled {
    cursor: not-allowed;
    opacity: 0.58;
  }
  :global(.spinner) {
    animation: spin 0.85s linear infinite;
  }
  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }
  @media (max-width: 700px) {
    button {
      width: 40px;
      padding: 0;
    }
    button span {
      display: none;
    }
  }
</style>
