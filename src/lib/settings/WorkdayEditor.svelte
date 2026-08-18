<script lang="ts">
  import { Plus, Trash2 } from "@lucide/svelte";
  import type { WorkShift } from "./types";
  let { shifts = $bindable() } = $props<{ shifts: WorkShift[] }>();
</script>

<div class="settings-list-head">
  <p>Defina um ou mais turnos para o expediente.</p>
  <button
    class="settings-button"
    type="button"
    onclick={() => (shifts = [...shifts, { start: "08:00", end: "18:00" }])}
  >
    <Plus size={16} />Adicionar turno
  </button>
</div>
<div class="shift-list">
  {#each shifts as shift, index}
    <div>
      <strong>Expediente {index + 1}</strong>
      <label class="settings-field"
        >Início<input
          class="settings-input"
          type="time"
          step="1800"
          bind:value={shift.start}
        /></label
      >
      <label class="settings-field"
        >Fim<input
          class="settings-input"
          type="time"
          step="1800"
          bind:value={shift.end}
        /></label
      >
      <button
        class="settings-button remove"
        type="button"
        disabled={shifts.length === 1}
        aria-label="Remover turno"
        onclick={() =>
          (shifts = shifts.filter(
            (_: WorkShift, candidate: number) => candidate !== index,
          ))}><Trash2 size={16} /></button
      >
    </div>
  {/each}
</div>

<style>
  .shift-list {
    display: grid;
    gap: 9px;
  }
  .shift-list > div {
    display: grid;
    grid-template-columns:
      minmax(120px, 1fr) minmax(120px, 0.7fr) minmax(120px, 0.7fr)
      40px;
    align-items: end;
    gap: 9px;
    padding: 12px;
    border: 1px solid var(--border);
    border-radius: 11px;
    background: var(--canvas);
  }
  strong {
    align-self: center;
    color: var(--ink-700);
    font-size: var(--text-sm);
  }
  .remove {
    width: 40px;
    min-height: 42px;
    padding: 0;
    color: var(--danger);
  }
  @media (max-width: 680px) {
    .shift-list > div {
      grid-template-columns: 1fr 1fr 40px;
    }
    strong {
      grid-column: 1 / -1;
    }
  }
</style>
