<script lang="ts">
  import { goto } from "$app/navigation";
  import { page } from "$app/state";
  import PageHeader from "$lib/ui/PageHeader.svelte";
  import {
    getActiveWorkspace,
    GLOBAL_WORKSPACE_ID,
    loadActiveWorkspaceId,
    observeWorkspaces,
    PERSONAL_WORKSPACE_ID,
  } from "$lib/workspaces/workspace-storage";
  import { Plus, Search, X } from "@lucide/svelte";
  import { onMount } from "svelte";
  import DeleteConfirmation from "./DeleteConfirmation.svelte";
  import EntityForm from "./EntityForm.svelte";
  import EntityTable from "./EntityTable.svelte";
  import ProjectForm from "./ProjectForm.svelte";
  import TaskForm from "./TaskForm.svelte";
  import {
    createRecord,
    isArchivedRecord,
    loadEntityRecords,
    saveEntityRecords,
  } from "./storage";
  import type { EntityConfig, EntityRecord } from "./types";

  let { config } = $props<{ config: EntityConfig }>();
  let records = $state<EntityRecord[]>([]);
  let query = $state("");
  let formOpen = $state(false);
  let editing = $state<EntityRecord | undefined>();
  let deleting = $state<EntityRecord | undefined>();
  let initialized = $state(false);
  let activeWorkspaceId = $state(PERSONAL_WORKSPACE_ID);

  let visibleRecords = $derived(
    records.filter(
      (record) =>
        (activeWorkspaceId === GLOBAL_WORKSPACE_ID ||
          (record.workspaceId ?? PERSONAL_WORKSPACE_ID) ===
            activeWorkspaceId) &&
        !isArchivedRecord(record) &&
        Object.values(record).some((value) =>
          value.toLowerCase().includes(query.trim().toLowerCase()),
        ),
    ),
  );

  onMount(() => {
    records = loadEntityRecords(config);
    const refreshWorkspace = () => {
      activeWorkspaceId = loadActiveWorkspaceId();
    };
    refreshWorkspace();
    initialized = true;
    return observeWorkspaces(refreshWorkspace);
  });

  $effect(() => {
    if (initialized && page.url.searchParams.get("novo") === "1") {
      editing = undefined;
      formOpen = true;
      clearCreateQuery();
    }
  });

  function openCreate(): void {
    editing = undefined;
    formOpen = true;
  }

  function openEdit(record: EntityRecord): void {
    editing = record;
    formOpen = true;
  }

  function clearCreateQuery(): void {
    if (!page.url.searchParams.has("novo")) return;
    const url = new URL(page.url);
    url.searchParams.delete("novo");
    void goto(`${url.pathname}${url.search}`, {
      replaceState: true,
      noScroll: true,
      keepFocus: true,
    });
  }

  function closeForm(): void {
    formOpen = false;
    editing = undefined;
    clearCreateQuery();
  }

  function save(values: Record<string, string>): void {
    if (editing) {
      records = records.map((record) =>
        record.id === editing?.id
          ? { ...record, ...values, updatedAt: new Date().toISOString() }
          : record,
      );
    } else {
      records = [createRecord(values, getActiveWorkspace().id), ...records];
    }
    saveEntityRecords(config.key, records);
    closeForm();
  }

  function confirmDelete(): void {
    if (!deleting) return;
    records = records.filter((record) => record.id !== deleting?.id);
    saveEntityRecords(config.key, records);
    deleting = undefined;
  }

  function confirmArchive(): void {
    const record = deleting ?? editing;
    if (!record) return;
    const timestamp = new Date().toISOString();
    records = records.map((candidate) =>
      candidate.id === record.id
        ? { ...candidate, archivedAt: timestamp, updatedAt: timestamp }
        : candidate,
    );
    saveEntityRecords(config.key, records);
    deleting = undefined;
    closeForm();
  }
</script>

<svelte:head><title>{config.plural} · Demanda</title></svelte:head>

<PageHeader eyebrow="Cadastros" title={config.plural} icon={config.icon} />

