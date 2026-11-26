<script lang="ts">
  import { portal } from "$lib/ui/portal";
  import type {
    ServiceDeliveryRecurrenceType,
    ServiceDeliveryRecurrenceUnit,
    ServiceProjectNature,
  } from "$lib/service-packages/types";
  import {
    BadgeCheck,
    FileText,
    ListTodo,
    Plus,
    Repeat,
    Save,
    SignalHigh,
    Timer,
    Trash2,
    X,
  } from "@lucide/svelte";
  import { onMount, tick, untrack } from "svelte";
  import type { ContractScopeDeliveryDraft } from "./contract-scope-draft";

  type TaskRow = {
    localId: string;
    id?: string;
    name: string;
    durationHours: string;
  };

  let {
    delivery,
    projectName,
    projectType,
    isNew = false,
    oncancel,
    onsave,
    ondelete,
  }: {
    delivery: ContractScopeDeliveryDraft;
    projectName: string;
    projectType: ServiceProjectNature;
    isNew?: boolean;
    oncancel: () => void;
    onsave: (next: ContractScopeDeliveryDraft) => void;
    ondelete?: () => void;
  } = $props();

  let seq = 0;
  function nextTaskId(): string {
    seq += 1;
    return `scope-task-${Date.now()}-${seq}`;
  }

  function minutesToHours(minutes: number): string {
    const hours = Math.max(0.5, Math.round((minutes / 60) * 2) / 2);
    return Number.isInteger(hours) ? String(hours) : hours.toFixed(1);
  }

  function hoursToMinutes(value: string): number {
    const parsed = Number(String(value ?? "").replace(",", "."));
    if (!Number.isFinite(parsed) || parsed <= 0) return 60;
    const bounded = Math.min(168, Math.max(0.5, Math.round(parsed * 2) / 2));
    return Math.round(bounded * 60);
  }

  function normalizeHours(value: string): string {
    return minutesToHours(hoursToMinutes(value));
  }

  const initial = untrack(() => delivery);
  const initialProjectType = untrack(() => projectType);
  let formNode: HTMLFormElement | undefined;
  let name = $state(initial.name);
  let priority = $state(initial.priority || "normal");
  let description = $state(initial.description);
  let recurrenceType = $state<ServiceDeliveryRecurrenceType>(
    initialProjectType === "recurring" ? initial.recurrenceType : "one_off",
  );
  let recurrenceUnit = $state<ServiceDeliveryRecurrenceUnit | null>(
    initialProjectType === "recurring" ? initial.recurrenceUnit : null,
  );
  let recurrenceDays = $state<number[]>(
    initialProjectType === "recurring" ? [...initial.recurrenceDays] : [],
  );
  let tasks = $state<TaskRow[]>(
    initial.tasks.length
      ? initial.tasks.map((task) => ({
          localId: task.localId || nextTaskId(),
          id: task.id,
          name: task.name,
          durationHours: minutesToHours(task.durationMinutes),
        }))
      : [{ localId: nextTaskId(), name: "", durationHours: "1" }],
  );

  function setRecurrence(type: ServiceDeliveryRecurrenceType): void {
    recurrenceType = type;
    if (type === "weekly") {
      recurrenceUnit = null;
      recurrenceDays = [0];
    } else if (type === "monthly") {
      recurrenceUnit = null;
      recurrenceDays = [1];
    } else if (type === "custom") {
      recurrenceUnit ??= "week";
      if (!recurrenceDays.length) {
        recurrenceDays = [1];
      }
    } else {
      recurrenceUnit = null;
      recurrenceDays = [];
    }
  }

  function toggleDay(day: number): void {
    recurrenceDays = recurrenceDays.includes(day)
      ? recurrenceDays.filter((item) => item !== day)
      : [...recurrenceDays, day].sort((a, b) => a - b);
  }

  async function addTask(): Promise<void> {
    if (tasks.length >= 30) return;
    const item: TaskRow = {
      localId: nextTaskId(),
      name: "",
      durationHours: "1",
    };
    tasks = [...tasks, item];
    await tick();
    formNode
      ?.querySelector<HTMLInputElement>(`[data-sub-task="${item.localId}"]`)
      ?.focus();
  }

  async function onTaskKeydown(
    event: KeyboardEvent,
    task: TaskRow,
  ): Promise<void> {
    if (
      event.key !== "Enter" ||
      event.isComposing ||
      !task.name.trim() ||
      tasks.length >= 30
    ) {
      return;
    }
    event.preventDefault();
    await addTask();
  }

  function removeTask(localId: string): void {
    tasks = tasks.filter((item) => item.localId !== localId);
  }

  function submit(event: SubmitEvent): void {
    event.preventDefault();
    if (!formNode?.reportValidity()) return;
    const trimmedName = name.trim();
    if (!trimmedName) return;

    onsave({
      localId: initial.localId,
      id: initial.id,
      name: trimmedName,
      description: description.trim(),
      priority: priority || "normal",
      recurrenceType: projectType === "recurring" ? recurrenceType : "one_off",
      recurrenceUnit:
        projectType === "recurring" && recurrenceType === "custom"
          ? (recurrenceUnit ?? "week")
          : null,
      recurrenceDays: projectType === "recurring" ? [...recurrenceDays] : [],
      tasks: tasks
        .filter((task) => task.name.trim())
        .map((task) => ({
          localId: task.localId,
          id: task.id,
          name: task.name.trim(),
          durationMinutes: hoursToMinutes(task.durationHours),
        })),
    });
  }

  function handleKeydown(event: KeyboardEvent): void {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      oncancel();
    }
  }

  onMount(() => {
    void tick().then(() => {
      formNode?.querySelector<HTMLInputElement>("[data-delivery-title]")?.focus();
    });
  });
