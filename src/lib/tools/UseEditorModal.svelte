<script lang="ts">
  import { Save, X } from "@lucide/svelte";
  import { untrack } from "svelte";
  import type { Task } from "$lib/tasks/types";
  import { createToolUse, ToolApiError, updateToolUse } from "./client";
  import { findToolResource } from "./catalog";
  import ToolUseContentFields from "./editors/ToolUseContentFields.svelte";
  import {
    emptyToolUseContent,
    type ToolModel,
    type ToolUse,
    type ToolUseContent,
    type ToolUseStatus,
  } from "./types";

  let {
    models,
    tasks,
    initialModel,
    initialTaskId = null,
    use,
    onclose,
    onsaved,
  } = $props<{
    models: ToolModel[];
    tasks: Task[];
    initialModel?: ToolModel;
    initialTaskId?: string | null;
    use?: ToolUse;
    onclose: () => void;
    onsaved: (use: ToolUse) => void;
  }>();

  const seed = untrack(() => ({ models, use, initialModel, initialTaskId }));
  const availableModels: ToolModel[] = seed.models.filter(
    ({ id, archivedAt }: ToolModel) => !archivedAt || id === seed.use?.modelId,
  );
  let modelId = $state(
    seed.use?.modelId ?? seed.initialModel?.id ?? availableModels[0]?.id ?? "",
  );
  let name = $state(seed.use?.name ?? "");
  let taskId = $state<string | null>(seed.use?.taskId ?? seed.initialTaskId);
  let content = $state<ToolUseContent>(
    seed.use
      ? structuredClone(seed.use.content)
      : emptyToolUseContent(
          seed.initialModel?.toolKey ?? availableModels[0]?.toolKey ?? "form",
        ),
  );
  let status = $state<ToolUseStatus>(seed.use?.status ?? "open");
  let pending = $state(false);
  let formError = $state("");
  let selectedModel = $derived(
    models.find(({ id }: ToolModel) => id === modelId),
  );
  let resource = $derived(
    selectedModel ? findToolResource(selectedModel.toolKey) : null,
  );
  let availableTasks = $derived(
    selectedModel
      ? tasks.filter(
          (task: Task) =>
            task.workspaceId === selectedModel?.workspaceId && !task.archivedAt,
        )
      : [],
  );

  function selectModel(nextId: string): void {
    if (use) return;
    modelId = nextId;
    const model = models.find(({ id }: ToolModel) => id === nextId);
    if (!model) return;
    content = emptyToolUseContent(model.toolKey);
    taskId = tasks.some(
      ({ id, workspaceId }: Task) =>
        id === taskId && workspaceId === model.workspaceId,
    )
      ? taskId
      : null;
    if (!name.trim()) name = model.name;
  }

  function selectTask(nextId: string): void {
    taskId = nextId || null;
    if (use || !selectedModel || name.trim() !== selectedModel.name) return;
    const task = tasks.find(({ id }: Task) => id === nextId);
    if (task)
      name = `${selectedModel.name} — ${task.project.name}`.slice(0, 140);
  }

  async function save(event: SubmitEvent): Promise<void> {
    event.preventDefault();
    if (pending || !selectedModel) return;
    if (!name.trim()) {
      formError = "Dê um nome para identificar este Uso.";
      return;
    }
    pending = true;
    formError = "";
    try {
      const saved = use
        ? await updateToolUse(use.id, {
            name: name.trim(),
            taskId,
            content,
            status,
            version: use.version,
          })
        : await createToolUse({
            workspaceId: selectedModel.workspaceId,
            modelId: selectedModel.id,
            name: name.trim(),
            taskId,
            content,
            status: status === "draft" ? "draft" : "open",
          });
      onsaved(saved);
    } catch (cause) {
      formError =
        cause instanceof ToolApiError
          ? cause.message
          : "Não foi possível salvar o Uso.";
    } finally {
      pending = false;
    }
  }
</script>

<div
  class="tool-modal-backdrop"
  role="presentation"
  onclick={(event) => event.target === event.currentTarget && onclose()}
