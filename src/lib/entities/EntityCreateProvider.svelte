<script lang="ts">
  import { setContext, type Snippet } from "svelte";
  import { entityConfigs } from "./catalog";
  import {
    ENTITY_CREATE_CONTEXT,
    type EntityCreateContext,
  } from "./create-context";
  import DeleteConfirmation from "./DeleteConfirmation.svelte";
  import EntityForm from "./EntityForm.svelte";
  import ProjectForm from "./ProjectForm.svelte";
  import TaskForm from "./TaskForm.svelte";
  import {
    archiveEntityRecord,
    createRecord,
    loadEntityRecords,
    saveEntityRecords,
  } from "./storage";
  import {
    entityPersistenceErrorMessage,
    getEntityPersistenceAdapter,
    type EntityPersistenceAdapter,
  } from "./adapters";
  import { loadActiveWorkspaceId } from "$lib/workspaces/workspace-storage";
  import type { EntityConfig, EntityRecord } from "./types";
  import type {
    EntityCardAction,
    EntityCardItem,
    EntityCardKind,
  } from "$lib/ui/entity-card";

  type FormMode = "create" | "view" | "edit";

  let { children } = $props<{ children: Snippet }>();
  let activeConfig = $state<EntityConfig | undefined>();
  let activeRecord = $state<EntityRecord | undefined>();
  let formMode = $state<FormMode | undefined>();
  let deleting = $state(false);
  let requestPending = $state(false);
  let requestError = $state("");
  let requestEpoch = 0;

  const configKeyByKind: Record<EntityCardKind, EntityConfig["key"]> = {
    pessoa: "pessoas",
    negocio: "negocios",
    projeto: "projetos",
    tarefa: "entregas",
  };

  const createContext: EntityCreateContext = {
    open: (key) => {
      invalidateRequest();
      activeConfig = entityConfigs[key];
      activeRecord = undefined;
      formMode = "create";
      deleting = false;
      requestError = "";
    },
    actOnCard,
  };

  setContext(ENTITY_CREATE_CONTEXT, createContext);

  function invalidateRequest(): void {
    requestEpoch += 1;
    requestPending = false;
  }

  function beginRequest(): number | undefined {
    if (requestPending) return undefined;
    requestEpoch += 1;
    requestPending = true;
    requestError = "";
    return requestEpoch;
  }

  function isCurrentRequest(epoch: number): boolean {
    return epoch === requestEpoch;
  }

  function finishRequest(epoch: number): void {
    if (isCurrentRequest(epoch)) requestPending = false;
  }

  function reset(): void {
    invalidateRequest();
    activeConfig = undefined;
    activeRecord = undefined;
    formMode = undefined;
    deleting = false;
    requestPending = false;
    requestError = "";
  }

  function actOnCard(action: EntityCardAction, item: EntityCardItem): void {
    const config = entityConfigs[configKeyByKind[item.kind]];
    const adapter = getEntityPersistenceAdapter(config.key);
    if (adapter) {
      void actOnPersistedCard(adapter, config, action, item.id);
      return;
    }
    invalidateRequest();
    requestError = "";
    const record = loadEntityRecords(config).find(
      (candidate) => candidate.id === item.id,
    );
    if (!record) return;

    if (action === "archive") {
      archiveEntityRecord(config, record.id);
      return;
    }

    openRecord(config, record, action);
  }

  async function actOnPersistedCard(
    adapter: EntityPersistenceAdapter,
    config: EntityConfig,
    action: EntityCardAction,
    id: string,
  ): Promise<void> {
    const epoch = beginRequest();
    if (epoch === undefined) return;
    try {
      if (action === "archive") {
        await adapter.archive(id);
        return;
      }
      const record = await adapter.load(id);
      if (!isCurrentRequest(epoch)) return;
      openRecord(config, record, action);
    } catch (cause) {
      if (!isCurrentRequest(epoch)) return;
      requestError = entityPersistenceErrorMessage(cause);
    } finally {
      finishRequest(epoch);
    }
  }

  function openRecord(
    config: EntityConfig,
    record: EntityRecord,
    action: EntityCardAction,
  ): void {
    activeConfig = config;
    activeRecord = record;
    deleting = action === "delete";
    formMode =
      action === "view"
        ? "view"
        : action === "edit"
          ? "edit"
          : action === "copy"
            ? "create"
            : undefined;
  }

  async function save(values: Record<string, string>): Promise<void> {
    if (!activeConfig || !formMode) return;
    const adapter = getEntityPersistenceAdapter(activeConfig.key);
    if (adapter) {
      const epoch = beginRequest();
      if (epoch === undefined) return;
      try {
        await adapter.save({
          mode: formMode,
          values,
          current: activeRecord,
        });
        if (!isCurrentRequest(epoch)) return;
        reset();
      } catch (cause) {
        if (!isCurrentRequest(epoch)) return;
        requestError = entityPersistenceErrorMessage(cause);
      } finally {
        finishRequest(epoch);
      }
      return;
    }
    const records = loadEntityRecords(activeConfig);
    const nextRecords =
      formMode === "edit" && activeRecord
        ? records.map((record) =>
            record.id === activeRecord?.id
              ? {
                  ...record,
                  ...values,
                  updatedAt: new Date().toISOString(),
                }
              : record,
          )
        : [createRecord(values, loadActiveWorkspaceId()), ...records];
    saveEntityRecords(activeConfig.key, nextRecords);
    reset();
  }

  async function saveProjectAndOpenTask(
    values: Record<string, string>,
  ): Promise<void> {
    if (activeConfig?.key !== "projetos" || !formMode) return;
    const adapter = getEntityPersistenceAdapter(activeConfig.key);
    if (!adapter) return;
    const epoch = beginRequest();
    if (epoch === undefined) return;
    let project: EntityRecord;
    try {
      project = await adapter.save({
        mode: formMode,
        values,
        current: activeRecord,
      });
      if (!isCurrentRequest(epoch)) return;
    } catch (cause) {
      if (!isCurrentRequest(epoch)) return;
      requestError = entityPersistenceErrorMessage(cause);
      return;
    } finally {
      finishRequest(epoch);
    }

    activeConfig = entityConfigs.entregas;
    activeRecord = {
      id: "",
      createdAt: "",
      updatedAt: "",
      workspaceId: loadActiveWorkspaceId(),
      nome: "",
      negocio: project.negocio,
      negocioId: project.negocioId,
      businessWorkspaceId: project.businessWorkspaceId || project.workspaceId,
      business_workspace_id:
        project.business_workspace_id || project.workspaceId,
      projeto: project.nome,
      projetoId: project.id,
      projectWorkspaceId: project.workspaceId,
      project_workspace_id: project.workspaceId,
      categoria: "",
      prioridade: "",
      status: "",
      descricao: "",
    };
    formMode = "create";
    deleting = false;
  }

  async function archiveActive(): Promise<void> {
    if (!activeConfig || !activeRecord) return;
    const adapter = getEntityPersistenceAdapter(activeConfig.key);
    if (adapter) {
      const epoch = beginRequest();
      if (epoch === undefined) return;
      try {
        await adapter.archive(activeRecord.id, activeRecord);
        if (!isCurrentRequest(epoch)) return;
        reset();
      } catch (cause) {
        if (!isCurrentRequest(epoch)) return;
        requestError = entityPersistenceErrorMessage(cause);
      } finally {
        finishRequest(epoch);
      }
      return;
    }
    archiveEntityRecord(activeConfig, activeRecord.id);
    reset();
  }

  async function confirmDelete(): Promise<void> {
    if (!activeConfig || !activeRecord) return;
    if (getEntityPersistenceAdapter(activeConfig.key)) {
      await archiveActive();
      return;
    }
    const records = loadEntityRecords(activeConfig).filter(
      (record) => record.id !== activeRecord?.id,
    );
    saveEntityRecords(activeConfig.key, records);
    reset();
  }

  function cancelDelete(): void {
    deleting = false;
    if (!formMode) reset();
  }
