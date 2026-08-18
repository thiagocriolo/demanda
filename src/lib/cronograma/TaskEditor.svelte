<script lang="ts">
  import {
    MAX_DURATION_SLOTS,
    MIN_DURATION_SLOTS,
    formatDuration,
    minutesToTime,
    timeToMinutes,
  } from "./date";
  import type { ScheduleEntry, ScheduleTask } from "./types";
  import {
    AlertTriangle,
    CalendarClock,
    CalendarX2,
    Clock3,
    X,
  } from "@lucide/svelte";
  import { onMount } from "svelte";

  let {
    task,
    schedule,
    defaultDate,
    defaultDurationSlots,
    onclose,
    onsave,
    onunschedule,
  } = $props<{
    task: ScheduleTask;
    schedule?: ScheduleEntry;
    defaultDate: string;
    defaultDurationSlots: number;
    onclose: () => void;
    onsave: (entry: ScheduleEntry) => string | undefined;
    onunschedule: () => void;
  }>();

  function initialDate(): string {
    return schedule?.date ?? defaultDate;
  }

  function initialStartTime(): string {
    return minutesToTime(schedule?.startMinutes ?? 9 * 60);
  }

  function initialDuration(): number {
    return (schedule?.durationSlots ?? defaultDurationSlots) / 2;
  }

  let date = $state(initialDate());
  let startTime = $state(initialStartTime());
  let durationHours = $state(initialDuration());
  let scheduleError = $state("");
  let dialog: HTMLDivElement;

  onMount(() => {
    dialog.querySelector<HTMLInputElement>("input")?.focus();
    const handleKeydown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onclose();
    };
    window.addEventListener("keydown", handleKeydown);
    return () => window.removeEventListener("keydown", handleKeydown);
  });

  function submit(event: SubmitEvent): void {
    event.preventDefault();
    const minutes = timeToMinutes(startTime);
    if (!date || minutes === null) return;
    const durationSlots = Math.max(
      MIN_DURATION_SLOTS,
      Math.min(MAX_DURATION_SLOTS, Math.round(durationHours * 2)),
    );
    scheduleError =
      onsave({
        date,
        startMinutes: Math.max(
          0,
          Math.min(24 * 60 - durationSlots * 30, Math.round(minutes / 30) * 30),
        ),
        durationSlots,
      }) ?? "";
  }
</script>

<div
  class="backdrop"
  role="presentation"
  onclick={(event) => event.target === event.currentTarget && onclose()}
