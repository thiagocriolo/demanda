<script lang="ts">
  import "./tools.css";
  import { page } from "$app/state";
  import {
    Archive,
    Check,
    Copy,
    FilePlus2,
    FolderKanban,
    LayoutTemplate,
    MessageSquareText,
    Pencil,
    Play,
    Plus,
    Search,
    SquareStack,
    X,
  } from "@lucide/svelte";
  import { onMount } from "svelte";
  import type { Task } from "$lib/tasks/types";
  import { listAllTasks, TaskApiError } from "$lib/tasks/client";
  import Tabs from "$lib/ui/Tabs.svelte";
  import {
    getActiveWorkspace,
    loadWorkspaces,
    observeWorkspaces,
  } from "$lib/workspaces/workspace-storage";
  import {
    archiveToolModel,
    duplicateToolModel,
    loadTools,
    ToolApiError,
    updateToolUse,
  } from "./client";
  import { findToolResource, toolResources } from "./catalog";
  import TemplateEditorModal from "./TemplateEditorModal.svelte";
  import UseDetailModal from "./UseDetailModal.svelte";
  import UseEditorModal from "./UseEditorModal.svelte";
  import {
    isToolKey,
    type ToolKey,
    type ToolModel,
    type ToolUse,
    type ToolUseStatus,
  } from "./types";

  let { data } = $props<{
    data: {
      authenticatedUser: { id: string };
      activeWorkspace: { workspace: { id: string } } | null;
    };
  }>();

  type PageTab = "uses" | "models" | "catalog";
  const statusLabels: Record<ToolUseStatus, string> = {
    draft: "Rascunho",
    open: "Em andamento",
    completed: "Concluído",
    archived: "Arquivado",
  };

  let activeTab = $state<PageTab>("uses");
  let models = $state<ToolModel[]>([]);
  let uses = $state<ToolUse[]>([]);
  let tasks = $state<Task[]>([]);
  let loading = $state(true);
  let loadError = $state("");
  let query = $state("");
  let toolFilter = $state<ToolKey | "all">("all");
  let statusFilter = $state<ToolUseStatus | "all">("all");
  let templateModal = $state(false);
  let editingModel = $state<ToolModel>();
  let templateToolKey = $state<ToolKey>("form");
  let templateWorkspaceId = $state("");
  let useModal = $state(false);
  let editingUse = $state<ToolUse>();
  let initialUseModel = $state<ToolModel>();
  let initialTaskId = $state<string | null>(null);
  let detailUse = $state<ToolUse>();
  let createUseAfterModel = $state(false);
  let pendingAction = $state("");
  let requestedFlowHandled = false;

  let activeModels = $derived(models.filter(({ archivedAt }) => !archivedAt));
  let tabItems = $derived([
    { id: "uses", label: "Usos", badge: uses.length },
    { id: "models", label: "Modelos", badge: activeModels.length },
    { id: "catalog", label: "Catálogo", badge: toolResources.length },
  ]);
  let hasActiveFilters = $derived(
    Boolean(query.trim()) ||
      toolFilter !== "all" ||
      (activeTab === "uses" && statusFilter !== "all"),
  );
  let visibleUses = $derived(
    uses.filter((use) => {
      const searchable = [
        use.name,
        use.modelName,
        use.context?.task.name,
        use.context?.project.name,
        use.context?.business.name,
        findToolResource(use.toolKey).name,
      ]
        .filter(Boolean)
        .join(" ")
        .toLocaleLowerCase("pt-BR");
      return (
        (toolFilter === "all" || use.toolKey === toolFilter) &&
        (statusFilter === "all" || use.status === statusFilter) &&
        searchable.includes(query.trim().toLocaleLowerCase("pt-BR"))
      );
    }),
  );
  let visibleModels = $derived(
    activeModels.filter((model) => {
      const searchable =
        `${model.name} ${model.description} ${findToolResource(model.toolKey).name}`.toLocaleLowerCase(
          "pt-BR",
        );
      return (
        (toolFilter === "all" || model.toolKey === toolFilter) &&
        searchable.includes(query.trim().toLocaleLowerCase("pt-BR"))
      );
    }),
  );

  function workspaceName(workspaceId: string): string {
    return (
      loadWorkspaces().find(({ id }) => id === workspaceId)?.name ??
      "Área de trabalho"
    );
  }

  function currentWorkspaceId(): string {
    try {
      return getActiveWorkspace().id;
    } catch {
      return data.activeWorkspace?.workspace.id ?? "";
    }
  }

  async function refresh(): Promise<void> {
    loading = true;
    loadError = "";
    try {
      const [snapshots, loadedTasks] = await Promise.all([
        loadTools(),
        listAllTasks(),
      ]);
      models = snapshots.flatMap(({ models: items }) => items);
      uses = snapshots.flatMap(({ uses: items }) => items);
      tasks = loadedTasks;
      handleRequestedFlow();
    } catch (cause) {
      loadError =
        cause instanceof ToolApiError || cause instanceof TaskApiError
          ? cause.message
          : "Não foi possível carregar Ferramentas.";
    } finally {
      loading = false;
    }
  }

  function clearFlowQuery(): void {
    const url = new URL(page.url);
    for (const key of ["novoUso", "taskId", "modelo", "ferramenta"]) {
      url.searchParams.delete(key);
    }
    history.replaceState(history.state, "", `${url.pathname}${url.search}`);
  }

  function handleRequestedFlow(): void {
    if (requestedFlowHandled) return;
    const wantsUse = page.url.searchParams.get("novoUso") === "1";
    const taskId = page.url.searchParams.get("taskId");
    const modelId = page.url.searchParams.get("modelo");
    const requestedTool = page.url.searchParams.get("ferramenta");
    if (!wantsUse && !taskId && !modelId && !isToolKey(requestedTool)) return;
    requestedFlowHandled = true;
    const task = tasks.find(({ id }) => id === taskId);
    const model = activeModels.find(({ id }) => id === modelId);
    if (model) {
      openUse(model, task?.id ?? null);
    } else if (task) {
      const taskModel = activeModels.find(
        ({ workspaceId }) => workspaceId === task.workspaceId,
      );
      if (taskModel) openUse(taskModel, task.id);
      else
        openTemplate(
          isToolKey(requestedTool) ? requestedTool : "form",
          task.workspaceId,
          true,
          task.id,
        );
    } else if (isToolKey(requestedTool)) {
      const toolModel = activeModels.find(
        ({ toolKey }) => toolKey === requestedTool,
      );
      if (wantsUse && toolModel) openUse(toolModel);
      else openTemplate(requestedTool, currentWorkspaceId(), wantsUse);
    } else {
      openNewUse();
    }
    clearFlowQuery();
  }

  function resetFilters(): void {
    query = "";
    toolFilter = "all";
    statusFilter = "all";
  }

  function openTemplate(
    toolKey: ToolKey = "form",
    workspaceId = currentWorkspaceId(),
    thenCreateUse = false,
    taskId: string | null = null,
  ): void {
    editingModel = undefined;
    templateToolKey = toolKey;
    templateWorkspaceId = workspaceId;
    createUseAfterModel = thenCreateUse;
    initialTaskId = taskId;
    templateModal = true;
  }

  function editModel(model: ToolModel): void {
    editingModel = model;
    templateToolKey = model.toolKey;
    templateWorkspaceId = model.workspaceId;
    createUseAfterModel = false;
    templateModal = true;
  }

  function openNewUse(): void {
    if (!activeModels.length) {
      openTemplate("form", currentWorkspaceId(), true);
      return;
    }
    openUse();
  }

  function openUse(model?: ToolModel, taskId: string | null = null): void {
    editingUse = undefined;
    initialUseModel = model;
    initialTaskId = taskId;
    useModal = true;
  }

  function editUse(use: ToolUse): void {
    editingUse = use;
    initialUseModel = models.find(({ id }) => id === use.modelId);
    initialTaskId = use.taskId;
    useModal = true;
  }

  function replaceModel(saved: ToolModel): void {
    models = [saved, ...models.filter(({ id }) => id !== saved.id)];
    templateModal = false;
    if (createUseAfterModel) openUse(saved, initialTaskId);
    createUseAfterModel = false;
  }

  function replaceUse(saved: ToolUse): void {
    uses = [saved, ...uses.filter(({ id }) => id !== saved.id)];
    useModal = false;
    editingUse = undefined;
  }

  async function duplicate(model: ToolModel): Promise<void> {
    pendingAction = model.id;
    loadError = "";
    try {
      const copy = await duplicateToolModel(model.id);
      models = [copy, ...models];
      activeTab = "models";
    } catch (cause) {
      loadError =
        cause instanceof ToolApiError
          ? cause.message
          : "Não foi possível duplicar o Modelo.";
    } finally {
      pendingAction = "";
    }
  }

  async function archive(model: ToolModel): Promise<void> {
    if (
      !confirm(
        `Arquivar o modelo “${model.name}”? Os Usos existentes serão preservados.`,
      )
    )
      return;
    pendingAction = model.id;
    loadError = "";
    try {
      const archived = await archiveToolModel(model.id, model.version);
      models = models.map((item) =>
        item.id === archived.id ? archived : item,
      );
    } catch (cause) {
      loadError =
        cause instanceof ToolApiError
          ? cause.message
          : "Não foi possível arquivar o Modelo.";
    } finally {
      pendingAction = "";
    }
  }

  async function archiveUse(use: ToolUse): Promise<void> {
    if (
      !confirm(`Arquivar o Uso “${use.name}”? As respostas serão preservadas.`)
    )
      return;
    pendingAction = use.id;
    loadError = "";
    try {
      const archived = await updateToolUse(use.id, {
        name: use.name,
        taskId: use.taskId,
        content: use.content,
        status: "archived",
        version: use.version,
      });
      uses = uses.map((item) => (item.id === archived.id ? archived : item));
    } catch (cause) {
      loadError =
        cause instanceof ToolApiError
          ? cause.message
          : "Não foi possível arquivar o Uso.";
    } finally {
      pendingAction = "";
    }
  }

  onMount(() => {
    void refresh();
    return observeWorkspaces(() => void refresh());
  });