</script>

{@render children()}

{#if requestError}
  <div class="contact-request-error" role="alert">
    <span>{requestError}</span>
    <button
      type="button"
      aria-label="Fechar mensagem"
      onclick={() => (requestError = "")}>×</button
    >
  </div>
{/if}

{#if activeConfig && formMode}
  {#if activeConfig.key === "entregas"}
    <TaskForm
      config={activeConfig}
      record={activeRecord}
      mode={formMode}
      oncancel={reset}
      onsave={save}
      onedit={() => (formMode = "edit")}
      onarchive={archiveActive}
      ondelete={() => (deleting = true)}
    />
  {:else if activeConfig.key === "projetos"}
    <ProjectForm
      record={activeRecord}
      mode={formMode}
      oncancel={reset}
      onsave={save}
      onedit={() => (formMode = "edit")}
      onarchive={archiveActive}
      ondelete={() => (deleting = true)}
      onaddtask={saveProjectAndOpenTask}
    />
  {:else}
    <EntityForm
      config={activeConfig}
      record={activeRecord}
      mode={formMode}
      oncancel={reset}
      onsave={save}
      onedit={() => (formMode = "edit")}
      onarchive={archiveActive}
      ondelete={() => (deleting = true)}
    />
  {/if}
{/if}

{#if activeConfig && activeRecord && deleting}
  <DeleteConfirmation
    entityName={activeRecord.nome ?? activeConfig.singular}
    oncancel={cancelDelete}
    onarchive={archiveActive}
    onconfirm={confirmDelete}
    softDeleteOnly={activeConfig.key === "pessoas" ||
      activeConfig.key === "negocios" ||
      activeConfig.key === "projetos" ||
      activeConfig.key === "entregas"}
  />
{/if}

<style>
  .contact-request-error {
    position: fixed;
    z-index: 3600;
    right: 20px;
    bottom: 20px;
    display: flex;
    max-width: min(420px, calc(100vw - 40px));
    align-items: center;
    gap: 12px;
    padding: 12px 14px;
    border: 1px solid rgba(220, 38, 38, 0.28);
    border-radius: 12px;
    color: var(--red-700, #b91c1c);
    background: var(--surface);
    box-shadow: 0 18px 42px rgba(15, 23, 42, 0.18);
    font-size: var(--text-sm);
  }
  .contact-request-error button {
    border: 0;
    color: inherit;
    background: transparent;
    font-size: 20px;
  }
</style>