>
  <div
    class="dialog"
    role="dialog"
    aria-modal="true"
    aria-labelledby="schedule-title"
    bind:this={dialog}
  >
    <header>
      <span class="dialog-icon"><CalendarClock size={21} /></span>
      <div>
        <small>Programação da tarefa</small>
        <h2 id="schedule-title">{task.nome}</h2>
      </div>
      <button
        class="icon-button"
        type="button"
        aria-label="Fechar"
        onclick={onclose}
      >
        <X size={19} />
      </button>
    </header>

    <p class="context">
      {task.projeto}{task.responsavel ? ` · ${task.responsavel}` : ""}
    </p>

    <form onsubmit={submit}>
      <label>
        <span>Data</span>
        <input required type="date" bind:value={date} />
      </label>

      <div class="field-row">
        <label>
          <span>Horário inicial</span>
          <input required type="time" step="1800" bind:value={startTime} />
        </label>
        <label>
          <span>Duração</span>
          <select bind:value={durationHours}>
            {#each Array.from({ length: 16 }, (_, index) => 0.5 + index * 0.5) as hours}
              <option value={hours}>{formatDuration(hours * 2)}</option>
            {/each}
          </select>
        </label>
      </div>

      <p class="hint">
        <Clock3 size={14} />Os cartões encaixam em intervalos de 30 minutos.
      </p>

      {#if scheduleError}
        <p class="schedule-error" role="alert" data-schedule-conflict>
          <AlertTriangle size={15} />{scheduleError}
        </p>
      {/if}

      <footer>
        {#if schedule}
          <button class="unschedule" type="button" onclick={onunschedule}>
            <CalendarX2 size={17} />Remover horário
          </button>
        {/if}
        <span class="spacer"></span>
        <button class="secondary" type="button" onclick={onclose}
          >Cancelar</button
        >
        <button class="primary" type="submit">Salvar programação</button>
      </footer>
    </form>
  </div>
</div>

<style>
  .backdrop {
    position: fixed;
    z-index: 100;
    inset: 0;
    display: grid;
    padding: 18px;
    background: rgba(15, 23, 42, 0.46);
    backdrop-filter: blur(3px);
    place-items: center;
  }
  .dialog {
    width: min(540px, 100%);
    max-height: calc(100dvh - 36px);
    overflow-y: auto;
    border: 1px solid var(--border);
    border-radius: var(--radius-xl);
    background: var(--panel);
    box-shadow: var(--shadow-md);
  }
  header {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: center;
    gap: 12px;
    padding: 18px 20px;
    border-bottom: 1px solid var(--border);
  }
  .dialog-icon {
    display: grid;
    width: 42px;
    height: 42px;
    border-radius: 11px;
    color: var(--brand-600);
    background: var(--brand-50);
    place-items: center;
  }
  small,
  h2 {
    display: block;
  }
  small {
    color: var(--ink-400);
    font-size: var(--text-xs);
    font-weight: 600;
    text-transform: uppercase;
  }
  h2 {
    margin-top: 2px;
    font-size: var(--text-lg);
    line-height: 1.25;
  }
  .icon-button {
    display: grid;
    width: 36px;
    height: 36px;
    padding: 0;
    border: 0;
    border-radius: 10px;
    color: var(--ink-500);
    background: transparent;
    place-items: center;
  }
  .icon-button:hover {
    background: var(--surface-hover);
  }
  .context {
    padding: 14px 20px 0;
    overflow: hidden;
    color: var(--ink-500);
    font-size: var(--text-sm);
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  form {
    display: grid;
    gap: 14px;
    padding: 18px 20px 20px;
  }
  label {
    display: grid;
    gap: 6px;
  }
  label > span {
    color: var(--ink-700);
    font-size: var(--text-sm);
    font-weight: 600;
  }
  input,
  select {
    width: 100%;
    height: 42px;
    padding: 0 11px;
    border: 1px solid var(--border);
    border-radius: 9px;
    outline: 0;
    color: var(--ink-800);
    background: var(--canvas);
  }
  input:focus,
  select:focus {
    border-color: var(--brand-500);
    box-shadow: none;
  }
  .field-row {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
  }
  .hint {
    display: flex;
    align-items: center;
    gap: 6px;
    color: var(--ink-400);
    font-size: var(--text-xs);
  }
  .schedule-error {
    display: flex;
    align-items: flex-start;
    gap: 7px;
    padding: 9px 10px;
    border: 1px solid rgba(220, 38, 38, 0.22);
    border-radius: 8px;
    color: #991b1b;
    background: rgba(254, 242, 242, 0.82);
    font-size: var(--text-sm);
    line-height: 1.35;
  }
  .schedule-error :global(svg) {
    margin-top: 1px;
  }
  footer {
    display: flex;
    align-items: center;
    gap: 9px;
    padding-top: 4px;
  }
  footer button {
    display: inline-flex;
    min-height: 40px;
    align-items: center;
    justify-content: center;
    gap: 7px;
    padding: 0 13px;
    border-radius: 9px;
    font-weight: 600;
  }
  .spacer {
    flex: 1;
  }
  .unschedule {
    border: 1px solid rgba(220, 38, 38, 0.2);
    color: var(--danger);
    background: rgba(220, 38, 38, 0.06);
  }
  .secondary {
    border: 1px solid var(--border);
    color: var(--ink-700);
    background: var(--panel);
  }
  .primary {
    border: 1px solid var(--brand-600);
    color: #ffffff;
    background: var(--brand-600);
  }
  @media (max-width: 560px) {
    .field-row {
      grid-template-columns: 1fr;
    }
    footer {
      align-items: stretch;
      flex-direction: column;
    }
    .spacer {
      display: none;
    }
    footer button {
      width: 100%;
    }
  }
</style>