</script>

<svelte:window onkeydown={handleKeydown} />

<div
  class="backdrop"
  use:portal
  role="presentation"
  onclick={(event) => event.target === event.currentTarget && oncancel()}
>
  <div
    class="dialog"
    role="dialog"
    aria-modal="true"
    aria-labelledby="contract-delivery-modal-title"
  >
    <header>
      <div class="head-copy">
        <span class="eyebrow">{projectName}</span>
        <h2 id="contract-delivery-modal-title">
          {isNew ? "Nova entrega" : "Editar entrega"}
        </h2>
      </div>
      <button
        type="button"
        class="close"
        aria-label="Fechar"
        onclick={oncancel}
      >
        <X size={18} strokeWidth={2} />
      </button>
    </header>

    <div class="body">
      <form bind:this={formNode} onsubmit={submit}>
        <section class="form-section">
          <h3>Sobre a entrega</h3>
          <div class="fields">
            <div class="two-column-grid">
              <div class="control">
                <span class="control-icon" aria-hidden="true">
                  <BadgeCheck size={16} strokeWidth={1.8} />
                </span>
                <input
                  data-delivery-title
                  bind:value={name}
                  required
                  maxlength="140"
                  placeholder="Nome da entrega *"
                  aria-label="Nome da entrega"
                />
              </div>

              <div class="control">
                <span class="control-icon" aria-hidden="true">
                  <SignalHigh size={16} strokeWidth={1.8} />
                </span>
                <select bind:value={priority} aria-label="Prioridade da entrega">
                  <option value="baixa">Prioridade: Baixa</option>
                  <option value="normal">Prioridade: Normal</option>
                  <option value="alta">Prioridade: Alta</option>
                  <option value="urgente">Prioridade: Urgente</option>
                </select>
              </div>
            </div>

            <div class="control textarea-control">
              <span class="control-icon" aria-hidden="true">
                <FileText size={16} strokeWidth={1.8} />
              </span>
              <textarea
                bind:value={description}
                rows="3"
                maxlength="2000"
                placeholder="Descrição / briefing da entrega"
                aria-label="Descrição da entrega"
              ></textarea>
            </div>

            {#if projectType === "recurring"}
              <div class="recurrence-box">
                <span class="recurrence-title">
                  <Repeat size={14} />
                  <span>Frequência da entrega</span>
                </span>
                <div class="recurrence-chips">
                  {#each [["one_off", "Única"], ["daily", "Diária"], ["weekly", "Semanal"], ["monthly", "Mensal"], ["custom", "Personalizada"]] as [value, label]}
                    <button
                      type="button"
                      class:active={recurrenceType === value}
                      onclick={() =>
                        setRecurrence(value as ServiceDeliveryRecurrenceType)}
                    >
                      {label}
                    </button>
                  {/each}
                </div>

                {#if recurrenceType === "custom"}
                  <div class="custom-recurrence">
                    <label class="custom-unit">
                      <span>Repetir por</span>
                      <select
                        value={recurrenceUnit ?? "week"}
                        onchange={(event) => {
                          recurrenceUnit = event.currentTarget
                            .value as ServiceDeliveryRecurrenceUnit;
                          recurrenceDays = [];
                        }}
                      >
                        <option value="week">Semana</option>
                        <option value="month">Mês</option>
                      </select>
                    </label>
                    <div class="day-pills">
                      {#each recurrenceUnit === "month" ? Array.from({ length: 31 }, (_, i) => i + 1) : [0, 1, 2, 3, 4, 5, 6] as day}
                        <button
                          type="button"
                          class:active={recurrenceDays.includes(day)}
                          onclick={() => toggleDay(day)}
                        >
                          {recurrenceUnit === "month"
                            ? day
                            : ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"][
                                day
                              ]}
                        </button>
                      {/each}
                    </div>
                  </div>
                {/if}
              </div>
            {/if}
          </div>
        </section>

        <section class="form-section">
          <div class="section-head">
            <h3>Tarefas</h3>
            <button
              type="button"
              class="add-task-btn"
              disabled={tasks.length >= 30}
              onclick={() => void addTask()}
            >
              <Plus size={14} strokeWidth={2.2} />
              <span>Adicionar tarefa</span>
            </button>
          </div>

          <div class="task-list">
            {#each tasks as task (task.localId)}
              <div class="task-row">
                <div class="control task-control">
                  <span class="control-icon" aria-hidden="true">
                    <ListTodo size={15} strokeWidth={1.8} />
                  </span>
                  <input
                    data-sub-task={task.localId}
                    bind:value={task.name}
                    maxlength="120"
                    placeholder="Nome da tarefa (Enter adiciona outra)"
                    aria-label="Nome da tarefa"
                    onkeydown={(event) => void onTaskKeydown(event, task)}
                  />
                </div>

                <div class="control task-control duration-control">
                  <span class="control-icon" aria-hidden="true">
                    <Timer size={15} strokeWidth={1.8} />
                  </span>
                  <input
                    bind:value={task.durationHours}
                    type="number"
                    min="0.5"
                    max="168"
                    step="0.5"
                    aria-label="Duração em horas"
                    onchange={() =>
                      (task.durationHours = normalizeHours(task.durationHours))}
                  />
                  <span class="suffix">h</span>
                </div>

                <button
                  type="button"
                  class="remove-task-btn"
                  aria-label="Remover tarefa"
                  onclick={() => removeTask(task.localId)}
                >
                  <Trash2 size={15} />
                </button>
              </div>
            {:else}
              <p class="empty-tasks">Nenhuma tarefa definida nesta entrega.</p>
            {/each}
          </div>
        </section>

        <div class="actions">
          {#if !isNew && ondelete}
            <button type="button" class="danger" onclick={ondelete}>
              <Trash2 size={15} strokeWidth={2} />
              <span>Remover</span>
            </button>
          {/if}
          <div class="action-group-right">
            <button type="button" class="cancel" onclick={oncancel}>
              <X size={15} strokeWidth={2} />
              <span>Cancelar</span>
            </button>
            <button type="submit" class="success">
              <Save size={15} strokeWidth={2} />
              <span>Aplicar entrega</span>
            </button>
          </div>
        </div>
      </form>
    </div>
  </div>
</div>

<style>
  .backdrop {
    position: fixed;
    z-index: 3350;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 20px;
    background: rgba(15, 23, 42, 0.52);
    inset: 0;
  }

  .dialog {
    display: grid;
    grid-template-rows: auto minmax(0, 1fr);
    width: min(680px, 100%);
    max-height: min(86dvh, 840px);
    overflow: hidden;
    border: 1px solid var(--border);
    border-radius: 20px;
    background: var(--canvas);
    box-shadow: 0 26px 60px rgba(15, 23, 42, 0.28);
  }

  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 18px 22px 16px;
    border-bottom: 1px solid var(--border);
    background: var(--panel);
  }

  .head-copy {
    display: grid;
    gap: 2px;
  }

  .eyebrow {
    color: var(--brand-600);
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }

  h2,
  h3 {
    margin: 0;
    color: var(--ink-950);
    font-weight: 600;
  }

  h2 {
    font-size: var(--text-xl);
  }

  h3 {
    font-size: var(--text-lg);
  }

  .close {
    display: grid;
    width: 34px;
    height: 34px;
    border: 1px solid var(--border);
    border-radius: 10px;
    color: var(--ink-500);
    background: var(--canvas);
    place-items: center;
    cursor: pointer;
  }

  .body {
    overflow-y: auto;
    padding: 16px 18px 20px;
  }

  form {
    display: grid;
    gap: 14px;
  }

  .form-section {
    display: grid;
    gap: 12px;
    padding: 14px;
    border: 1px solid var(--border);
    border-radius: 20px;
    background: var(--panel);
  }

  .section-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
  }

  .fields {
    display: grid;
    gap: 10px;
  }

  .two-column-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px;
  }

  .control {
    display: grid;
    grid-template-columns: 18px minmax(0, 1fr);
    min-width: 0;
    min-height: 56px;
    align-items: center;
    gap: 10px;
    padding: 0 14px;
    border: 1px solid var(--border);
    border-radius: var(--radius-xl);
    background: var(--panel);
  }

  .control:focus-within {
    border-color: var(--primary);
  }

  .textarea-control {
    min-height: 104px;
    align-items: start;
    padding-block: 12px;
  }

  .textarea-control .control-icon {
    margin-top: 3px;
  }

  .duration-control {
    grid-template-columns: 18px minmax(0, 1fr) auto;
  }

  .control-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    color: var(--muted);
  }

  .suffix {
    color: var(--muted);
    font-size: var(--text-sm);
  }

  input,
  select,
  textarea {
    width: 100%;
    min-width: 0;
    border: 0;
    outline: 0;
    color: var(--text);
    background: transparent;
    font: inherit;
    font-size: var(--text-md);
    line-height: 1.45;
  }

  textarea {
    min-height: 76px;
    resize: vertical;
  }

  .recurrence-box {
    display: grid;
    gap: 8px;
    padding: 12px 14px;
    border: 1px solid color-mix(in srgb, var(--system-green) 35%, var(--border));
    border-radius: var(--radius-xl);
    background: var(--canvas);
  }

  .recurrence-title {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    color: var(--ink-700);
    font-size: 12.5px;
    font-weight: 600;
  }

  .recurrence-chips {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }

  .recurrence-chips button {
    min-height: 32px;
    padding: 0 10px;
    border: 1px solid var(--border);
    border-radius: 9px;
    color: var(--ink-700);
    background: var(--panel);
    font: inherit;
    font-size: 12.5px;
    font-weight: 600;
    cursor: pointer;
  }

  .recurrence-chips button.active {
    border-color: #2f855a;
    color: #1f6b47;
    background: rgba(93, 172, 131, 0.18);
  }

  .custom-recurrence {
    display: grid;
    gap: 8px;
    padding-top: 8px;
    border-top: 1px solid var(--border);
  }

  .custom-unit {
    display: flex;
    align-items: center;
    gap: 8px;
    color: var(--ink-700);
    font-size: 12.5px;
    font-weight: 600;
  }

  .custom-unit select {
    width: auto;
    padding: 4px 8px;
    border: 1px solid var(--border);
    border-radius: 8px;
    background: var(--panel);
  }

  .day-pills {
    display: flex;
    flex-wrap: wrap;
    gap: 5px;
  }

  .day-pills button {
    min-width: 34px;
    min-height: 30px;
    padding: 0 7px;
    border: 1px solid var(--border);
    border-radius: 7px;
    color: var(--ink-700);
    background: var(--panel);
    font: inherit;
    font-size: 11.5px;
    font-weight: 600;
    cursor: pointer;
  }

  .day-pills button.active {
    border-color: var(--primary);
    color: var(--primary);
    background: var(--brand-50);
  }

  .add-task-btn {
    display: inline-flex;
    min-height: 34px;
    align-items: center;
    gap: 5px;
    padding: 0 11px;
    border: 1px solid var(--border-strong);
    border-radius: 10px;
    color: var(--ink-800);
    background: var(--canvas);
    font: inherit;
    font-size: 12.5px;
    font-weight: 600;
    cursor: pointer;
  }

  .task-list {
    display: grid;
    gap: 8px;
  }

  .task-row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 128px 46px;
    gap: 8px;
  }

  .task-control {
    min-height: 50px;
  }

  .remove-task-btn {
    display: grid;
    min-height: 50px;
    padding: 0;
    border: 1px solid var(--border);
    border-radius: var(--radius-xl);
    color: var(--muted);
    background: var(--panel);
    place-items: center;
    cursor: pointer;
  }

  .remove-task-btn:hover {
    border-color: rgba(220, 38, 38, 0.35);
    color: var(--danger);
  }

  .empty-tasks {
    margin: 0;
    color: var(--ink-500);
    font-size: 13px;
  }

  .actions {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
  }

  .action-group-right {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-left: auto;
  }

  .actions button {
    display: inline-flex;
    min-width: 126px;
    min-height: 40px;
    align-items: center;
    justify-content: center;
    gap: 7px;
    padding: 0 14px;
    border-radius: var(--radius-md);
    color: #ffffff;
    font: inherit;
    font-size: var(--text-md);
    font-weight: 600;
    cursor: pointer;
  }

  .cancel {
    border: 1px solid var(--primary);
    background: var(--primary);
  }

  .success {
    border: 1px solid #16a34a;
    background: #16a34a;
  }

  .danger {
    border: 1px solid #dc2626;
    background: #dc2626;
  }

  @media (max-width: 600px) {
    .two-column-grid {
      grid-template-columns: minmax(0, 1fr);
    }
    .task-row {
      grid-template-columns: minmax(0, 1fr) 98px 42px;
    }
  }
</style>
