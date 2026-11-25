<script lang="ts">
  import {
    listAllActiveContracts,
    type Contract,
  } from "$lib/contracts/client";
  import {
    getProjectOptions,
    ProjectApiError,
    projectRelationsFromRecord,
    setProjectActive,
  } from "$lib/projects/client";
  import type {
    ProjectOptions,
    ProjectTag,
  } from "$lib/projects/types";
  import { recordPageHref } from "$lib/records/record-page";
  import {
    currentSettings,
    loadSettingsFromServer,
  } from "$lib/settings/client";
  import { listAllDeliveries, DeliveryApiError } from "$lib/deliveries/client";
  import GlobalSelector, {
    type GlobalSelectorItem,
  } from "$lib/ui/GlobalSelector.svelte";
  import {
    loadWorkspaces,
    refreshWorkspaceSnapshot,
    type Workspace,
  } from "$lib/workspaces/workspace-storage";
  import {
    Archive,
    BriefcaseBusiness,
    CalendarCheck2,
    CalendarDays,
    FileText,
    Flag,
    FolderKanban,
    ListChecks,
    Pencil,
    Plus,
    Repeat,
    Save,
    Tags,
    Trash2,
    X,
  } from "@lucide/svelte";
  import { onMount, tick } from "svelte";
  import {
    dateInputCaretPosition,
    formatDateForDisplay,
    formatDateInput,
    normalizeDateInput,
  } from "./date-format";
  import type { EntityRecord } from "./types";

  type ProjectFormMode = "create" | "view" | "edit";

  type ProjectDeliveryDraft = {
    id: string;
    name: string;
    status: string;
    archivedAt: string | null;
  };

  type ProjectFormState = {
    nome: string;
    contractId: string;
    contractName: string;
    contractType: "one_off" | "recurring";
    negocioId: string;
    negocio: string;
    status: string;
    dataInicio: string;
    dataFim: string;
    briefing: string;
    deliveries: ProjectDeliveryDraft[];
  };

  let {
    record,
    mode,
    oncancel,
    onsave,
    onedit,
    onarchive,
    ondelete,
    onadddelivery,
  } = $props<{
    record?: EntityRecord;
    mode?: ProjectFormMode;
    oncancel: () => void;
    onsave: (values: Record<string, string>) => void;
    onedit?: () => void;
    onarchive?: () => void;
    ondelete?: () => void;
    onadddelivery?: (values: Record<string, string>) => void;
  }>();

  let formNode: HTMLFormElement | undefined;
  let startDateInput: HTMLInputElement | undefined;
  let endDateInput: HTMLInputElement | undefined;
  let selectedTags = $state<GlobalSelectorItem[]>([]);
  let currentTagRelations = $state<ProjectTag[]>([]);
  let projectOptions = $state<ProjectOptions>();
  let optionsWorkspaceId = $state("");
  let optionsLoading = $state(false);
  let optionsError = $state("");
  let optionsRequest: AbortController | undefined;
  let validationError = $state("");
  let workspaces = $state<Workspace[]>([]);
  let contracts = $state<Contract[]>([]);
  let contractsLoading = $state(true);
  let contractsError = $state("");
  let contractsRequest: AbortController | undefined;
  let projectDeliveriesLoading = $state(false);
  let projectDeliveriesError = $state("");
  let projectDeliveriesRequest: AbortController | undefined;
  let statusOptions = $state<{ key: string; label: string }[]>([]);
  let resolvedMode = $derived(mode ?? (record ? "edit" : "create"));
  let viewOnly = $derived(resolvedMode === "view");
  let institutionalProject = $derived(record?.isInstitutional === "true");
  let title = $derived(
    resolvedMode === "view"
      ? "Ver projeto"
      : resolvedMode === "edit"
        ? "Editar projeto"
        : "Novo projeto",
  );
  let recordHref = $derived(
    record?.id ? recordPageHref("projeto", record.id) : undefined,
  );
  let modalTitle = $derived(viewOnly && record?.nome ? record.nome : title);
  let projectActive = $state(true);
  let visibilityUpdating = $state(false);

  let form = $state<ProjectFormState>(projectFromRecord());
  let hasOpenDeliveries = $derived(
    form.deliveries.some(
      (delivery) =>
        !delivery.archivedAt && delivery.status !== "conclusao",
    ),
  );
  let frequencyLocked = $derived(
    resolvedMode === "edit" &&
      (hasOpenDeliveries ||
        projectDeliveriesLoading ||
        Boolean(projectDeliveriesError)),
  );
  let workspaceNames = $derived(
    new Map(workspaces.map((workspace) => [workspace.id, workspace.name])),
  );
  let selectedContract = $derived(
    contracts.find(({ id }) => id === form.contractId),
  );
  let activeOptionsWorkspaceId = $derived(
    resolvedMode === "create"
      ? (selectedContract?.workspaceId ?? "")
      : (record?.workspaceId ?? selectedContract?.workspaceId ?? ""),
  );
  let contractItems = $derived.by((): GlobalSelectorItem[] => {
    const showWorkspace = workspaces.length > 1;
    const items: GlobalSelectorItem[] = contracts.map((contract) => {
      const workspaceName = showWorkspace
        ? workspaceNames.get(contract.workspaceId)
        : undefined;
      return {
        id: contract.id,
        label: contract.name,
        description: workspaceName
          ? `${contract.business.name} · ${workspaceName}`
          : contract.business.name,
        updatedAt: contract.updatedAt,
      };
    });
    if (
      resolvedMode !== "create" &&
      form.contractId &&
      !items.some(({ id }) => id === form.contractId)
    ) {
      items.push({
        id: form.contractId,
        label: form.contractName || "Contrato vinculado",
        description: form.negocio || undefined,
      });
    }
    return items;
  });
  let tagItems = $derived(
    selectorItemsForTags(projectOptions?.tags ?? [], currentTagRelations),
  );

  function closeBeforePageNavigation(event: MouseEvent): void {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)
      return;
    oncancel();
  }

  async function toggleProjectVisibility(): Promise<void> {
    if (!record || institutionalProject || visibilityUpdating) return;
    visibilityUpdating = true;
    try {
      const project = await setProjectActive(record.id, !projectActive);
      projectActive = project.isActive;
    } catch (cause) {
      validationError =
        cause instanceof ProjectApiError
          ? cause.message
          : "Não foi possível atualizar a visibilidade do projeto.";
    } finally {
      visibilityUpdating = false;
    }
  }

  function applyProjectStatuses(
    settings: ReturnType<typeof currentSettings>,
  ): void {
    statusOptions = settings.projectStatuses.map(({ key, label }) => ({
      key,
      label,
    }));

    if (!statusOptions.some(({ key }) => key === form.status)) {
      statusOptions = [
        ...statusOptions,
        {
          key: form.status,
          label:
            {
              andamento: "Em andamento",
              pausado: "Pausado",
            }[form.status] ?? form.status,
        },
      ];
    }
  }

  onMount(() => {
    form = projectFromRecord(record);
    projectActive = record?.isActive !== "false";
    const relations = projectRelationsFromRecord(record);
    currentTagRelations = relations.tags;
    selectedTags = tagSelections(relations.tags);

    workspaces = loadWorkspaces();
    if (!workspaces.length) {
      void refreshWorkspaceSnapshot()
        .then((items) => {
          workspaces = items;
        })
        .catch(() => undefined);
    }

    void loadContracts();
    void loadRelatedDeliveries();
    if (resolvedMode !== "create" && record?.workspaceId) {
      void loadOptions(record.workspaceId);
    }
    applyProjectStatuses(currentSettings());
    void loadSettingsFromServer()
      .then(applyProjectStatuses)
      .catch(() => undefined);

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    void tick().then(() => {
      if (!viewOnly) {
        formNode
          ?.querySelector<HTMLInputElement>('input[name="nome"]')
          ?.focus();
      }
    });

    return () => {
      contractsRequest?.abort();
      optionsRequest?.abort();
      projectDeliveriesRequest?.abort();
      document.body.style.overflow = previousOverflow;
    };
  });

  async function loadRelatedDeliveries(): Promise<void> {
    if (!record?.id) {
      form.deliveries = [];
      return;
    }
    projectDeliveriesRequest?.abort();
    const request = new AbortController();
    projectDeliveriesRequest = request;
    projectDeliveriesLoading = true;
    projectDeliveriesError = "";
    try {
      const relatedDeliveries = await listAllDeliveries({
        workspaceId: record.workspaceId || undefined,
        projectId: record.id,
        archived: "include",
        includeInactiveProjects: true,
        signal: request.signal,
      });
      if (request.signal.aborted) return;
      form.deliveries = relatedDeliveries.map((delivery) => ({
        id: delivery.id,
        name: delivery.name,
        status: delivery.status,
        archivedAt: delivery.archivedAt,
      }));
    } catch (cause) {
      if (request.signal.aborted) return;
      form.deliveries = [];
      projectDeliveriesError =
        cause instanceof DeliveryApiError
          ? cause.message
          : "Não foi possível carregar as entregas do projeto.";
    } finally {
      if (projectDeliveriesRequest === request) projectDeliveriesLoading = false;
    }
  }

  function uniqueSelectorItems(
    items: GlobalSelectorItem[],
  ): GlobalSelectorItem[] {
    return items.filter(
      (item, index) =>
        Boolean(item.label.trim()) &&
        items.findIndex((candidate) => candidate.id === item.id) === index,
    );
  }

  function tagItem(tag: ProjectTag): GlobalSelectorItem {
    return {
      id: tag.id,
      label: tag.name,
      description: tag.archivedAt ? "Tag arquivada" : undefined,
    };
  }

  function selectorItemsForTags(
    tags: ProjectTag[],
    current: ProjectTag[],
  ): GlobalSelectorItem[] {
    return uniqueSelectorItems([
      ...tags.filter(({ archivedAt }) => !archivedAt).map(tagItem),
      ...current.map(tagItem),
    ]);
  }

  function tagSelections(tags: ProjectTag[]): GlobalSelectorItem[] {
    return tags.map(tagItem);
  }

  async function loadContracts(): Promise<void> {
    contractsRequest?.abort();
    const request = new AbortController();
    contractsRequest = request;
    contractsLoading = true;
    contractsError = "";
    try {
      contracts = await listAllActiveContracts({
        signal: request.signal,
      });
      if (contractsRequest !== request) return;
      const selected = contracts.find(({ id }) => id === form.contractId);
      if (selected) {
        form.contractName = selected.name;
        form.negocioId = selected.business.id;
        form.negocio = selected.business.name;
        if (resolvedMode === "create") {
          void loadOptions(selected.workspaceId);
        }
      } else if (resolvedMode === "create" && form.contractId) {
        form.contractId = "";
        form.contractName = "";
      }
    } catch (cause) {
      if (cause instanceof Error && cause.name === "AbortError") return;
      if (contractsRequest !== request) return;
      contractsError = "Não foi possível carregar os contratos.";
    } finally {
      if (contractsRequest === request) contractsLoading = false;
    }
  }

  async function loadOptions(workspaceId: string): Promise<void> {
    if (!workspaceId) return;
    optionsRequest?.abort();
    const request = new AbortController();
    optionsRequest = request;
    optionsWorkspaceId = workspaceId;
    optionsLoading = true;
    optionsError = "";

    try {
      const options = await getProjectOptions({
        workspaceId,
        signal: request.signal,
      });
      if (optionsRequest !== request) return;
      projectOptions = options;
      const tags = selectorItemsForTags(options.tags, currentTagRelations);
      selectedTags = selectedTags.flatMap((selected) => {
        const item = tags.find(({ id }) => id === selected.id);
        return item ? [item] : [selected];
      });
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") return;
      if (optionsRequest !== request) return;
      optionsError =
        error instanceof ProjectApiError
          ? error.message
          : "Não foi possível carregar as tags. Tente novamente.";
    } finally {
      if (optionsRequest === request) optionsLoading = false;
    }
  }

  function first(record: EntityRecord | undefined, ...keys: string[]): string {
    for (const key of keys) {
      const value = record?.[key];
      if (typeof value === "string" && value.trim()) return value;
    }
    return "";
  }

  function displayDate(value: string): string {
    return formatDateForDisplay(value);
  }

  function projectContractType(record?: EntityRecord): "one_off" | "recurring" {
    const raw = first(
      record,
      "contractType",
      "contract_type",
      "tipoContrato",
    ).toLocaleLowerCase("pt-BR");
    return raw === "recurring" || raw === "recorrente"
      ? "recurring"
      : "one_off";
  }

  function projectFromRecord(record?: EntityRecord): ProjectFormState {
    return {
      nome: first(record, "nome", "name"),
      contractId: first(record, "contractId"),
      contractName: first(record, "contractName"),
      contractType: projectContractType(record),
      negocioId: first(record, "negocioId", "business_id"),
      negocio: first(record, "negocio", "business_name", "cliente"),
      status: first(record, "status") || "planejamento",
      dataInicio: displayDate(first(record, "dataInicio", "start_date")),
      dataFim: displayDate(first(record, "dataFim", "delivery_date", "prazo")),
      briefing: first(record, "briefing", "description", "descricao"),
      deliveries: [],
    };
  }

  function selectContract(id: string): void {
    form.contractId = id;
    const contract = contracts.find((item) => item.id === id);
    if (contract) {
      form.contractName = contract.name;
      form.negocioId = contract.business.id;
      form.negocio = contract.business.name;
      if (contract.workspaceId !== optionsWorkspaceId) {
        projectOptions = undefined;
        void loadOptions(contract.workspaceId);
      }
    } else {
      form.contractName = "";
      form.negocioId = "";
      form.negocio = "";
      optionsWorkspaceId = "";
      optionsError = "";
      optionsLoading = false;
      projectOptions = undefined;
    }
  }

  function normalizeDate(value: string): string | null {
    return normalizeDateInput(value);
  }

  function handleDateInput(
    event: Event,
    field: "dataInicio" | "dataFim",
  ): void {
    const input = event.currentTarget as HTMLInputElement;
    const rawValue = input.value;
    const rawCaret = input.selectionStart;
    const masked = formatDateInput(rawValue);
    if (input.value !== masked) {
      input.value = masked;
      const nextCaret = dateInputCaretPosition(rawValue, rawCaret, masked);
      input.setSelectionRange(nextCaret, nextCaret);
    }
    form[field] = masked;
    input.setCustomValidity("");
    validationError = "";
  }

  function handleDatePickerChange(
    event: Event,
    field: "dataInicio" | "dataFim",
  ): void {
    const iso = (event.currentTarget as HTMLInputElement).value;
    form[field] = displayDate(iso);
    validationError = "";
    if (field === "dataInicio") {
      startDateInput?.setCustomValidity("");
    } else {
      endDateInput?.setCustomValidity("");
    }
  }

  function openDatePicker(event: MouseEvent): void {
    (event.currentTarget as HTMLInputElement).showPicker?.();
  }

  function validateDate(
    input: HTMLInputElement | undefined,
    value: string,
    label: string,
  ): string | null {
    const normalized = normalizeDate(value);
    input?.setCustomValidity("");
    if (normalized !== null) return normalized;
    const message = `Informe ${label.toLocaleLowerCase("pt-BR")} no formato dd/mm/aaaa.`;
    validationError = message;
    input?.setCustomValidity(message);
    input?.reportValidity();
    input?.focus();
    return null;
  }

  function submit(event: SubmitEvent): void {
    event.preventDefault();
    if (viewOnly || !formNode) return;
    validationError = "";

    const contract = contracts.find(({ id }) => id === form.contractId);
    if (resolvedMode === "create" && !contract) {
      validationError = "Selecione um contrato válido.";
      return;
    }
    if (optionsLoading || optionsError) {
      validationError = optionsError || "Aguarde o carregamento das tags.";
      return;
    }

    const startDate = validateDate(
      startDateInput,
      form.dataInicio,
      "Data de início",
    );
    if (startDate === null) return;
    const endDate = validateDate(endDateInput, form.dataFim, "Data de fim");
    if (endDate === null) return;

    if (!formNode.reportValidity()) return;

    const savedStartDate =
      startDate ||
      (resolvedMode === "create" ? new Date().toISOString().slice(0, 10) : "");
    const contractId = contract?.id ?? form.contractId;
    const contractName = contract?.name ?? form.contractName;
    const businessId = contract?.business.id ?? form.negocioId;
    const businessName = contract?.business.name ?? form.negocio;
    const tagLabels = selectedTags.map(({ label }) => label);
    const effectiveContractType =
      resolvedMode === "edit" && frequencyLocked
        ? projectContractType(record)
        : form.contractType;

    const values: Record<string, string> = {
      nome: form.nome.trim(),
      name: form.nome.trim(),
      ...(resolvedMode === "create" ? { serviceIds: "[]" } : {}),
      contractId,
      contractName,
      contractType: effectiveContractType,
      contract_type: effectiveContractType,
      tipoContrato:
        effectiveContractType === "recurring" ? "Recorrente" : "Pontual",
      negocioId: businessId,
      business_id: businessId,
      negocio: businessName,
      business_name: businessName,
      status: form.status,
      dataInicio: savedStartDate,
      start_date: savedStartDate,
      dataFim: endDate,
      delivery_date: endDate,
      prazo: endDate,
      briefing: form.briefing.trim(),
      description: form.briefing.trim(),
      descricao: form.briefing.trim(),
      tags: tagLabels.join(", "),
      tagLabels: JSON.stringify(tagLabels),
      responsibleUserIds: "[]",
      is_institutional: "0",
    };
    const addDeliveryAfterSave =
      (event.submitter as HTMLElement | null)?.dataset.action === "add-delivery";
    if (addDeliveryAfterSave && onadddelivery) onadddelivery(values);
    else onsave(values);
  }