>
  <div
    class="tool-modal tool-modal--wide"
    role="dialog"
    aria-modal="true"
    aria-labelledby="tool-use-title"
  >
    <header class="tool-modal__header">
      <div>
        <span>{use ? "Editar uso" : "Novo uso"}</span>
        <h2 id="tool-use-title">
          {use ? use.name : "Inicie uma atividade concreta"}
        </h2>
      </div>
      <button
        class="tool-icon-button"
        type="button"
        aria-label="Fechar"
        onclick={onclose}><X size={19} /></button
      >
    </header>
    <form class="tool-modal__form" onsubmit={save}>
      <div class="tool-modal__body">
        {#if availableModels.length === 0}
          <div class="tool-mini-empty">
            <strong>Nenhum Modelo disponível</strong><span
              >Crie um Modelo antes de iniciar um Uso.</span
            >
          </div>
        {:else}
          <div class="tool-step-label">
            <span>1</span>
            <div>
              <strong>Modelo</strong><small
                >A configuração será preservada neste Uso</small
              >
            </div>
          </div>
          <label class="tool-field"
            ><span>Modelo reutilizável</span><select
              value={modelId}
              disabled={Boolean(use)}
              required
              onchange={(event) => selectModel(event.currentTarget.value)}
              >{#each availableModels as model (model.id)}<option
                  value={model.id}
                  >{findToolResource(model.toolKey).name} · {model.name}</option
                >{/each}</select
            ></label
          >
          <div class="tool-step-label">
            <span>2</span>
            <div>
              <strong>Contexto</strong><small
                >Associe a tarefa sem duplicar Cliente ou Projeto</small
              >
            </div>
          </div>
          <div class="tool-grid tool-grid--2">
            <label class="tool-field"
              ><span>Nome do Uso</span><input
                bind:value={name}
                maxlength="140"
                required
                placeholder="Ex.: Briefing — Projeto Acme"
              /></label
            >
            <label class="tool-field"
              ><span>Tarefa associada</span><select
                value={taskId ?? ""}
                onchange={(event) => selectTask(event.currentTarget.value)}
                ><option value="">Sem tarefa por enquanto</option
                >{#each availableTasks as task (task.id)}<option value={task.id}
                    >{task.project.name} · {task.name}</option
                  >{/each}</select
              ></label
            >
          </div>
          <div class="tool-step-label">
            <span>3</span>
            <div>
              <strong
                >Conteúdo específico{resource
                  ? ` de ${resource.name}`
                  : ""}</strong
              ><small>Somente o que pertence a esta execução</small>
            </div>
          </div>
          {#if selectedModel}<ToolUseContentFields
              config={selectedModel.config}
              {content}
              onchange={(next) => (content = next)}
            />{/if}
          <div class="tool-step-label">
            <span>4</span>
            <div>
              <strong>Disponibilidade</strong><small
                >Rascunhos ainda não recebem respostas</small
              >
            </div>
          </div>
          <div class="tool-status-choice">
            {#if !use || use.status === "draft"}<label
                class:active={status === "draft"}
                ><input
                  type="radio"
                  name="status"
                  value="draft"
                  checked={status === "draft"}
                  onchange={() => (status = "draft")}
                /><span
                  ><strong>Salvar como rascunho</strong><small
                    >Continue configurando depois</small
                  ></span
                ></label
              >{/if}<label class:active={status === "open"}
              ><input
                type="radio"
                name="status"
                value="open"
                checked={status === "open"}
                onchange={() => (status = "open")}
              /><span
                ><strong>Disponibilizar</strong><small
                  >Pronto para receber respostas</small
                ></span
              ></label
            >{#if use?.status === "completed"}<label
                class:active={status === "completed"}
                ><input
                  type="radio"
                  name="status"
                  value="completed"
                  checked
                  onchange={() => (status = "completed")}
                /><span
                  ><strong>Concluído</strong><small
                    >Conteúdo histórico preservado</small
                  ></span
                ></label
              >{/if}
          </div>
        {/if}
        {#if formError}<p class="tool-form-error" role="alert">
            {formError}
          </p>{/if}
      </div>
      <footer class="tool-modal__footer">
        <button class="tool-cancel-button" type="button" onclick={onclose}
          >Cancelar</button
        ><button
          class="tool-primary-button"
          type="submit"
          disabled={pending || !selectedModel}
          ><Save size={16} />
          {pending
            ? "Salvando…"
            : use
              ? "Salvar alterações"
              : "Criar uso"}</button
        >
      </footer>
    </form>
  </div>
</div>

<svelte:window onkeydown={(event) => event.key === "Escape" && onclose()} />
