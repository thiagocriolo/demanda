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
    DeliveryTemplateSubtask,
    StyledChoice,
  } from "./types";
  import "./template-modal.css";

  type DraftSubtask = DeliveryTemplateSubtask & { localId: string };

  let {
    record,
    categories,
    defaultDuration = "1",
    oncancel,
    onsave,
    ondelete,
  } = $props<{
    record?: DeliveryTemplate;
    categories: StyledChoice[];
    defaultDuration?: string;
    oncancel: () => void;
    onsave: (values: Record<string, string>) => void;
    ondelete?: () => void;
  }>();

  const initialRecord = untrack(() => record);
  let formNode: HTMLFormElement;
  let sequence = 0;
  let name = $state(initialRecord?.name ?? "");
  let category = $state(initialRecord?.category ?? "");
  let briefing = $state(initialRecord?.briefing ?? "");
  let subtasks = $state<DraftSubtask[]>(initialSubtasks());

  function normalizedDuration(value?: string): string {
    const parsed = Number(String(value ?? "").replace(",", "."));
    if (!Number.isFinite(parsed))
      return normalizedDuration(
        defaultDuration === value ? "1" : defaultDuration,
      );
    const bounded = Math.min(8, Math.max(1, Math.round(parsed * 2) / 2));
    return Number.isInteger(bounded) ? String(bounded) : bounded.toFixed(1);
  }

  function newSubtask(
    values: Partial<DeliveryTemplateSubtask> = {},
  ): DraftSubtask {
    sequence += 1;
    return {
      localId: `delivery-template-subtask-${sequence}`,
      id: values.id ?? "",
      nome: values.nome ?? "",
      duracao: normalizedDuration(values.duracao ?? defaultDuration),
      status: values.status ?? "pendente",
    };
  }

  function initialSubtasks(): DraftSubtask[] {
    const saved = initialRecord?.subtasks ?? [];
    return saved.length
      ? saved
          .slice(0, 10)
          .map((subtask: DeliveryTemplateSubtask) => newSubtask(subtask))
      : [newSubtask()];
  }

  function completed(subtask: DraftSubtask): boolean {
    return [
      "concluida",
      "concluido",
      "conclusao",
      "done",
      "completed",
    ].includes(
      subtask.status
        .normalize("NFD")
        .replace(/\p{Diacritic}/gu, "")
        .toLocaleLowerCase("pt-BR"),
    );
  }

  function addSubtask(): void {
    if (subtasks.length >= 10) return;
    const subtask = newSubtask();
    subtasks = [...subtasks, subtask];
    void tick().then(() =>
      formNode
        ?.querySelector<HTMLInputElement>(
          `[data-subtask-id="${subtask.localId}"] input[type="text"]`,
        )
        ?.focus(),
    );
  }

  function removeSubtask(localId: string): void {
    if (subtasks.length === 1) subtasks = [newSubtask()];
    else subtasks = subtasks.filter((subtask) => subtask.localId !== localId);
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

  function submit(event: SubmitEvent): void {
    event.preventDefault();
    if (!formNode.reportValidity()) return;
    const savedSubtasks: DeliveryTemplateSubtask[] = subtasks
      .filter(({ nome }) => nome.trim())
      .map((subtask) => ({
        id: subtask.id || crypto.randomUUID(),
        nome: subtask.nome.trim(),
        duracao: normalizedDuration(subtask.duracao),
        status: subtask.status || "pendente",
      }));
    onsave({
      name: name.trim(),
      category,
      briefing: briefing.trim(),
      subtasks: JSON.stringify(savedSubtasks),
      duration: String(
        savedSubtasks.reduce(
          (total, subtask) => total + Number(subtask.duracao),
          0,
        ) || "",
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
          aria-labelledby="delivery-subtasks-title"
        >
          <div class="template-modal-section-head">
            <h3 id="delivery-subtasks-title">Subtarefas</h3>
            <button
              class="template-modal-add"
              type="button"
              disabled={subtasks.length >= 10}
              onclick={addSubtask}
            >
              <Plus size={16} />{subtasks.length >= 10
                ? "Limite de 10 subtarefas"
                : "Adicionar subtarefa"}
            </button>
          </div>

          <div class="template-modal-subtasks">
            {#each subtasks as subtask (subtask.localId)}
              <div
                class="template-modal-subtask"
                data-subtask-id={subtask.localId}
              >
                <label
                  class:checked={completed(subtask)}
                  class="template-modal-check"
                  title={completed(subtask)
                    ? "Subtarefa concluída"
                    : "Subtarefa pendente"}
                >
                  <input
                    type="checkbox"
                    checked={completed(subtask)}
                    aria-label="Alternar conclusão da subtarefa"
                    onchange={(event) =>
                      (subtask.status = event.currentTarget.checked
                        ? "concluida"
                        : "pendente")}
                  />
                  <span
                    >{#if completed(subtask)}<Check size={17} />{/if}</span
                  >
                </label>

                <div class="template-modal-control">
                  <span class="template-modal-icon"><ListTodo size={16} /></span
                  >
                  <input
                    bind:value={subtask.nome}
                    type="text"
                    maxlength="120"
                    placeholder="Nome da subtarefa"
                    aria-label="Nome da subtarefa"
                  />
                </div>

                <div class="template-modal-control">
                  <span class="template-modal-icon"><Timer size={16} /></span>
                  <input
                    bind:value={subtask.duracao}
                    type="number"
                    min="1"
                    max="8"
                    step="0.5"
                    required={Boolean(subtask.nome.trim())}
                    placeholder="Duração"
                    aria-label="Duração da subtarefa em horas"
                    onchange={() =>
                      (subtask.duracao = normalizedDuration(subtask.duracao))}
                  />
                </div>

                <button
                  class="template-modal-remove"
                  type="button"
                  aria-label="Remover subtarefa"
                  onclick={() => removeSubtask(subtask.localId)}
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
                onclick={ondelete}><Trash2 size={16} />Excluir</button
              >
            </div>
          {/if}
          <div class="template-modal-action-group">
            <button
              class="template-modal-cancel"
              type="button"
              onclick={oncancel}><X size={16} />Cancelar</button
            >
            <button class="template-modal-save" type="submit"
              ><Save size={16} />{record ? "Salvar" : "Criar entrega"}</button
            >
          </div>
        </div>
      </form>
    </div>
  </div>
</div>

<svelte:window onkeydown={(event) => event.key === "Escape" && oncancel()} />
