<script lang="ts">
  import {
    BadgeCheck,
    Check,
    FileText,
    Layers,
    ListTodo,
    Plus,
    Save,
    Timer,
    Trash2,
    X,
  } from "@lucide/svelte";
  import { portal } from "$lib/ui/portal";
  import { onMount, tick, untrack } from "svelte";
  import type {
    DeliveryTemplate,
    DeliveryTemplateTask,
    StyledChoice,
  } from "./types";
  import "./template-modal.css";

  type DraftTask = DeliveryTemplateTask & { localId: string };

  let {
    record,
    categories,
    defaultDuration = "1",
    saving = false,
    errorMessage = "",
    oncancel,
    onsave,
    ondelete,
  } = $props<{
    record?: DeliveryTemplate;
    errorMessage?: string;
    categories: StyledChoice[];
    defaultDuration?: string;
    oncancel: () => void;
    onsave: (values: Record<string, string>) => void | Promise<void>;
    ondelete?: () => void;
    saving?: boolean;
  }>();

  const initialRecord = untrack(() => record);
  let formNode: HTMLFormElement;
  let sequence = 0;
  let name = $state(initialRecord?.name ?? "");
  let category = $state(initialRecord?.category ?? "");
  let briefing = $state(initialRecord?.briefing ?? "");
  let tasks = $state<DraftTask[]>(initialTasks());

  function normalizedDuration(value?: string): string {
    const parsed = Number(String(value ?? "").replace(",", "."));
    if (!Number.isFinite(parsed))
      return normalizedDuration(
        defaultDuration === value ? "1" : defaultDuration,
      );
    const bounded = Math.min(168, Math.max(0.5, Math.round(parsed * 2) / 2));
    return Number.isInteger(bounded) ? String(bounded) : bounded.toFixed(1);
  }

  function newTask(values: Partial<DeliveryTemplateTask> = {}): DraftTask {
    sequence += 1;
    return {
      localId: `delivery-template-task-${sequence}`,
      id: values.id ?? "",
      nome: values.nome ?? "",
      duracao: normalizedDuration(values.duracao ?? defaultDuration),
      status: values.status ?? "pendente",
    };
  }

  function initialTasks(): DraftTask[] {
    const saved = initialRecord?.tasks ?? [];
    return saved.length
      ? saved.map((task: DeliveryTemplateTask) => newTask(task))
      : [newTask()];
  }

  function completed(task: DraftTask): boolean {
    return [
      "concluida",
      "concluido",
      "conclusao",
      "done",
      "completed",
    ].includes(
      task.status
        .normalize("NFD")
        .replace(/\p{Diacritic}/gu, "")
        .toLocaleLowerCase("pt-BR"),
    );
  }

  async function addTask(): Promise<void> {
    if (tasks.length >= 30) return;
    const task = newTask();
    tasks = [...tasks, task];
    await tick();
    formNode
      ?.querySelector<HTMLInputElement>(
        `[data-task-id="${task.localId}"] input[type="text"]`,
      )
      ?.focus();
  }

  async function addTaskOnEnter(
    event: KeyboardEvent,
    task: DraftTask,
  ): Promise<void> {
    if (
      event.key !== "Enter" ||
      event.isComposing ||
      !task.nome.trim() ||
      tasks.length >= 30
    )
      return;

    event.preventDefault();
    await addTask();
  }

  function removeTask(localId: string): void {
    if (tasks.length === 1) tasks = [newTask()];
    else tasks = tasks.filter((task) => task.localId !== localId);
  }

  onMount(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    void tick().then(() =>
      formNode?.querySelector<HTMLInputElement>('input[name="name"]')?.focus(),
    );
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  });

  async function submit(event: SubmitEvent): Promise<void> {
    event.preventDefault();
    if (saving || !formNode.reportValidity()) return;
    const savedTasks: DeliveryTemplateTask[] = tasks
      .filter(({ nome }) => nome.trim())
      .map((task) => ({
        id: task.id || crypto.randomUUID(),
        nome: task.nome.trim(),
        duracao: normalizedDuration(task.duracao),
        status: task.status || "pendente",
      }));
    await onsave({
      name: name.trim(),
      category,
      briefing: briefing.trim(),
      tasks: JSON.stringify(savedTasks),
      duration: String(
        savedTasks.reduce((total, task) => total + Number(task.duracao), 0) ||
          "",
      ),
    });
  }
</script>

<div
  class="template-modal-backdrop"
  use:portal
  role="presentation"
  onclick={(event) => event.target === event.currentTarget && oncancel()}
