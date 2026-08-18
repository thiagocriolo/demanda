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
  import { loadActiveWorkspaceId } from "$lib/workspaces/workspace-storage";
  import {
    BusinessApiError,
    archiveBusiness,
    businessToEntityRecord,
    createBusiness,
    entityValuesToBusinessInput,
    getBusiness,
    updateBusiness,
  } from "$lib/businesses/client";
  import {
    ProjectApiError,
    archiveProject,
    createProject,
    createProjectFromService,
    entityValuesToProjectFromServiceInput,
    entityValuesToProjectInput,
    getProject,
    projectToEntityRecord,
    updateProject,
  } from "$lib/projects/client";
  import {
    archiveTask,
    createTask,
    entityValuesToTaskCreateInput,
    getTask,
    TaskApiError,
    taskToEntityRecord,
    taskVersionFromRecord,
    updateTaskFromEntityValues,
  } from "$lib/tasks/client";
  import {
    ContactApiError,
    archiveContact,
    contactToEntityRecord,
    createContact,
    entityValuesToContactInput,
    getContact,
    updateContact,
  } from "$lib/contacts/client";
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
      invalidateContactRequest();
      activeConfig = entityConfigs[key];
      activeRecord = undefined;
      formMode = "create";
      deleting = false;
      requestError = "";
    },
    actOnCard,
  };

  setContext(ENTITY_CREATE_CONTEXT, createContext);

  function invalidateContactRequest(): void {
    requestEpoch += 1;
    requestPending = false;
  }

  function beginContactRequest(): number | undefined {
    if (requestPending) return undefined;
    requestEpoch += 1;
    requestPending = true;
    requestError = "";
    return requestEpoch;
  }

  function isCurrentRequest(epoch: number): boolean {
    return epoch === requestEpoch;
  }

  function finishContactRequest(epoch: number): void {
    if (isCurrentRequest(epoch)) requestPending = false;
  }

  function reset(): void {
    invalidateContactRequest();
    activeConfig = undefined;
    activeRecord = undefined;
    formMode = undefined;
    deleting = false;
    requestPending = false;
    requestError = "";
  }

  function actOnCard(action: EntityCardAction, item: EntityCardItem): void {
    const config = entityConfigs[configKeyByKind[item.kind]];
    if (config.key === "pessoas") {
      void actOnContactCard(action, item.id);
      return;
    }
    if (config.key === "negocios") {
      void actOnBusinessCard(action, item.id);
      return;
    }
    if (config.key === "projetos") {
      void actOnProjectCard(action, item.id);
      return;
    }
    if (config.key === "entregas") {
      void actOnTaskCard(action, item.id);
      return;
    }
    invalidateContactRequest();
    requestError = "";
    const record = loadEntityRecords(config).find(
      (candidate) => candidate.id === item.id,
    );
    if (!record) return;

    if (action === "archive") {
      archiveEntityRecord(config, record.id);
      return;
    }

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

  async function actOnContactCard(
    action: EntityCardAction,
    contactId: string,
  ): Promise<void> {
    const epoch = beginContactRequest();
    if (epoch === undefined) return;
    try {
      if (action === "archive") {
        await archiveContact(contactId);
        return;
      }
      const record = contactToEntityRecord(await getContact(contactId));
      if (!isCurrentRequest(epoch)) return;
      activeConfig = entityConfigs.pessoas;
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
    } catch (cause) {
      if (!isCurrentRequest(epoch)) return;
      requestError = serverErrorMessage(cause);
    } finally {
      finishContactRequest(epoch);
    }
  }

  async function actOnBusinessCard(
    action: EntityCardAction,
    businessId: string,
  ): Promise<void> {
    const epoch = beginContactRequest();
    if (epoch === undefined) return;
    try {
      if (action === "archive") {
        await archiveBusiness(businessId);
        return;
      }
      const record = businessToEntityRecord(await getBusiness(businessId));
      if (!isCurrentRequest(epoch)) return;
      activeConfig = entityConfigs.negocios;
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
    } catch (cause) {
      if (!isCurrentRequest(epoch)) return;
      requestError = serverErrorMessage(cause);
    } finally {
      finishContactRequest(epoch);
    }
  }

  async function actOnProjectCard(
    action: EntityCardAction,
    projectId: string,
  ): Promise<void> {
    const epoch = beginContactRequest();
    if (epoch === undefined) return;
    try {
      if (action === "archive") {
        await archiveProject(projectId);
        return;
      }
      const record = projectToEntityRecord(await getProject(projectId));
      if (!isCurrentRequest(epoch)) return;
      activeConfig = entityConfigs.projetos;
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
    } catch (cause) {
      if (!isCurrentRequest(epoch)) return;
      requestError = serverErrorMessage(cause);
    } finally {
      finishContactRequest(epoch);
    }
  }

  async function actOnTaskCard(
    action: EntityCardAction,
    taskId: string,
  ): Promise<void> {
    const epoch = beginContactRequest();
    if (epoch === undefined) return;
    try {
      const task = await getTask(taskId);
      if (action === "archive") {
        await archiveTask(taskId, task.version);
        return;
      }
      const record = taskToEntityRecord(task);
      if (!isCurrentRequest(epoch)) return;
      activeConfig = entityConfigs.entregas;
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
    } catch (cause) {
      if (!isCurrentRequest(epoch)) return;
      requestError = serverErrorMessage(cause);
    } finally {
      finishContactRequest(epoch);
    }
  }

  async function save(values: Record<string, string>): Promise<void> {
    if (!activeConfig || !formMode) return;
    if (activeConfig.key === "pessoas") {
      const epoch = beginContactRequest();
      if (epoch === undefined) return;
      try {
        const input = entityValuesToContactInput(values, activeRecord, {
          copy: formMode === "create" && Boolean(activeRecord),
        });
        if (formMode === "edit" && activeRecord) {
          await updateContact(activeRecord.id, input);
        } else {
          await createContact(input);
        }
        if (!isCurrentRequest(epoch)) return;
        reset();
      } catch (cause) {
        if (!isCurrentRequest(epoch)) return;
        requestError = serverErrorMessage(cause);
      } finally {
        finishContactRequest(epoch);
      }
      return;
    }
    if (activeConfig.key === "negocios") {
      const epoch = beginContactRequest();
      if (epoch === undefined) return;
      try {
        const input = entityValuesToBusinessInput(values, activeRecord);
        if (formMode === "edit" && activeRecord) {
          await updateBusiness(activeRecord.id, input);
        } else {
          await createBusiness(input);
        }
        if (!isCurrentRequest(epoch)) return;
        reset();
      } catch (cause) {
        if (!isCurrentRequest(epoch)) return;
        requestError = serverErrorMessage(cause);
      } finally {
        finishContactRequest(epoch);
      }
      return;
    }
    if (activeConfig.key === "projetos") {
      const epoch = beginContactRequest();
      if (epoch === undefined) return;
      try {
        if (formMode === "edit" && activeRecord) {
          await updateProject(
            activeRecord.id,
            entityValuesToProjectInput(values, activeRecord),
          );
        } else if (values.sourceServiceId) {
          await createProjectFromService(
            entityValuesToProjectFromServiceInput(values, activeRecord),
          );
        } else {
          await createProject(entityValuesToProjectInput(values, activeRecord));
        }
        if (!isCurrentRequest(epoch)) return;
        reset();
      } catch (cause) {
        if (!isCurrentRequest(epoch)) return;
        requestError = serverErrorMessage(cause);
      } finally {
        finishContactRequest(epoch);
      }
      return;
    }
    if (activeConfig.key === "entregas") {
      const epoch = beginContactRequest();
      if (epoch === undefined) return;
      try {
        if (formMode === "edit" && activeRecord) {
          await updateTaskFromEntityValues(
            activeRecord.id,
            values,
            activeRecord,
          );
        } else {
          await createTask(
            entityValuesToTaskCreateInput(values, activeRecord, {
              copy: formMode === "create" && Boolean(activeRecord?.id),
            }),
          );
        }
        if (!isCurrentRequest(epoch)) return;
        reset();
      } catch (cause) {
        if (!isCurrentRequest(epoch)) return;
        requestError = serverErrorMessage(cause);
      } finally {
        finishContactRequest(epoch);
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
    const epoch = beginContactRequest();
    if (epoch === undefined) return;
    let project: EntityRecord;
    try {
      const result =
        formMode === "edit" && activeRecord
          ? await updateProject(
              activeRecord.id,
              entityValuesToProjectInput(values, activeRecord),
            )
          : values.sourceServiceId
            ? await createProjectFromService(
                entityValuesToProjectFromServiceInput(values, activeRecord),
              )
            : await createProject(
                entityValuesToProjectInput(values, activeRecord),
              );
      if (!isCurrentRequest(epoch)) return;
      project = projectToEntityRecord(result);
    } catch (cause) {
      if (!isCurrentRequest(epoch)) return;
      requestError = serverErrorMessage(cause);
      return;
    } finally {
      finishContactRequest(epoch);
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
    if (activeConfig.key === "pessoas") {
      const epoch = beginContactRequest();
      if (epoch === undefined) return;
      try {
        await archiveContact(activeRecord.id);
        if (!isCurrentRequest(epoch)) return;
        reset();
      } catch (cause) {
        if (!isCurrentRequest(epoch)) return;
        requestError = serverErrorMessage(cause);
      } finally {
        finishContactRequest(epoch);
      }
      return;
    }
    if (activeConfig.key === "negocios") {
      const epoch = beginContactRequest();
      if (epoch === undefined) return;
      try {
        await archiveBusiness(activeRecord.id);
        if (!isCurrentRequest(epoch)) return;
        reset();
      } catch (cause) {
        if (!isCurrentRequest(epoch)) return;
        requestError = serverErrorMessage(cause);
      } finally {
        finishContactRequest(epoch);
      }
      return;
    }
    if (activeConfig.key === "projetos") {
      const epoch = beginContactRequest();
      if (epoch === undefined) return;
      try {
        await archiveProject(activeRecord.id);
        if (!isCurrentRequest(epoch)) return;
        reset();
      } catch (cause) {
        if (!isCurrentRequest(epoch)) return;
        requestError = serverErrorMessage(cause);
      } finally {
        finishContactRequest(epoch);
      }
      return;
    }
    if (activeConfig.key === "entregas") {
      const epoch = beginContactRequest();
      if (epoch === undefined) return;
      try {
        await archiveTask(activeRecord.id, taskVersionFromRecord(activeRecord));
        if (!isCurrentRequest(epoch)) return;
        reset();
      } catch (cause) {
        if (!isCurrentRequest(epoch)) return;
        requestError = serverErrorMessage(cause);
      } finally {
        finishContactRequest(epoch);
      }
      return;
    }
    archiveEntityRecord(activeConfig, activeRecord.id);
    reset();
  }

  async function confirmDelete(): Promise<void> {
    if (!activeConfig || !activeRecord) return;
    if (
      activeConfig.key === "pessoas" ||
      activeConfig.key === "negocios" ||
      activeConfig.key === "projetos" ||
      activeConfig.key === "entregas"
    ) {
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

  function serverErrorMessage(cause: unknown): string {
    return cause instanceof ContactApiError ||
      cause instanceof BusinessApiError ||
      cause instanceof ProjectApiError ||
      cause instanceof TaskApiError
      ? cause.message
      : "Não foi possível concluir a operação solicitada.";
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