<section class="crud-content" aria-label={`Conteúdo de ${config.plural}`}>
  <p class="crud-description">{config.description}</p>

  <div class="crud-toolbar">
    <div>
      <strong>Todos os cadastros</strong>
      <small>{visibleRecords.length} de {records.length} exibidos</small>
    </div>
    <div class="crud-toolbar__controls">
      <label class="search">
        <Search size={17} aria-hidden="true" />
        <span class="sr-only">Buscar em {config.plural}</span>
        <input
          bind:value={query}
          placeholder={`Buscar em ${config.plural.toLowerCase()}...`}
        />
        {#if query}
          <button
            type="button"
            aria-label="Limpar busca"
            onclick={() => (query = "")}
          >
            <X size={15} />
          </button>
        {/if}
      </label>
      <button class="add-record" type="button" onclick={openCreate}>
        <Plus size={17} />Adicionar {config.singular}
      </button>
    </div>
  </div>

  <EntityTable
    {config}
    records={visibleRecords}
    onedit={openEdit}
    ondelete={(record) => (deleting = record)}
    oncreate={openCreate}
  />
</section>

{#if formOpen}
  {#if config.key === "entregas"}
    <TaskForm
      {config}
      record={editing}
      mode={editing ? "edit" : "create"}
      oncancel={closeForm}
      onsave={save}
      onarchive={confirmArchive}
      ondelete={() => (deleting = editing)}
    />
  {:else if config.key === "projetos"}
    <ProjectForm
      record={editing}
      mode={editing ? "edit" : "create"}
      oncancel={closeForm}
      onsave={save}
      onarchive={confirmArchive}
      ondelete={() => (deleting = editing)}
    />
  {:else}
    <EntityForm
      {config}
      record={editing}
      oncancel={closeForm}
      onsave={save}
      onarchive={confirmArchive}
      ondelete={() => (deleting = editing)}
    />
  {/if}
{/if}

{#if deleting}
  <DeleteConfirmation
    entityName={deleting.nome ?? config.singular}
    oncancel={() => (deleting = undefined)}
    onarchive={confirmArchive}
    onconfirm={confirmDelete}
  />
{/if}

<style>
  .crud-content {
    display: grid;
    gap: 12px;
  }
  .crud-description {
    max-width: 720px;
    color: var(--ink-500);
    font-size: var(--text-sm);
    line-height: 1.55;
  }
  .add-record {
    display: inline-flex;
    min-height: 40px;
    align-items: center;
    gap: 7px;
    padding: 0 14px;
    border: 0;
    border-radius: 10px;
    color: white;
    background: var(--brand-600);
    font-weight: 600;
    box-shadow: 0 8px 18px rgba(46, 86, 255, 0.18);
  }
  .crud-toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 20px;
    padding: 12px 14px;
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
    background: var(--surface);
  }
  .crud-toolbar__controls {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 10px;
  }
  .crud-toolbar strong,
  .crud-toolbar small {
    display: block;
  }
  .crud-toolbar strong {
    color: var(--ink-800);
    font-size: var(--text-sm);
  }
  .crud-toolbar small {
    margin-top: 2px;
    color: var(--ink-400);
    font-size: var(--text-xs);
  }
  .search {
    display: flex;
    width: min(280px, 100%);
    min-height: 38px;
    align-items: center;
    gap: 7px;
    padding: 0 10px;
    border: 1px solid var(--border);
    border-radius: 9px;
    color: var(--ink-400);
    background: var(--canvas);
  }
  .search:focus-within {
    border-color: var(--brand-500);
    box-shadow: var(--focus-ring);
  }
  .search input {
    width: 100%;
    min-width: 0;
    border: 0;
    outline: 0;
    color: var(--ink-800);
    background: transparent;
    font-size: var(--text-sm);
  }
  .search button {
    display: grid;
    padding: 2px;
    border: 0;
    border-radius: 50%;
    color: var(--ink-500);
    background: transparent;
    place-items: center;
  }
  @media (max-width: 640px) {
    .add-record {
      width: 100%;
      justify-content: center;
    }
    .crud-toolbar {
      align-items: stretch;
      flex-direction: column;
      gap: 10px;
    }
    .crud-toolbar__controls {
      align-items: stretch;
      flex-direction: column;
    }
    .search {
      width: 100%;
    }
  }
</style>