</script>

<svelte:head><title>Ferramentas · Demanda</title></svelte:head>

<header class="tools-hero">
  <div class="tools-hero__main">
    <span class="tools-hero__icon" aria-hidden="true">
      <SquareStack size={25} />
    </span>
    <div>
      <span class="tools-eyebrow">Área de trabalho</span>
      <h1>Ferramentas</h1>
      <p>Crie modelos reutilizáveis e aplique-os em projetos e tarefas.</p>
    </div>
  </div>
  <div class="tools-header-actions">
    <button
      class="tools-secondary-action"
      type="button"
      onclick={() => openTemplate()}
      ><LayoutTemplate size={16} /> Novo modelo</button
    >
    <button class="tools-primary-action" type="button" onclick={openNewUse}
      ><Plus size={17} /> Novo uso</button
    >
  </div>
</header>

<section class="tools-workspace" aria-label="Gerenciamento de Ferramentas">
  <div class="tools-navigation">
    <Tabs
      items={tabItems}
      bind:value={activeTab}
      ariaLabel="Seções de Ferramentas"
      class="tools-tabs"
      tabIdPrefix="tools-tab"
      panelId="tools-panel"
    />
    <p>
      <strong>Modelos</strong> definem a estrutura. <strong>Usos</strong> são as aplicações
      no trabalho.
    </p>
  </div>
  <div id="tools-panel" class="tools-panel" role="tabpanel">
    {#if activeTab !== "catalog"}
      <div class="tools-toolbar">
        <label class="tools-search"
          ><Search size={16} /><input
            bind:value={query}
            aria-label={activeTab === "uses" ? "Buscar usos" : "Buscar modelos"}
            placeholder={activeTab === "uses"
              ? "Buscar por nome, projeto ou tarefa…"
              : "Buscar modelos…"}
          /></label
        >
        <div class="tools-filters">
          <select bind:value={toolFilter} aria-label="Filtrar por ferramenta"
            ><option value="all">Todas as ferramentas</option
            >{#each toolResources as resource}<option value={resource.key}
                >{resource.name}</option
              >{/each}</select
          >{#if activeTab === "uses"}<select
              bind:value={statusFilter}
              aria-label="Filtrar por status"
              ><option value="all">Todos os status</option
              >{#each Object.entries(statusLabels) as [value, label]}<option
                  {value}>{label}</option
                >{/each}</select
            >{/if}{#if hasActiveFilters}<button
              class="tools-clear-filters"
              type="button"
              aria-label="Limpar busca e filtros"
              title="Limpar filtros"
              onclick={resetFilters}><X size={15} /> <span>Limpar</span></button
            >{/if}
        </div>
      </div>
    {/if}

    {#if loadError}<div class="tools-error" role="alert">
        <span>{loadError}</span><button
          type="button"
          onclick={() => void refresh()}>Tentar novamente</button
        >
      </div>{/if}

    {#if loading}
      <div class="tools-skeleton-grid" aria-label="Carregando Ferramentas">
        {#each [1, 2, 3] as item (item)}
          <div class="tools-skeleton-card" aria-hidden="true">
            <span></span><i></i><i></i><i></i>
          </div>
        {/each}
      </div>
    {:else if activeTab === "uses"}
      <h2 class="sr-only">Usos</h2>
      {#if hasActiveFilters}<p class="tools-result-count" aria-live="polite">
          {visibleUses.length}
          {visibleUses.length === 1 ? "uso encontrado" : "usos encontrados"}
        </p>{/if}
      {#if visibleUses.length}
        <div class="tools-card-grid">
          {#each visibleUses as use (use.id)}
            {@const resource = findToolResource(use.toolKey)}
            {@const ResourceIcon = resource.icon}
            <article class="tool-entity-card">
              <header>
                <span class="tool-card-icon"><ResourceIcon size={21} /></span
                ><span
                  class:status-open={use.status === "open"}
                  class:status-completed={use.status === "completed"}
                  class:status-draft={use.status === "draft"}
                  class="tool-status"><i></i>{statusLabels[use.status]}</span
                >
              </header>
              <div class="tool-card-copy">
                <span>{resource.name}</span>
                <h3>{use.name}</h3>
                {#if use.context}<p>
                    <FolderKanban size={13} />
                    {use.context.project.name} · {use.context.task.name}
                  </p>{:else}<p>Sem tarefa associada</p>{/if}
              </div>
              <div class="tool-card-meta">
                <span
                  ><MessageSquareText size={14} />
                  {use.responseCount}
                  {use.responseCount === 1 ? "resposta" : "respostas"}</span
                ><span>{workspaceName(use.workspaceId)}</span>
              </div>
              <footer>
                <button
                  class="tool-card-primary"
                  type="button"
                  onclick={() => (detailUse = use)}
                  ><Play size={15} /> Abrir</button
                >{#if use.status === "draft" || use.status === "open"}<button
                    class="tool-icon-action"
                    type="button"
                    aria-label={`Editar ${use.name}`}
                    title="Editar"
                    onclick={() => editUse(use)}><Pencil size={14} /></button
                  >{/if}{#if use.status !== "archived"}<button
                    class="tool-icon-action"
                    type="button"
                    aria-label={`Arquivar ${use.name}`}
                    title="Arquivar"
                    disabled={pendingAction === use.id}
                    onclick={() => void archiveUse(use)}
                    ><Archive size={14} /></button
                  >{/if}
              </footer>
            </article>
          {/each}
        </div>
      {:else}
        <div class="tools-empty">
          <span><FilePlus2 size={29} /></span>
          <h2>
            {uses.length
              ? "Nenhum uso encontrado"
              : "Comece usando uma ferramenta"}
          </h2>
          <p>
            {uses.length
              ? "Ajuste a busca ou os filtros para encontrar um Uso."
              : "Escolha uma ferramenta disponível, utilize um Modelo ou crie seu próprio Modelo para iniciar uma atividade."}
          </p>
          <div>
            {#if uses.length}<button
                class="tools-secondary-action"
                type="button"
                onclick={resetFilters}>Limpar filtros</button
              >{/if}<button
              class="tools-primary-action"
              type="button"
              onclick={openNewUse}><Plus size={16} /> Criar primeiro uso</button
            >
          </div>
        </div>
      {/if}
    {:else if activeTab === "models"}
      <h2 class="sr-only">Modelos</h2>
      {#if hasActiveFilters}<p class="tools-result-count" aria-live="polite">
          {visibleModels.length}
          {visibleModels.length === 1
            ? "modelo encontrado"
            : "modelos encontrados"}
        </p>{/if}
      {#if visibleModels.length}
        <div class="tools-card-grid">
          {#each visibleModels as model (model.id)}
            {@const resource = findToolResource(model.toolKey)}
            {@const ResourceIcon = resource.icon}
            <article class="tool-entity-card tool-model-card">
              <header>
                <span class="tool-card-icon"><ResourceIcon size={21} /></span
                ><span class="tool-model-type">{resource.name}</span>
              </header>
              <div class="tool-card-copy">
                <h3>{model.name}</h3>
                <p>{model.description || resource.description}</p>
              </div>
              <div class="tool-card-meta">
                <span
                  >{model.usageCount}
                  {model.usageCount === 1 ? "uso criado" : "usos criados"}</span
                ><span
                  >Atualizado em {new Date(model.updatedAt).toLocaleDateString(
                    "pt-BR",
                  )}</span
                >
              </div>
              <footer class="tool-model-actions">
                <button
                  class="tool-card-primary"
                  type="button"
                  onclick={() => openUse(model)}
                  ><Play size={14} /> Usar modelo</button
                ><button
                  type="button"
                  aria-label={`Editar ${model.name}`}
                  title="Editar"
                  onclick={() => editModel(model)}><Pencil size={14} /></button
                ><button
                  type="button"
                  aria-label={`Duplicar ${model.name}`}
                  title="Duplicar"
                  disabled={pendingAction === model.id}
                  onclick={() => void duplicate(model)}
                  ><Copy size={14} /></button
                ><button
                  type="button"
                  aria-label={`Arquivar ${model.name}`}
                  title="Arquivar"
                  disabled={pendingAction === model.id}
                  onclick={() => void archive(model)}
                  ><Archive size={14} /></button
                >
              </footer>
            </article>
          {/each}
        </div>
      {:else}
        <div class="tools-empty">
          <span><LayoutTemplate size={29} /></span>
          <h2>
            {models.length
              ? "Nenhum modelo encontrado"
              : "Crie seu primeiro modelo"}
          </h2>
          <p>
            Configure uma estrutura uma vez e reutilize-a sem misturar o
            conteúdo específico de cada projeto.
          </p>
          <div>
            {#if models.length}<button
                class="tools-secondary-action"
                type="button"
                onclick={resetFilters}>Limpar filtros</button
              >{/if}<button
              class="tools-primary-action"
              type="button"
              onclick={() => openTemplate()}
              ><Plus size={16} /> Novo modelo</button
            >
          </div>
        </div>
      {/if}
    {:else}
      <div class="tools-catalog-heading">
        <div>
          <h2>Escolha um formato</h2>
          <p>
            Comece por um modelo pronto para o tipo de informação que deseja
            coletar.
          </p>
        </div>
      </div>
      <div class="tool-catalog-grid">
        {#each toolResources as resource (resource.key)}
          {@const ResourceIcon = resource.icon}
          {@const relatedModels = activeModels.filter(
            ({ toolKey }) => toolKey === resource.key,
          )}
          <article class="tool-catalog-card">
            <header>
              <span class="tool-catalog-icon"><ResourceIcon size={23} /></span>
              <span class="tool-availability"><i></i> Disponível</span>
            </header>
            <div class="tool-catalog-copy">
              <h3>{resource.name}</h3>
              <p>{resource.description}</p>
            </div>
            <ul>
              {#each resource.highlights as highlight}<li>
                  <Check size={14} />
                  {highlight}
                </li>{/each}
            </ul>
            <footer class:single={!relatedModels.length}>
              {#if relatedModels.length}<button
                  type="button"
                  onclick={() => {
                    toolFilter = resource.key;
                    activeTab = "models";
                  }}
                  >{relatedModels.length}
                  {relatedModels.length === 1 ? "modelo" : "modelos"}</button
                ><button type="button" onclick={() => openUse(relatedModels[0])}
                  ><Play size={14} /> Iniciar uso</button
                >{:else}<button
                  type="button"
                  onclick={() => openTemplate(resource.key)}
                  ><Plus size={15} /> Criar modelo</button
                >{/if}
            </footer>
          </article>
        {/each}
      </div>
    {/if}
  </div>
</section>

{#if templateModal}
  <TemplateEditorModal
    workspaceId={templateWorkspaceId}
    model={editingModel}
    initialToolKey={templateToolKey}
    onclose={() => {
      templateModal = false;
      createUseAfterModel = false;
    }}
    onsaved={replaceModel}
  />
{/if}
{#if useModal}
  <UseEditorModal
    {models}
    {tasks}
    initialModel={initialUseModel}
    {initialTaskId}
    use={editingUse}
    onclose={() => (useModal = false)}
    onsaved={replaceUse}
  />
{/if}
{#if detailUse}
  <UseDetailModal
    initialUse={detailUse}
    authenticatedUserId={data.authenticatedUser.id}
    onclose={() => {
      detailUse = undefined;
      void refresh();
    }}
    onupdated={(updated) => {
      uses = uses.map((item) => (item.id === updated.id ? updated : item));
      detailUse = updated;
    }}
  />
{/if}

<style>
  .tools-header-actions {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .tools-primary-action,
  .tools-secondary-action {
    display: inline-flex;
    min-height: 40px;
    align-items: center;
    justify-content: center;
    gap: 7px;
    padding: 0 14px;
    border-radius: 10px;
    font: inherit;
    font-size: var(--text-xs);
    font-weight: 600;
  }
  .tools-primary-action {
    border: 0;
    color: white;
    background: var(--brand-600);
  }
  .tools-primary-action:hover {
    background: var(--brand-700);
  }
  .tools-secondary-action {
    border: 1px solid var(--border);
    color: var(--ink-700);
    background: var(--surface);
  }
  .tools-secondary-action:hover {
    border-color: color-mix(in srgb, var(--brand-500) 35%, var(--border));
    color: var(--brand-700);
    background: var(--brand-50);
  }
  .tools-workspace {
    min-width: 0;
  }
  .tools-panel {
    min-height: 480px;
    padding: 22px;
    border-radius: var(--radius-xl);
    background: white;
  }
  .tools-toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 14px;
    margin-bottom: 20px;
    padding: 10px;
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
    background: var(--surface-soft);
  }
  .tools-search {
    display: flex;
    width: min(350px, 100%);
    min-height: 38px;
    align-items: center;
    gap: 7px;
    padding: 0 10px;
    border: 1px solid var(--border);
    border-radius: 9px;
    color: var(--ink-400);
    background: var(--surface);
  }
  .tools-search:focus-within {
    border-color: var(--brand-500);
    box-shadow: var(--focus-ring);
  }
  .tools-search input {
    width: 100%;
    min-width: 0;
    border: 0;
    outline: 0;
    color: var(--ink-800);
    background: transparent;
    font: inherit;
    font-size: var(--text-xs);
  }
  .tools-filters {
    display: flex;
    align-items: center;
    gap: 7px;
  }
  .tools-filters select {
    min-height: 36px;
    padding: 0 28px 0 9px;
    border: 1px solid var(--border);
    border-radius: 9px;
    color: var(--ink-600);
    background: var(--surface);
    font: inherit;
    font-size: 10px;
  }
  .tools-card-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(min(100%, 290px), 1fr));
    align-items: stretch;
    gap: 13px;
  }
  .tool-entity-card {
    min-height: 250px;
    border: 1px solid var(--border);
    border-radius: var(--radius-xl);
    background: var(--panel);
  }
  .tool-entity-card {
    display: flex;
    min-width: 0;
    flex-direction: column;
    padding: 17px;
    box-shadow: 0 8px 24px rgba(15, 23, 42, 0.035);
  }
  .tool-entity-card header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
  }
  .tool-card-icon,
  .tool-catalog-icon {
    display: grid;
    width: 44px;
    height: 44px;
    place-items: center;
    border-radius: 12px;
    color: var(--brand-600);
    background: var(--brand-50);
  }
  .tool-status {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 5px 8px;
    border-radius: var(--radius-pill);
    color: var(--ink-500);
    background: var(--surface-soft);
    font-size: 9px;
    font-weight: 600;
  }
  .tool-status i {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--ink-400);
  }
  .tool-status.status-open {
    color: #166534;
    background: #f0fdf4;
  }
  .tool-status.status-open i {
    background: #22c55e;
  }
  .tool-status.status-completed {
    color: var(--brand-700);
    background: var(--brand-50);
  }
  .tool-status.status-completed i {
    background: var(--brand-500);
  }
  .tool-status.status-draft {
    color: #8a6512;
    background: #fffbeb;
  }
  .tool-status.status-draft i {
    background: var(--amber-500);
  }
  .tool-card-copy {
    display: grid;
    gap: 6px;
    margin-top: 15px;
  }
  .tool-card-copy > span,
  .tool-model-type {
    color: var(--brand-600);
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }
  .tool-card-copy h3 {
    color: var(--ink-950);
    font-size: var(--text-lg);
    letter-spacing: -0.02em;
  }
  .tool-card-copy p {
    display: flex;
    align-items: center;
    gap: 5px;
    color: var(--ink-500);
    font-size: var(--text-xs);
    line-height: 1.5;
  }
  .tool-card-meta {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    margin-top: auto;
    padding-top: 16px;
    color: var(--ink-400);
    font-size: 9px;
  }
  .tool-card-meta span {
    display: inline-flex;
    align-items: center;
    gap: 5px;
  }
  .tool-entity-card footer {
    display: flex;
    align-items: center;
    gap: 7px;
    margin-top: 11px;
    padding-top: 11px;
    border-top: 1px solid var(--border);
  }
  .tool-entity-card footer button {
    display: inline-flex;
    min-height: 34px;
    flex: 1;
    align-items: center;
    justify-content: center;
    gap: 6px;
    padding: 0 9px;
    border: 1px solid var(--border);
    border-radius: 9px;
    color: var(--ink-600);
    background: var(--surface);
    font: inherit;
    font-size: 10px;
    font-weight: 600;
  }
  .tool-entity-card footer button:first-child,
  .tool-entity-card footer .tool-card-primary {
    border-color: var(--brand-600);
    color: white;
    background: var(--brand-600);
  }
  .tool-entity-card footer button:hover {
    border-color: var(--brand-500);
    color: var(--brand-700);
    background: var(--brand-50);
  }
  .tool-entity-card footer button:first-child:hover,
  .tool-entity-card footer .tool-card-primary:hover {
    color: white;
    background: var(--brand-700);
  }
  .tool-model-actions button:not(.tool-card-primary) {
    flex: 0 0 34px;
    padding: 0;
  }
  .tools-empty {
    display: grid;
    min-height: 340px;
    place-content: center;
    justify-items: center;
    padding: 30px;
    border: 1px dashed var(--border-strong);
    border-radius: var(--radius-xl);
    background: var(--surface-soft);
    text-align: center;
  }
  .tools-empty > span {
    display: grid;
    width: 62px;
    height: 62px;
    place-items: center;
    margin-bottom: 13px;
    border-radius: 17px;
    color: var(--brand-600);
    background: var(--brand-50);
  }
  .tools-empty h2 {
    color: var(--ink-950);
    font-size: var(--text-xl);
  }
  .tools-empty p {
    max-width: 480px;
    margin-top: 7px;
    color: var(--ink-500);
    font-size: var(--text-sm);
    line-height: 1.55;
  }
  .tools-empty > div {
    display: flex;
    gap: 8px;
    margin-top: 18px;
  }
  .tool-catalog-grid {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 12px;
  }
  .tool-catalog-card {
    display: flex;
    min-width: 0;
    min-height: 330px;
    flex-direction: column;
    padding: 17px;
    border: 1px solid var(--border);
    border-radius: var(--radius-xl);
    background: var(--panel);
    transition:
      transform var(--motion-fast),
      border-color var(--motion-fast);
  }
  .tool-catalog-card:hover {
    transform: translateY(-2px);
    border-color: color-mix(in srgb, var(--brand-500) 35%, var(--border));
  }
  .tool-catalog-card > div {
    display: grid;
    gap: 6px;
    margin-top: 14px;
  }
  .tool-catalog-card h3 {
    color: var(--ink-950);
    font-size: var(--text-lg);
  }
  .tool-catalog-card p {
    color: var(--ink-500);
    font-size: var(--text-xs);
    line-height: 1.5;
  }
  .tool-catalog-card ul {
    display: grid;
    gap: 7px;
    margin-top: 14px;
  }
  .tool-catalog-card li {
    display: flex;
    align-items: center;
    gap: 6px;
    color: var(--ink-600);
    font-size: 10px;
  }
  .tool-catalog-card li :global(svg) {
    color: #22c55e;
  }
  .tool-catalog-card footer {
    display: grid;
    grid-template-columns: 1fr 1.3fr;
    gap: 6px;
    margin-top: auto;
    padding-top: 16px;
  }
  .tool-catalog-card footer button {
    display: inline-flex;
    min-height: 35px;
    align-items: center;
    justify-content: center;
    gap: 5px;
    border: 1px solid var(--border);
    border-radius: 9px;
    color: var(--ink-600);
    background: var(--surface);
    font: inherit;
    font-size: 9px;
    font-weight: 600;
  }
  .tool-catalog-card footer button:last-child {
    border-color: var(--brand-600);
    color: white;
    background: var(--brand-600);
  }
  .tools-error {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 14px;
    padding: 9px 11px;
    border: 1px solid color-mix(in srgb, var(--red-500) 25%, var(--border));
    border-radius: 9px;
    color: #b91c1c;
    background: #fef2f2;
    font-size: var(--text-xs);
  }
  .tools-error button {
    border: 0;
    color: inherit;
    background: transparent;
    font-weight: 700;
  }
  @media (max-width: 1050px) {
    .tool-catalog-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }
  /* Experience refresh: compact hierarchy and task-first controls. */
  .tools-hero {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 24px;
    margin-bottom: 14px;
    padding: 18px 20px;
    overflow: hidden;
    border: 1px solid color-mix(in srgb, var(--brand-500) 15%, var(--border));
    border-radius: var(--radius-xl);
    background:
      radial-gradient(circle at 88% 0%, var(--brand-50), transparent 36%),
      rgba(255, 255, 255, 0.9);
    box-shadow: 0 8px 28px rgba(15, 23, 42, 0.045);
  }
  .tools-hero__main {
    display: flex;
    min-width: 0;
    align-items: center;
    gap: 14px;
  }
  .tools-hero__icon {
    display: grid;
    width: 48px;
    height: 48px;
    flex: 0 0 auto;
    place-items: center;
    border-radius: 14px;
    color: white;
    background: linear-gradient(145deg, #5f7aff, var(--brand-600));
    box-shadow: 0 8px 18px rgba(46, 86, 255, 0.2);
  }
  .tools-eyebrow {
    display: block;
    margin-bottom: 3px;
    color: var(--brand-600);
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }
  .tools-hero h1 {
    color: var(--ink-950);
    font-size: clamp(22px, 2.3vw, 27px);
    line-height: 1.05;
    letter-spacing: -0.035em;
  }
  .tools-hero p {
    margin-top: 5px;
    color: var(--ink-500);
    font-size: var(--text-sm);
  }
  .tools-header-actions {
    flex: 0 0 auto;
  }
  .tools-primary-action,
  .tools-secondary-action {
    min-height: 38px;
    border-radius: 11px;
    transition:
      transform var(--motion-fast) ease,
      border-color var(--motion-fast) ease,
      background var(--motion-fast) ease,
      box-shadow var(--motion-fast) ease;
  }
  .tools-primary-action {
    box-shadow: 0 6px 16px rgba(46, 86, 255, 0.18);
  }
  .tools-primary-action:hover {
    transform: translateY(-1px);
    box-shadow: 0 8px 20px rgba(46, 86, 255, 0.22);
  }
  .tools-primary-action:active,
  .tools-secondary-action:active {
    transform: translateY(0) scale(0.98);
  }
  .tools-navigation {
    display: flex;
    min-width: 0;
    align-items: center;
    justify-content: space-between;
    gap: 18px;
    margin-bottom: 8px;
    padding: 6px;
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
    background: rgba(255, 255, 255, 0.62);
  }
  .tools-navigation :global(.tools-tabs) {
    width: auto;
    flex: 0 0 auto;
    align-items: center;
    gap: 3px;
    padding: 0;
    margin: 0;
    overflow: visible;
  }
  .tools-navigation :global(.tools-tabs .tab-button) {
    min-height: 38px;
    padding: 8px 13px;
    border: 0;
    border-radius: 10px;
    color: var(--ink-500);
    background: transparent;
    box-shadow: none;
    font-size: var(--text-sm);
    font-weight: 600;
  }
  .tools-navigation :global(.tools-tabs .tab-button:hover) {
    color: var(--ink-800);
    background: var(--surface-soft);
  }
  .tools-navigation :global(.tools-tabs .tab-button--active) {
    color: var(--brand-700);
    background: white;
    box-shadow:
      0 1px 2px rgba(15, 23, 42, 0.08),
      0 5px 14px rgba(15, 23, 42, 0.06);
  }
  .tools-navigation :global(.tools-tabs .tab-button__badge) {
    min-width: 19px;
    padding: 2px 5px;
    color: currentColor;
    background: var(--surface-hover);
    line-height: 1.3;
  }
  .tools-navigation > p {
    padding-right: 9px;
    color: var(--ink-400);
    font-size: 10px;
    line-height: 1.4;
    text-align: right;
  }
  .tools-navigation > p strong {
    color: var(--ink-600);
    font-weight: 600;
  }
  .tools-panel {
    min-height: 440px;
    padding: 18px;
    border: 1px solid rgba(15, 23, 42, 0.06);
    border-radius: var(--radius-xl);
    background: rgba(255, 255, 255, 0.96);
    box-shadow: 0 10px 32px rgba(15, 23, 42, 0.04);
  }
  .tools-toolbar {
    margin-bottom: 14px;
    padding: 0;
    border: 0;
    background: transparent;
  }
  .tools-search {
    width: min(430px, 100%);
    min-height: 40px;
    padding: 0 12px;
    border-color: rgba(15, 23, 42, 0.1);
    border-radius: 11px;
    background: var(--surface-soft);
    transition:
      border-color var(--motion-fast) ease,
      background var(--motion-fast) ease,
      box-shadow var(--motion-fast) ease;
  }
  .tools-search:focus-within {
    background: white;
  }
  .tools-search input {
    font-size: var(--text-sm);
  }
  .tools-search input::placeholder {
    color: var(--ink-400);
  }
  .tools-filters {
    min-width: 0;
  }
  .tools-filters select,
  .tools-clear-filters {
    min-height: 38px;
    border: 1px solid var(--border);
    border-radius: 10px;
    color: var(--ink-600);
    background-color: white;
    font: inherit;
    font-size: 10px;
  }
  .tools-filters select {
    max-width: 190px;
    padding: 0 29px 0 10px;
  }
  .tools-clear-filters {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 5px;
    padding: 0 10px;
    color: var(--ink-500);
    background: transparent;
  }
  .tools-clear-filters:hover {
    border-color: color-mix(in srgb, var(--brand-500) 35%, var(--border));
    color: var(--brand-700);
    background: var(--brand-50);
  }
  .tools-result-count {
    margin: -2px 1px 12px;
    color: var(--ink-400);
    font-size: 10px;
  }
  .tools-card-grid {
    grid-template-columns: repeat(auto-fit, minmax(min(100%, 280px), 1fr));
    gap: 12px;
  }
  .tool-entity-card {
    min-height: 224px;
    padding: 15px;
    border-color: rgba(15, 23, 42, 0.1);
    border-radius: 15px;
    box-shadow: none;
    transition:
      transform var(--motion-fast) ease,
      border-color var(--motion-fast) ease,
      box-shadow var(--motion-fast) ease;
  }
  .tool-entity-card:hover {
    transform: translateY(-2px);
    border-color: color-mix(in srgb, var(--brand-500) 30%, var(--border));
    box-shadow: 0 12px 26px rgba(15, 23, 42, 0.07);
  }
  .tool-card-icon,
  .tool-catalog-icon {
    width: 40px;
    height: 40px;
    border-radius: 11px;
  }
  .tool-card-copy {
    margin-top: 13px;
  }
  .tool-card-copy p {
    display: -webkit-box;
    overflow: hidden;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    line-clamp: 2;
  }
  .tool-card-meta {
    padding-top: 13px;
  }
  .tool-entity-card footer {
    margin-top: 10px;
    padding-top: 10px;
  }
  .tool-entity-card footer button {
    min-height: 36px;
    border-radius: 10px;
    transition:
      border-color var(--motion-fast) ease,
      background var(--motion-fast) ease,
      color var(--motion-fast) ease;
  }
  .tool-entity-card footer .tool-card-primary {
    flex: 1 1 auto;
  }
  .tool-entity-card footer .tool-icon-action,
  .tool-model-actions button:not(.tool-card-primary) {
    flex: 0 0 36px;
    padding: 0;
  }
  .tool-entity-card footer button:disabled {
    cursor: wait;
    opacity: 0.5;
  }
  .tools-empty {
    min-height: 315px;
    border-color: rgba(15, 23, 42, 0.13);
    background: linear-gradient(145deg, var(--surface-soft), white);
  }
  .tools-catalog-heading {
    display: flex;
    align-items: end;
    justify-content: space-between;
    gap: 16px;
    margin: 1px 1px 15px;
  }
  .tools-catalog-heading h2 {
    color: var(--ink-950);
    font-size: var(--text-xl);
    letter-spacing: -0.02em;
  }
  .tools-catalog-heading p {
    margin-top: 4px;
    color: var(--ink-500);
    font-size: var(--text-xs);
  }
  .tool-catalog-grid {
    grid-template-columns: repeat(4, minmax(210px, 1fr));
    gap: 12px;
  }
  .tool-catalog-card {
    min-height: 290px;
    padding: 15px;
    border-color: rgba(15, 23, 42, 0.1);
    border-radius: 15px;
    box-shadow: none;
    transition:
      transform var(--motion-fast) ease,
      border-color var(--motion-fast) ease,
      box-shadow var(--motion-fast) ease;
  }
  .tool-catalog-card:hover {
    transform: translateY(-2px);
    border-color: color-mix(in srgb, var(--brand-500) 30%, var(--border));
    box-shadow: 0 12px 26px rgba(15, 23, 42, 0.07);
  }
  .tool-catalog-card header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
  }
  .tool-availability {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    color: #15803d;
    font-size: 9px;
    font-weight: 600;
  }
  .tool-availability i {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: #22c55e;
    box-shadow: 0 0 0 3px rgba(34, 197, 94, 0.1);
  }
  .tool-catalog-card > .tool-catalog-copy {
    gap: 5px;
    margin-top: 13px;
  }
  .tool-catalog-card ul {
    margin-top: 13px;
  }
  .tool-catalog-card footer {
    grid-template-columns: minmax(0, 0.85fr) minmax(0, 1.25fr);
    padding-top: 14px;
  }
  .tool-catalog-card footer.single {
    grid-template-columns: 1fr;
  }
  .tool-catalog-card footer button {
    min-width: 0;
    min-height: 37px;
    border-radius: 10px;
    white-space: nowrap;
  }
  .tool-catalog-card footer button:hover {
    border-color: color-mix(in srgb, var(--brand-500) 35%, var(--border));
    color: var(--brand-700);
    background: var(--brand-50);
  }
  .tool-catalog-card footer button:last-child:hover {
    color: white;
    background: var(--brand-700);
  }
  .tools-skeleton-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 12px;
  }
  .tools-skeleton-card {
    display: grid;
    min-height: 224px;
    align-content: start;
    gap: 11px;
    padding: 15px;
    border: 1px solid var(--border);
    border-radius: 15px;
    background: white;
  }
  .tools-skeleton-card span,
  .tools-skeleton-card i {
    display: block;
    border-radius: 8px;
    background: linear-gradient(
      90deg,
      var(--surface-soft) 25%,
      var(--surface-hover) 45%,
      var(--surface-soft) 65%
    );
    background-size: 250% 100%;
    animation: tools-shimmer 1.4s ease infinite;
  }
  .tools-skeleton-card span {
    width: 40px;
    height: 40px;
    margin-bottom: 6px;
    border-radius: 11px;
  }
  .tools-skeleton-card i {
    width: 72%;
    height: 11px;
  }
  .tools-skeleton-card i:nth-child(3) {
    width: 92%;
  }
  .tools-skeleton-card i:nth-child(4) {
    width: 46%;
    margin-top: 42px;
  }
  @keyframes tools-shimmer {
    to {
      background-position: -180% 0;
    }
  }
  @media (max-width: 1120px) {
    .tool-catalog-grid {
      grid-template-columns: repeat(2, minmax(220px, 1fr));
    }
  }
  @media (max-width: 760px) {
    .tools-hero {
      align-items: stretch;
      flex-direction: column;
      gap: 16px;
      padding: 17px;
    }
    .tools-header-actions {
      width: 100%;
    }
    .tools-header-actions button {
      flex: 1;
    }
    .tools-navigation {
      padding: 5px;
    }
    .tools-navigation > p {
      display: none;
    }
    .tools-navigation :global(.tools-tabs) {
      width: 100%;
      flex: 1 1 auto;
      overflow-x: auto;
    }
    .tools-navigation :global(.tools-tabs .tab-button) {
      min-width: max-content;
      flex: 1 0 auto;
      padding-inline: 10px;
    }
    .tools-panel {
      padding: 12px;
      border-radius: var(--radius-lg);
    }
    .tools-toolbar {
      align-items: stretch;
      flex-direction: column;
      gap: 9px;
    }
    .tools-search {
      width: 100%;
    }
    .tools-filters {
      display: grid;
      width: 100%;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 7px;
    }
    .tools-filters select {
      width: 100%;
      max-width: none;
    }
    .tools-filters select:last-child {
      grid-column: auto;
    }
    .tools-clear-filters {
      grid-column: 1 / -1;
    }
    .tools-skeleton-grid {
      grid-template-columns: 1fr;
    }
    .tools-skeleton-card:nth-child(n + 2) {
      display: none;
    }
    .tool-catalog-grid {
      grid-template-columns: minmax(0, 1fr);
    }
    .tools-empty {
      min-height: 290px;
      padding: 24px 18px;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .tool-entity-card,
    .tool-catalog-card,
    .tools-primary-action,
    .tools-secondary-action {
      transform: none !important;
    }
    .tools-skeleton-card span,
    .tools-skeleton-card i {
      animation: none;
    }
  }
</style>