>
  <div
    class="template-modal"
    role="dialog"
    aria-modal="true"
    aria-labelledby="delivery-template-title"
  >
    <header>
      <h2 id="delivery-template-title">
        {record ? "Editar entrega" : "Nova entrega"}
      </h2>
      <button
        class="template-modal-close"
        type="button"
        aria-label="Fechar"
        onclick={oncancel}><X size={18} /></button
      >
    </header>

    {#if errorMessage}<p role="alert">{errorMessage}</p>{/if}
    <div class="template-modal-body">
      <form class="template-modal-form" bind:this={formNode} onsubmit={submit}>
        <section class="template-modal-section">
          <div class="template-modal-grid">
            <div class="template-modal-control">
              <span class="template-modal-icon"><BadgeCheck size={16} /></span>
              <input
                name="name"
                bind:value={name}
                maxlength="140"
                required
                placeholder="Nome da tarefa *"
                aria-label="Nome da tarefa"
              />
            </div>

            <div class="template-modal-control">
              <span class="template-modal-icon"><Layers size={16} /></span>
              <select bind:value={category} aria-label="Categoria">
                <option value="">Categoria</option>
                {#each categories as item (item.key)}
                  <option value={item.key}>{item.label}</option>
                {/each}
              </select>
            </div>

            <div
              class="template-modal-control template-modal-control--textarea template-modal-full"
            >
              <span class="template-modal-icon"><FileText size={16} /></span>
              <textarea
                bind:value={briefing}
                rows="5"
                maxlength="1600"
                placeholder="Briefing"
                aria-label="Briefing"></textarea>
            </div>
          </div>
        </section>

        <section
          class="template-modal-section"
          aria-labelledby="delivery-tasks-title"
        >
          <div class="template-modal-section-head">
            <h3 id="delivery-tasks-title">Tarefas</h3>
            <button
              class="template-modal-add"
              type="button"
              disabled={tasks.length >= 30}
              onclick={addTask}
            >
              <Plus size={16} />{tasks.length >= 30
                ? "Limite de 30 tarefas"
                : "Adicionar tarefa"}
            </button>
          </div>

          <div class="template-modal-tasks">
            {#each tasks as task (task.localId)}
              <div class="template-modal-task" data-task-id={task.localId}>
                <label
                  class:checked={completed(task)}
                  class="template-modal-check"
                  title={completed(task)
                    ? "Tarefa concluída"
                    : "Tarefa pendente"}
                >
                  <input
                    type="checkbox"
                    checked={completed(task)}
                    aria-label="Alternar conclusão da tarefa"
                    onchange={(event) =>
                      (task.status = event.currentTarget.checked
                        ? "concluida"
                        : "pendente")}
                  />
                  <span
                    >{#if completed(task)}<Check size={17} />{/if}</span
                  >
                </label>

                <div class="template-modal-control">
                  <span class="template-modal-icon"><ListTodo size={16} /></span
                  >
                  <input
                    bind:value={task.nome}
                    type="text"
                    maxlength="120"
                    placeholder="Nome da tarefa"
                    aria-label="Nome da tarefa"
                    onkeydown={(event) => addTaskOnEnter(event, task)}
                  />
                </div>

                <div class="template-modal-control">
                  <span class="template-modal-icon"><Timer size={16} /></span>
                  <input
                    bind:value={task.duracao}
                    type="number"
                    min="0.5"
                    max="168"
                    step="0.5"
                    required={Boolean(task.nome.trim())}
                    placeholder="Duração"
                    aria-label="Duração da tarefa em horas"
                    onchange={() =>
                      (task.duracao = normalizedDuration(task.duracao))}
                  />
                </div>

                <button
                  class="template-modal-remove"
                  type="button"
                  aria-label="Remover tarefa"
                  onclick={() => removeTask(task.localId)}
                  ><Trash2 size={17} /></button
                >
              </div>
            {/each}
          </div>
        </section>

        <div class="template-modal-actions">
          {#if record && ondelete}
            <div class="template-modal-action-group">
              <button
                class="template-modal-delete"
                type="button"
                disabled={saving}
                onclick={ondelete}><Trash2 size={16} />Excluir</button
              >
            </div>
          {/if}
          <div class="template-modal-action-group">
            <button
              class="template-modal-cancel"
              type="button"
              disabled={saving}
              onclick={oncancel}><X size={16} />Cancelar</button
            >
            <button class="template-modal-save" type="submit" disabled={saving}
              ><Save size={16} />{record ? "Salvar" : "Criar entrega"}</button
            >
          </div>
        </div>
      </form>
    </div>
  </div>
</div>

<svelte:window onkeydown={(event) => event.key === "Escape" && oncancel()} />