</script>

<div
  class="backdrop"
  role="presentation"
  onclick={(event) => event.target === event.currentTarget && oncancel()}
>
  <div
    class="dialog"
    role="dialog"
    aria-modal="true"
    aria-labelledby="project-form-title"
  >
    <header>
      <h2 id="project-form-title">
        {#if viewOnly && recordHref}
          <a
            class="record-page-link"
            href={recordHref}
            onclick={closeBeforePageNavigation}>{modalTitle}</a
          >
        {:else}
          {modalTitle}
        {/if}
      </h2>
      <div class="header-actions">
        {#if record && !institutionalProject}
          <button
            class:active={projectActive}
            class="project-visibility-toggle"
            type="button"
            role="switch"
            aria-checked={projectActive}
            aria-label={`Exibição do projeto: ${projectActive ? "On" : "Off"}`}
            disabled={visibilityUpdating}
            onclick={() => void toggleProjectVisibility()}
          >
            <span>{projectActive ? "On" : "Off"}</span><i aria-hidden="true"
            ></i>
          </button>
        {/if}
        <button
          class="close"
          type="button"
          aria-label="Fechar"
          onclick={oncancel}
        >
          <X size={18} strokeWidth={2} />
        </button>
      </div>
    </header>

    <div class="body">
      <form class:view-mode={viewOnly} bind:this={formNode} onsubmit={submit}>
        {#if validationError}
          <div class="notice" role="alert">{validationError}</div>
        {/if}

        <section class="section" aria-labelledby="project-about-title">
          <h3 id="project-about-title">Sobre</h3>
          <div class="about-grid">
            <div class="field full">
              <div class="control">
                <span class="control-icon" aria-hidden="true">
                  <FolderKanban size={15} strokeWidth={1.8} />
                </span>
                <input
                  name="nome"
                  maxlength="140"
                  required
                  disabled={viewOnly}
                  aria-label="Nome do projeto"
                  placeholder="Título do projeto"
                  bind:value={form.nome}
                />
              </div>
            </div>

            <div class="field full two-column-grid">
              <div class="field">
                <GlobalSelector
                  items={contractItems}
                  bind:value={form.contractId}
                  presentation="search"
                  selection="single"
                  label="Contrato"
                  placeholder={contractsLoading
                    ? "Carregando contratos..."
                    : "Selecione o contrato"}
                  emptyMessage="Nenhum contrato encontrado."
                  icon={BriefcaseBusiness}
                  controlIcon={BriefcaseBusiness}
                  required={resolvedMode === "create"}
                  disabled={viewOnly ||
                    resolvedMode !== "create" ||
                    contractsLoading ||
                    Boolean(contractsError)}
                  onchange={selectContract}
                />
                {#if contractsLoading}
                  <p class="catalog-state" aria-live="polite">
                    Carregando contratos...
                  </p>
                {:else if contractsError}
                  <div class="catalog-error" role="alert">
                    <span>{contractsError}</span>
                    <button type="button" onclick={() => void loadContracts()}>
                      Tentar novamente
                    </button>
                  </div>
                {/if}
              </div>

              <div class="field">
                <div
                  class="control"
                  class:control--disabled={!viewOnly && frequencyLocked}
                >
                  <span class="control-icon" aria-hidden="true">
                    <Repeat size={15} strokeWidth={1.8} />
                  </span>
                  <select
                    name="contractType"
                    disabled={viewOnly || frequencyLocked}
                    aria-label="Frequência do projeto"
                    title={hasOpenDeliveries
                      ? "Não é possível alterar a frequência enquanto houver entregas em aberto."
                      : undefined}
                    bind:value={form.contractType}
                  >
                    <option value="one_off">Pontual</option>
                    <option value="recurring">Recorrente</option>
                  </select>
                </div>
                {#if resolvedMode === "edit" && hasOpenDeliveries}
                  <p class="catalog-state">
                    Frequência bloqueada enquanto houver entregas em aberto.
                  </p>
                {/if}
              </div>
            </div>

            <div class="field">
              <div class="control">
                <span class="control-icon" aria-hidden="true">
                  <Flag size={15} strokeWidth={1.8} />
                </span>
                <select
                  name="status"
                  disabled={viewOnly}
                  aria-label="Status"
                  bind:value={form.status}
                >
                  {#each statusOptions as status (status.key)}
                    <option value={status.key}>{status.label}</option>
                  {/each}
                </select>
              </div>
            </div>

            <div class="field">
              <div class="control date-control">
                <span class="control-icon" aria-hidden="true">
                  <CalendarDays size={15} strokeWidth={1.8} />
                </span>
                <input
                  class="date-picker"
                  type="date"
                  tabindex="-1"
                  disabled={viewOnly}
                  value={normalizeDate(form.dataInicio) || ""}
                  aria-label="Abrir calendário para a data de início"
                  onclick={openDatePicker}
                  onchange={(event) =>
                    handleDatePickerChange(event, "dataInicio")}
                />
                <input
                  bind:this={startDateInput}
                  type="text"
                  name="dataInicio"
                  inputmode="numeric"
                  autocomplete="off"
                  maxlength="10"
                  disabled={viewOnly}
                  aria-label="Data de início (dd/mm/aaaa)"
                  placeholder="Data de início"
                  value={form.dataInicio}
                  oninput={(event) => handleDateInput(event, "dataInicio")}
                />
              </div>
            </div>

            <div class="field">
              <div class="control date-control">
                <span class="control-icon" aria-hidden="true">
                  <CalendarCheck2 size={15} strokeWidth={1.8} />
                </span>
                <input
                  class="date-picker"
                  type="date"
                  tabindex="-1"
                  disabled={viewOnly}
                  value={normalizeDate(form.dataFim) || ""}
                  aria-label="Abrir calendário para a data de fim"
                  onclick={openDatePicker}
                  onchange={(event) => handleDatePickerChange(event, "dataFim")}
                />
                <input
                  bind:this={endDateInput}
                  type="text"
                  name="dataFim"
                  inputmode="numeric"
                  autocomplete="off"
                  maxlength="10"
                  disabled={viewOnly}
                  aria-label="Data de fim (dd/mm/aaaa)"
                  placeholder="Data de fim"
                  value={form.dataFim}
                  oninput={(event) => handleDateInput(event, "dataFim")}
                />
              </div>
            </div>

            <div class="field full">
              <div class="control textarea-control">
                <span class="control-icon" aria-hidden="true">
                  <FileText size={15} strokeWidth={1.8} />
                </span>
                <textarea
                  name="briefing"
                  rows="5"
                  maxlength="1600"
                  disabled={viewOnly}
                  aria-label="Briefing"
                  placeholder="Briefing"
                  bind:value={form.briefing}></textarea>
              </div>
            </div>

            <div class="field full">
              <GlobalSelector
                items={tagItems}
                bind:selected={selectedTags}
                presentation="search"
                selection="multiple"
                label="Tags"
                placeholder={resolvedMode === "create" &&
                !activeOptionsWorkspaceId
                  ? "Selecione um contrato para escolher as tags"
                  : optionsLoading
                    ? "Carregando tags..."
                    : "Selecione as tags"}
                emptyMessage="Nenhuma tag disponível neste workspace."
                icon={Tags}
                controlIcon={Tags}
                showHelper
                helperMessage="Você pode selecionar mais de uma tag."
                disabled={viewOnly ||
                  !activeOptionsWorkspaceId ||
                  optionsLoading ||
                  Boolean(optionsError)}
              />
              {#if optionsLoading}
                <p class="catalog-state" role="status">Carregando tags…</p>
              {:else if optionsError}
                <div class="catalog-error" role="alert">
                  <span>{optionsError}</span>
                  <button
                    type="button"
                    onclick={() => void loadOptions(activeOptionsWorkspaceId)}
                  >
                    Tentar novamente
                  </button>
                </div>
              {/if}
            </div>
          </div>
        </section>

        <section
          class="section delivery-section"
          aria-labelledby="project-deliveries-title"
        >
          <div class="section-head">
            <h3 id="project-deliveries-title" class="title-with-icon">
              <ListChecks size={17} strokeWidth={1.8} aria-hidden="true" />
              <span>Entregas</span>
            </h3>
            <div class="delivery-actions">
              <span class="count" aria-label={`${form.deliveries.length} entregas`}>
                {form.deliveries.length}
              </span>
              {#if !viewOnly && onadddelivery}
                <button class="add-delivery" type="submit" data-action="add-delivery">
                  <Plus size={16} strokeWidth={2} />
                  <span>Adicionar entrega</span>
                </button>
              {/if}
            </div>
          </div>

          <p class="delivery-note">
            As entregas são carregadas do servidor e só podem ser alteradas na
            área de entregas.
          </p>

          <div class="delivery-list" aria-live="polite">
            {#if projectDeliveriesLoading}
              <div class="delivery-empty">Carregando entregas…</div>
            {:else if projectDeliveriesError}
              <div class="delivery-empty" role="alert">
                {projectDeliveriesError}
                <button type="button" onclick={() => void loadRelatedDeliveries()}>
                  Tentar novamente
                </button>
              </div>
            {:else if form.deliveries.length}
              {#each form.deliveries as delivery (delivery.id)}
                <div class="delivery-row">
                  <ListChecks size={15} strokeWidth={1.8} aria-hidden="true" />
                  <input
                    data-delivery-id={delivery.id}
                    maxlength="140"
                    disabled
                    aria-label="Nome da entrega"
                    placeholder="Nome da entrega"
                    value={delivery.name}
                  />
                </div>
              {/each}
            {:else}
              <div class="delivery-empty">Sem entregas neste projeto.</div>
            {/if}
          </div>
        </section>

        <div class="actions">
          {#if resolvedMode === "view"}
            <div class="action-group action-group-right">
              <button
                class="primary"
                type="button"
                disabled={!onedit || institutionalProject}
                onclick={() => onedit?.()}
              >
                <Pencil size={16} strokeWidth={2} />
                <span>Editar</span>
              </button>
              <button
                class="archive"
                type="button"
                disabled={!onarchive || institutionalProject}
                onclick={() => onarchive?.()}
              >
                <Archive size={16} strokeWidth={2} />
                <span>Arquivar</span>
              </button>
            </div>
          {:else if resolvedMode === "edit"}
            <div class="action-group">
              <button
                class="danger"
                type="button"
                disabled={!ondelete || institutionalProject}
                onclick={() => ondelete?.()}
              >
                <Trash2 size={16} strokeWidth={2} />
                <span>Excluir</span>
              </button>
              <button
                class="archive"
                type="button"
                disabled={!onarchive || institutionalProject}
                onclick={() => onarchive?.()}
              >
                <Archive size={16} strokeWidth={2} />
                <span>Arquivar</span>
              </button>
            </div>
            <div class="action-group action-group-right">
              <button class="cancel" type="button" onclick={oncancel}>
                <X size={16} strokeWidth={2} />
                <span>Cancelar</span>
              </button>
              <button class="success" type="submit">
                <Save size={16} strokeWidth={2} />
                <span>Salvar</span>
              </button>
            </div>
          {:else}
            <div class="action-group action-group-right">
              <button class="cancel" type="button" onclick={oncancel}>
                <X size={16} strokeWidth={2} />
                <span>Cancelar</span>
              </button>
              <button class="success" type="submit">
                <Save size={16} strokeWidth={2} />
                <span>Criar projeto</span>
              </button>
            </div>
          {/if}
        </div>
      </form>
    </div>
  </div>
</div>

<svelte:window onkeydown={(event) => event.key === "Escape" && oncancel()} />

<style>
  .backdrop {
    position: fixed;
    z-index: 3200;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 20px;
    background: rgba(15, 23, 42, 0.52);
    inset: 0;
    animation: fade-in var(--motion-fast) ease-out;
  }

  .dialog {
    position: relative;
    z-index: 1;
    display: grid;
    grid-template-rows: auto minmax(0, 1fr);
    width: min(920px, 100%);
    max-height: min(88dvh, 980px);
    overflow: hidden;
    border: 1px solid var(--border);
    border-radius: 20px;
    background: var(--canvas);
    box-shadow: 0 22px 48px rgba(15, 23, 42, 0.18);
    animation: rise var(--motion-base) ease-out;
  }

  .dialog > header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    padding: 22px 24px 18px;
    border-bottom: 1px solid var(--border);
  }

  h2,
  h3 {
    margin: 0;
    color: var(--ink-950);
    font-weight: 600;
    line-height: 1.2;
  }

  h2 {
    font-size: var(--text-xl);
  }

  .header-actions {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .project-visibility-toggle {
    display: inline-flex;
    min-height: 32px;
    align-items: center;
    gap: 6px;
    border: 1px solid var(--border);
    border-radius: var(--radius-pill);
    padding: 3px 5px 3px 9px;
    color: var(--ink-500);
    background: var(--surface-soft);
    font: inherit;
    font-size: var(--text-xs);
    font-weight: 700;
    cursor: pointer;
  }

  .project-visibility-toggle i {
    display: block;
    width: 18px;
    height: 18px;
    border-radius: 50%;
    background: var(--ink-400);
    transition:
      transform var(--motion-fast),
      background var(--motion-fast);
  }

  .project-visibility-toggle.active {
    border-color: color-mix(
      in srgb,
      var(--success, #16a34a) 45%,
      var(--border)
    );
    color: #177342;
    background: #eaf8ef;
  }

  .project-visibility-toggle.active i {
    background: #16a34a;
  }

  .project-visibility-toggle:disabled {
    opacity: 0.58;
    cursor: wait;
  }

  .record-page-link {
    color: inherit;
  }

  .record-page-link:hover,
  .record-page-link:focus-visible {
    color: var(--brand-600);
    text-decoration: underline;
    outline: 0;
  }

  h3 {
    font-size: var(--text-lg);
  }

  .close {
    display: inline-flex;
    width: auto;
    min-height: auto;
    align-items: center;
    justify-content: center;
    padding: 0;
    border: 0;
    color: var(--muted);
    background: transparent;
    box-shadow: none;
  }

  .close:hover {
    color: var(--text);
  }

  .body {
    min-height: 0;
    overflow-x: hidden;
    overflow-y: auto;
    padding: 18px 18px 20px;
    overscroll-behavior: contain;
  }

  form {
    display: grid;
    gap: 14px;
  }

  .notice {
    padding: 10px 12px;
    border: 1px solid color-mix(in srgb, var(--danger) 30%, var(--border));
    border-radius: var(--radius-md);
    color: var(--danger);
    background: color-mix(in srgb, var(--danger) 6%, white);
    font-size: var(--text-sm);
  }

  .catalog-state {
    margin: 7px 4px 0;
    color: var(--muted);
    font-size: var(--text-xs);
  }

  .catalog-error {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    margin-top: 7px;
    padding: 9px 10px;
    border: 1px solid color-mix(in srgb, var(--danger) 30%, var(--border));
    border-radius: var(--radius-md);
    color: var(--danger);
    background: color-mix(in srgb, var(--danger) 6%, white);
    font-size: var(--text-xs);
  }

  .catalog-error button {
    flex: 0 0 auto;
    min-height: 30px;
    padding: 5px 9px;
    border: 1px solid currentColor;
    border-radius: var(--radius-md);
    color: inherit;
    background: transparent;
    font: inherit;
    font-weight: 600;
  }

  .section {
    display: grid;
    gap: 12px;
    padding: 14px;
    border: 1px solid var(--border);
    border-radius: 20px;
    background: var(--panel);
  }

  .about-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 12px;
  }

  .field {
    min-width: 0;
  }

  .field.full {
    grid-column: 1 / -1;
  }

  .two-column-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 12px;
    align-items: start;
  }

  .control--disabled {
    background: var(--surface-soft);
    opacity: 0.72;
  }

  .control--disabled select:disabled {
    cursor: not-allowed;
  }

  .control {
    position: relative;
    display: grid;
    grid-template-columns: 18px minmax(0, 1fr);
    min-height: 56px;
    align-items: center;
    gap: 10px;
    padding: 0 14px;
    border: 1px solid var(--border);
    border-radius: var(--radius-xl);
    background: var(--panel);
    transition:
      border-color var(--motion-fast) ease,
      box-shadow var(--motion-fast) ease,
      background var(--motion-fast) ease;
  }

  .control:focus-within {
    border-color: var(--primary);
    box-shadow: none;
  }

  .control-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    color: var(--muted);
  }

  .date-control .control-icon {
    pointer-events: none;
  }

  .date-picker {
    position: absolute;
    z-index: 1;
    top: 0;
    bottom: 0;
    left: 0;
    width: 42px;
    min-width: 0;
    opacity: 0;
    cursor: pointer;
  }

  .date-picker:disabled {
    cursor: default;
  }

  input,
  select,
  textarea {
    width: 100%;
    min-width: 0;
    min-height: 0;
    padding: 0;
    border: 0;
    border-radius: 0;
    outline: 0;
    color: var(--text);
    background: transparent;
    box-shadow: none;
    font: inherit;
    font-size: var(--text-md);
    font-weight: 400;
    line-height: 1.45;
  }

  select {
    cursor: pointer;
  }

  input::placeholder,
  textarea::placeholder {
    color: var(--muted);
    opacity: 1;
  }

  .textarea-control {
    min-height: 118px;
    align-items: start;
    padding-block: 12px;
  }

  .textarea-control .control-icon {
    margin-top: 3px;
  }

  textarea {
    min-height: 92px;
    resize: vertical;
  }

  .view-mode input:disabled,
  .view-mode select:disabled,
  .view-mode textarea:disabled {
    color: var(--text);
    opacity: 1;
    cursor: default;
    -webkit-text-fill-color: var(--text);
  }

  .view-mode textarea:disabled {
    resize: none;
  }

  .add-delivery {
    display: inline-flex;
    min-height: 38px;
    align-items: center;
    justify-content: center;
    gap: 7px;
    padding: 0 13px;
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    color: var(--ink-800);
    background: var(--panel);
    font: inherit;
    font-size: var(--text-sm);
    font-weight: 600;
  }

  .add-delivery:hover {
    background: var(--surface-hover);
  }

  .section-head,
  .delivery-actions,
  .title-with-icon {
    display: flex;
    align-items: center;
  }

  .section-head {
    justify-content: space-between;
    gap: 12px;
  }

  .title-with-icon {
    gap: 8px;
  }

  .title-with-icon :global(svg) {
    color: var(--muted);
  }

  .delivery-actions {
    gap: 10px;
  }

  .count {
    display: inline-flex;
    min-width: 30px;
    height: 30px;
    align-items: center;
    justify-content: center;
    padding: 0 9px;
    border: 1px solid color-mix(in srgb, var(--primary) 30%, var(--border));
    border-radius: var(--radius-pill);
    color: var(--brand-700);
    background: var(--brand-50);
    font-size: var(--text-sm);
    font-weight: 600;
  }

  .delivery-list {
    display: grid;
    gap: 8px;
  }

  .delivery-note {
    margin: 0;
    color: var(--muted);
    font-size: var(--text-xs);
    line-height: 1.45;
  }

  .delivery-empty {
    padding: 18px;
    border: 1px dashed var(--border);
    border-radius: var(--radius-xl);
    color: var(--muted);
    background: var(--surface-soft);
    text-align: center;
    font-size: var(--text-sm);
  }

  .delivery-row {
    display: grid;
    grid-template-columns: 18px minmax(0, 1fr);
    min-height: 48px;
    align-items: center;
    gap: 9px;
    padding: 0 12px;
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
    color: var(--muted);
    background: var(--panel);
  }

  .delivery-row:focus-within {
    border-color: var(--primary);
    box-shadow: none;
  }

  .delivery-row input:disabled {
    color: var(--text);
    opacity: 1;
    cursor: default;
    -webkit-text-fill-color: var(--text);
  }

  .actions {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    margin-top: 0;
  }

  .action-group {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .action-group-right {
    margin-left: auto;
  }

  .actions button {
    display: inline-flex;
    min-width: 136px;
    min-height: 40px;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 10px 12px;
    border-radius: var(--radius-md);
    color: white;
    font: inherit;
    font-size: var(--text-md);
    font-weight: 600;
    line-height: 1.2;
  }

  .primary {
    border: 1px solid var(--primary);
    background: var(--primary);
    box-shadow: 0 8px 18px rgba(46, 86, 255, 0.22);
  }

  .primary:hover {
    border-color: var(--brand-700);
    background: var(--brand-700);
  }

  .archive {
    border: 1px solid #64748b;
    background: #64748b;
    box-shadow: 0 8px 18px rgba(71, 85, 105, 0.2);
  }

  .archive:hover {
    border-color: #475569;
    background: #475569;
  }

  .success {
    border: 1px solid #16a34a;
    background: #16a34a;
    box-shadow: 0 8px 18px rgba(22, 163, 74, 0.22);
  }

  .success:hover {
    border-color: #15803d;
    background: #15803d;
  }

  .danger {
    border: 1px solid #dc2626;
    background: #dc2626;
    box-shadow: 0 8px 18px rgba(220, 38, 38, 0.24);
  }

  .danger:hover {
    border-color: #991b1b;
    background: #b91c1c;
  }

  .cancel {
    border: 1px solid var(--primary);
    background: var(--primary);
    box-shadow: 0 8px 18px rgba(46, 86, 255, 0.22);
  }

  .cancel:hover {
    border-color: var(--brand-700);
    background: var(--brand-700);
  }

  .actions button:disabled,
  .actions button:disabled:hover {
    border-color: var(--border);
    color: var(--muted);
    background: var(--surface-soft);
    box-shadow: none;
    cursor: not-allowed;
  }

  @keyframes fade-in {
    from {
      opacity: 0;
    }
  }

  @keyframes rise {
    from {
      transform: translateY(8px) scale(0.99);
    }
  }

  @media (max-width: 760px) {
    .backdrop {
      align-items: stretch;
      padding: 8px;
    }

    .dialog {
      width: 100%;
      max-height: calc(100dvh - 16px);
      border-radius: var(--radius-lg);
    }

    .dialog > header {
      padding: 14px 14px 12px;
    }

    .body {
      padding: 12px;
    }

    .section {
      padding: 12px;
      border-radius: var(--radius-lg);
    }

    .about-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .section-head {
      align-items: stretch;
      flex-direction: column;
    }

    .delivery-actions {
      justify-content: space-between;
    }

    .actions {
      display: grid;
      grid-template-columns: minmax(0, 1fr);
    }

    .actions button {
      width: 100%;
    }

    .action-group {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      width: 100%;
    }

    .action-group-right {
      margin-left: 0;
    }
  }

  @media (max-width: 520px) {
    .about-grid,
    .two-column-grid {
      grid-template-columns: minmax(0, 1fr);
    }

    .field {
      grid-column: 1 / -1;
    }

    .delivery-actions {
      align-items: stretch;
      flex-direction: column;
    }

    .count {
      align-self: flex-start;
    }

    .add-delivery {
      width: 100%;
    }
  }
</style>
