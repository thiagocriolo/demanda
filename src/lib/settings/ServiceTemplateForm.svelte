<script lang="ts">
  import GlobalSelector, {
    type GlobalSelectorItem,
  } from "$lib/ui/GlobalSelector.svelte";
  import IconColorPicker from "$lib/ui/IconColorPicker.svelte";
  import { colorOptions } from "$lib/ui/icon-color";
  import { portal } from "$lib/ui/portal";
  import {
    CalendarDays,
    Repeat2,
    FileBadge,
    FileText,
    ListChecks,
    Plus,
    Save,
    Tags,
    Trash2,
    X,
  } from "@lucide/svelte";
  import { onMount, tick, untrack } from "svelte";
  import type {
    DeliveryTemplate,
    ServiceTemplate,
    TemplateTask,
  } from "./types";
  import "./template-modal.css";

  let { record, deliveries, oncancel, onsave, ondelete } = $props<{
    record?: ServiceTemplate;
    deliveries: DeliveryTemplate[];
    oncancel: () => void;
    onsave: (values: Record<string, string>) => void;
    ondelete?: () => void;
  }>();

  const initialRecord = untrack(() => record);
  let formNode: HTMLFormElement;
  let name = $state(initialRecord?.name ?? "");
  let icon = $state(initialRecord?.icon ?? "briefcase-business");
  let color = $state(colorKey(initialRecord?.color));
  let briefing = $state(initialRecord?.briefing ?? "");
  let tags = $state(initialRecord?.tags ?? "");
  let duration = $state(initialRecord?.duration ?? "");
  let contractType = $state(normalizeContractType(initialRecord?.contractType));
  let amount = $state(initialRecord?.amount ?? "");
  let selectedTasks = $state<TemplateTask[]>(initialTasks());
  let deliveryItems = $derived(
    deliveries.map((delivery: DeliveryTemplate) => ({
      id: delivery.id,
      label: delivery.name,
      description: delivery.briefing || undefined,
      actionLabel:
        selectedTasks.length >= 100 ? "Limite atingido" : "Adicionar",
      actionIcon: Plus,
      actionDisabled: selectedTasks.length >= 100,
    })),
  );

  function colorKey(value?: string): string {
    if (!value) return "blue";
    const normalized = value.toLocaleLowerCase();
    return (
      colorOptions.find(
        (option) =>
          option.value === value ||
          option.color.toLocaleLowerCase() === normalized,
      )?.value ?? "blue"
    );
  }

  function normalizeContractType(value?: string): string {
    if (!value) return "Pontual";
    return value.toLocaleLowerCase().includes("recorr") ||
      value.toLocaleLowerCase().includes("rotina")
      ? "Rotina"
      : "Pontual";
  }

  function initialTasks(): TemplateTask[] {
    if (!initialRecord) return [];
    if (initialRecord.tasks.length) {
      return structuredClone(initialRecord.tasks).map((task: TemplateTask) => ({
        ...task,
        frequency: task.frequency ?? "one_off",
        recurrenceDays: task.recurrenceDays ?? [],
      }));
    }
    return deliveries
      .filter(
        (delivery: DeliveryTemplate) =>
          delivery.projectTemplateId === initialRecord.id ||
          (!delivery.projectTemplateId &&
            Boolean(initialRecord.serviceId) &&
            delivery.serviceId === initialRecord.serviceId),
      )
      .map((delivery: DeliveryTemplate) => ({
        id: crypto.randomUUID(),
        templateId: delivery.id,
        name: delivery.name,
        frequency: "one_off" as const,
        recurrenceDays: [],
      }));
  }

  function addTask(item: GlobalSelectorItem): void {
    if (selectedTasks.length >= 100) return;
    const task: TemplateTask = {
      id: crypto.randomUUID(),
      templateId: item.id,
      name: item.label,
      frequency: "one_off",
      recurrenceDays: [],
    };
    selectedTasks = [...selectedTasks, task];
    void tick().then(() =>
      formNode
        ?.querySelector<HTMLInputElement>(`[data-task-id="${task.id}"] input`)
        ?.focus(),
    );
  }

  function removeTask(id: string): void {
    selectedTasks = selectedTasks.filter((task) => task.id !== id);
  }

  function taskTemplateName(templateId: string): string {
    return (
      deliveries.find(
        (delivery: DeliveryTemplate) => delivery.id === templateId,
      )?.name ?? "Modelo indisponível"
    );
  }

  function setTaskFrequency(task: TemplateTask): void {
    if (task.frequency === "weekly") {
      task.recurrenceDays = [0];
      task.customUnit = undefined;
    } else if (task.frequency === "monthly") {
      task.recurrenceDays = [1];
      task.customUnit = undefined;
    } else if (task.frequency === "custom") {
      task.customUnit ??= "week";
      task.recurrenceDays ??= [];
    } else {
      task.customUnit = undefined;
      task.recurrenceDays = [];
    }
    selectedTasks = [...selectedTasks];
  }

  function toggleDay(task: TemplateTask, day: number): void {
    const current = task.recurrenceDays ?? [];
    task.recurrenceDays = current.includes(day)
      ? current.filter((value) => value !== day)
      : [...current, day].sort((left, right) => left - right);
    selectedTasks = [...selectedTasks];
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
    onsave({
      name: name.trim(),
      icon,
      color,
      briefing: briefing.trim(),
      tags: tags.trim(),
      duration,
      contractType,
      amount: amount.trim(),
      tasks: JSON.stringify(
        selectedTasks.map((task) => ({
          ...task,
          frequency:
            contractType === "Rotina"
              ? (task.frequency ?? "one_off")
              : "one_off",
          customUnit: task.frequency === "custom" ? task.customUnit : undefined,
          recurrenceDays:
            task.frequency === "weekly"
              ? [0]
              : task.frequency === "monthly"
                ? [1]
                : (task.recurrenceDays ?? []),
          name: task.name.trim(),
        })),
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
    aria-labelledby="service-template-title"
  >
    <header>
      <h2 id="service-template-title">
        {record ? "Editar serviço" : "Novo serviço"}
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
        <section
          class="template-modal-section"
          aria-labelledby="service-about-title"
        >
          <h3 id="service-about-title">Sobre</h3>
          <div class="template-modal-grid">
            <div class="template-modal-name-row template-modal-full">
              <div class="template-modal-control">
                <span class="template-modal-icon"><Tags size={16} /></span>
                <input
                  name="name"
                  bind:value={name}
                  maxlength="140"
                  required
                  placeholder="Título do serviço *"
                  aria-label="Título do serviço"
                />
              </div>
              <IconColorPicker
                bind:selectedIcon={icon}
                bind:selectedColor={color}
                size="field"
                iconAriaLabel="Escolher ícone do serviço"
              />
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

            <div class="template-modal-control">
              <span class="template-modal-icon"><Tags size={16} /></span>
              <input
                bind:value={tags}
                maxlength="240"
                placeholder="Tags"
                aria-label="Tags"
              />
            </div>

            <div class="template-modal-control">
              <span class="template-modal-icon"><CalendarDays size={16} /></span
              >
              <input
                bind:value={duration}
                type="number"
                min="1"
                step="1"
                placeholder="Prazo em dias"
                aria-label="Prazo em dias"
              />
            </div>
          </div>
        </section>

        <section
          class="template-modal-section"
          aria-labelledby="service-deliveries-title"
        >
          <div class="template-modal-section-head">
            <h3 id="service-deliveries-title" class="template-modal-title-icon">
              <ListChecks size={17} /><span>Tarefas</span>
            </h3>
            <span
              class="template-modal-count"
              aria-label={`${selectedTasks.length} tarefas adicionadas`}
              >{selectedTasks.length}</span
            >
          </div>
          {#if deliveryItems.length}
            <GlobalSelector
              items={deliveryItems}
              presentation="search"
              selection="action"
              label="Entregas"
              placeholder="Selecione entregas cadastradas"
              emptyMessage="Nenhuma entrega disponível."
              icon={ListChecks}
              controlIcon={ListChecks}
              onitemaction={addTask}
            />
            {#if selectedTasks.length}
              <div class="template-modal-tasks">
                {#each selectedTasks as task (task.id)}
                  <div class="template-modal-task" data-task-id={task.id}>
                    <span class="template-modal-task-icon" aria-hidden="true">
                      <ListChecks size={17} />
                    </span>
                    <label>
                      <span>{taskTemplateName(task.templateId)}</span>
                      <input
                        bind:value={task.name}
                        maxlength="140"
                        required
                        aria-label={`Nome da tarefa baseada em ${taskTemplateName(task.templateId)}`}
                      />
                    </label>
                    {#if contractType === "Rotina"}
                      <div class="routine-frequency">
                        <Repeat2 size={15} aria-hidden="true" />
                        <select
                          bind:value={task.frequency}
                          aria-label={`Frequência de ${task.name || taskTemplateName(task.templateId)}`}
                          onchange={() => setTaskFrequency(task)}
                        >
                          <option value="one_off">Pontual</option>
                          <option value="monthly">Mensal: dia 1</option>
                          <option value="weekly">Semanal: domingo</option>
                          <option value="custom">Personalizada</option>
                        </select>
                      </div>
                    {/if}
                    <button
                      class="template-modal-remove"
                      type="button"
                      aria-label={`Remover ${task.name || "tarefa"}`}
                      onclick={() => removeTask(task.id)}
                    >
                      <Trash2 size={17} />
                    </button>
                  </div>
                  {#if contractType === "Rotina" && task.frequency === "custom"}
                    <div
                      class="routine-custom"
                      aria-label="Configuração da frequência personalizada"
                    >
                      <label>
                        Repetir por
                        <select
                          bind:value={task.customUnit}
                          onchange={() => {
                            task.recurrenceDays = [];
                            selectedTasks = [...selectedTasks];
                          }}
                        >
                          <option value="week">semana</option>
                          <option value="month">mês</option>
                        </select>
                      </label>
                      <div class="routine-days">
                        {#each task.customUnit === "month" ? Array.from({ length: 31 }, (_, index) => index + 1) : [0, 1, 2, 3, 4, 5, 6] as day}
                          <button
                            type="button"
                            class:active={(task.recurrenceDays ?? []).includes(
                              day,
                            )}
                            aria-pressed={(task.recurrenceDays ?? []).includes(
                              day,
                            )}
                            onclick={() => toggleDay(task, day)}
                            >{task.customUnit === "month"
                              ? day
                              : [
                                  "Dom",
                                  "Seg",
                                  "Ter",
                                  "Qua",
                                  "Qui",
                                  "Sex",
                                  "Sáb",
                                ][day]}</button
                          >
                        {/each}
                      </div>
                    </div>
                  {/if}
                {/each}
              </div>
            {/if}
            <p class="template-modal-task-helper">
              O mesmo modelo pode ser adicionado mais de uma vez. Renomeie cada
              tarefa conforme necessário.
            </p>
          {:else}
            <p class="template-modal-empty">
              Nenhuma entrega cadastrada para selecionar.
            </p>
          {/if}
        </section>

        <section
          class="template-modal-section"
          aria-labelledby="service-contract-title"
        >
          <h3 id="service-contract-title">Contrato</h3>
          <div class="template-modal-grid">
            <div class="template-modal-control">
              <span class="template-modal-icon"><FileBadge size={16} /></span>
              <select bind:value={contractType} aria-label="Tipo de contrato">
                <option value="Pontual">Pontual</option>
                <option value="Rotina">Rotina</option>
              </select>
            </div>
            <div class="template-modal-control template-modal-control--prefix">
              <span class="template-modal-icon">R$</span>
              <input
                bind:value={amount}
                inputmode="decimal"
                maxlength="40"
                placeholder="Valor"
                aria-label="Valor"
              />
            </div>
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
              ><Save size={16} />{record ? "Salvar" : "Criar serviço"}</button
            >
          </div>
        </div>
      </form>
    </div>
  </div>
</div>

<svelte:window onkeydown={(event) => event.key === "Escape" && oncancel()} />

<style>
  .routine-frequency {
    display: flex;
    align-items: center;
    gap: 6px;
    color: var(--muted);
  }
  .routine-frequency select,
  .routine-custom select {
    min-width: 0;
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 6px;
    background: var(--surface);
    color: var(--text);
    font: inherit;
  }
  .routine-custom {
    display: grid;
    gap: 8px;
    padding: 0 0 10px 42px;
    color: var(--muted);
    font-size: var(--text-sm);
  }
  .routine-custom > label {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .routine-days {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .routine-days button {
    min-width: 36px;
    padding: 5px 7px;
    border: 1px solid var(--border);
    border-radius: 7px;
    color: var(--text);
    background: var(--surface);
    font: inherit;
    font-size: var(--text-xs);
  }
  .routine-days button.active {
    border-color: var(--primary);
    color: var(--primary);
    background: color-mix(in srgb, var(--primary) 10%, var(--surface));
  }
</style>
