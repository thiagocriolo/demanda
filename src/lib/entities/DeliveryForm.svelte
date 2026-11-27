<script module lang="ts">
  export type DeliveryFormMode = "create" | "view" | "edit";
</script>

<script lang="ts">
  import {
    ContractApiError,
    listAllActiveContracts,
    type Contract,
  } from "$lib/contracts/client";
  import {
    getProjectOptions,
    listAllActiveProjects,
    ProjectApiError,
    projectToEntityRecord,
  } from "$lib/projects/client";
  import type { ProjectResponsible, ProjectTag } from "$lib/projects/types";
  import {
    currentSettings,
    loadSettingsFromServer,
  } from "$lib/settings/client";
  import type { Choice, StyledChoice } from "$lib/settings/types";
  import { deliveryRelationsFromRecord } from "$lib/deliveries/client";
  import {
    canSelectDeliveryResponsible,
    currentRecordResponsiblesForWorkspace,
    hasDeliveryResponsibleWorkspace,
    resolveDeliveryResponsibleSelection,
  } from "$lib/deliveries/responsible-scope";
  import GlobalSelector, {
    type GlobalSelectorItem,
  } from "$lib/ui/GlobalSelector.svelte";
  import {
    getActiveWorkspace,
    loadWorkspaces,
    refreshWorkspaceSnapshot,
    type Workspace,
  } from "$lib/workspaces/workspace-storage";
  import { GLOBAL_WORKSPACE_SCOPE_ID } from "$lib/workspaces/workspace-scope";
  import {
    Archive,
    BadgeCheck,
    BriefcaseBusiness,
    CalendarDays,
    Check,
    FileText,
    Flag,
    FolderKanban,
    Layers,
    ListTodo,
    Pencil,
    Plus,
    Repeat,
    Save,
    SignalHigh,
    Tags,
    Timer,
    Trash2,
    UsersRound,
    Wrench,
    X,
  } from "@lucide/svelte";
  import { onMount, tick, untrack } from "svelte";
  import { recordPageHref } from "$lib/records/record-page";
  import type { EntityConfig, EntityRecord } from "./types";
  import {
    dateInputCaretPosition,
    formatDateForDisplay,
    formatDateInput,
    normalizeDateInput,
  } from "./date-format";

  type DeliveryFormState = {
    nome: string;
    contractId: string;
    negocioId: string;
    negocioNome: string;
    projetoId: string;
    projetoNome: string;
    responsavelId: string;
    responsavel: string;
    dataEntrega: string;
    recurrence: "daily" | "weekly" | "monthly";
    categoria: string;
    prioridade: string;
    status: string;
    descricao: string;
  };

  type DeliveryTask = {
    localId: string;
    id: string;
    nome: string;
    duracao: string;
    executionAt: string;
    status: string;
  };

  type SerializedTask = {
    id: string;
    nome: string;
    duracao: string;
    executionAt: string;
    status: string;
  };

  const MIN_TASK_DURATION_HOURS = 0.5;
  const MAX_TASK_DURATION_HOURS = 168;

  let {
    config,
    record,
    mode,
    oncancel,
    onsave,
    onedit,
    onarchive,
    ondelete,
    onaddtool,
  } = $props<{
    config: EntityConfig;
    record?: EntityRecord;
    mode?: DeliveryFormMode;
    oncancel: () => void;
    onsave: (values: Record<string, string>) => void;
    onedit?: () => void;
    onarchive?: () => void;
    ondelete?: () => void;
    onaddtool?: () => void;
  }>();

  let formNode: HTMLFormElement;
  let deliveryDateInput: HTMLInputElement | undefined;
  let categories = $state<StyledChoice[]>([]);
  let priorities = $state<Choice[]>([]);
  let statuses = $state<StyledChoice[]>([]);
  let contracts = $state<Contract[]>([]);
  let contractsLoading = $state(false);
  let contractsError = $state("");
  let contractRequest: AbortController | undefined;
  let projects = $state<EntityRecord[]>([]);
  let projectLoading = $state(false);
  let projectCatalogLoaded = $state(false);
  let projectError = $state("");
  let workspaceMembers = $state<ProjectResponsible[]>([]);
  let members = $state<ProjectResponsible[]>([]);
  let availableTags = $state<ProjectTag[]>([]);
  let workspaces = $state<Workspace[]>([]);
  let optionsWorkspaceId = $state("");
  let defaultTaskDuration = $state("1");
  let currentWorkspaceId = $state("personal");
  let projectRequest: AbortController | undefined;
  let taskSequence = 0;
  let pendingPropagationPayload = $state<Record<string, string> | null>(null);

  const initialRecord = untrack(() => record);
  const initialRelations = deliveryRelationsFromRecord(initialRecord);
  const initialMode = untrack(
    () => mode ?? (initialRecord ? "edit" : "create"),
  );
  let form = $state<DeliveryFormState>(formFromRecord(initialRecord));
  const initialServerProject =
    initialMode === "create"
      ? undefined
      : serverProjectFromRecord(initialRecord);
  if (initialServerProject) projects = [initialServerProject];
  let tasks = $state<DeliveryTask[]>(
    initialTasks(initialRecord, initialMode),
  );
  let currentResponsibleRelations = $state<ProjectResponsible[]>(
    initialRelations.responsibles,
  );
  let currentTagRelations = $state<ProjectTag[]>(initialRelations.tags);
  let selectedResponsibles = $state<GlobalSelectorItem[]>(
    initialRelations.responsibles.map(responsibleItem),
  );
  let selectedTags = $state<GlobalSelectorItem[]>(
    initialRelations.tags.map(tagItem),
  );

  let resolvedMode = $derived(mode ?? (record ? "edit" : "create"));
  let viewOnly = $derived(resolvedMode === "view");
  let title = $derived(
    resolvedMode === "view"
      ? "Detalhes da entrega"
      : resolvedMode === "edit"
        ? "Editar entrega"
        : "Nova entrega",
  );
  let recordHref = $derived(
    record?.id ? recordPageHref("entrega", record.id) : undefined,
  );
  let modalTitle = $derived(viewOnly && record?.nome ? record.nome : title);

  function closeBeforePageNavigation(event: MouseEvent): void {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)
      return;
    oncancel();
  }
  let createLabel = $derived(
    config.createAction.toLocaleLowerCase("pt-BR").includes("entrega")
      ? config.createAction
      : "Criar entrega",
  );
  let availableProjects = $derived(
    form.contractId
      ? projects.filter((project) =>
          text(project.contractId) === form.contractId,
        )
      : [],
  );
  let selectedContract = $derived(
    contracts.find(({ id }) => id === form.contractId),
  );
  let selectedProject = $derived(
    projects.find(({ id }) => id === form.projetoId),
  );
  let hasSelectedProject = $derived(Boolean(form.projetoId));
  let isRecurringProject = $derived.by(() => {
    if (!form.projetoId || form.projetoId.startsWith("institutional:")) {
      return false;
    }
    if (selectedProject) {
      if (selectedProject.isInstitutional === "true") return false;
      const frequency = text(
        selectedProject.contract_type,
        selectedProject.contractType,
      ).toLocaleLowerCase("pt-BR");
      return frequency === "recurring" || frequency === "recorrente";
    }
    if (
      initialRecord?.projetoId &&
      form.projetoId === initialRecord.projetoId
    ) {
      if (initialRecord.projectIsInstitutional === "true") return false;
      const initialFrequency = text(
        initialRecord.projectContractType,
        initialRecord.contract_type,
      ).toLocaleLowerCase("pt-BR");
      return (
        initialFrequency === "recurring" || initialFrequency === "recorrente"
      );
    }
    return false;
  });
  let workspaceNames = $derived(
    new Map(workspaces.map((workspace) => [workspace.id, workspace.name])),
  );
  let contractItems = $derived.by(() => {
    const showWorkspace = workspaces.length > 1;
    return contracts.map((contract) => {
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
  });
  let projectItems = $derived(
    [
      ...availableProjects.map((project) => ({
      id: project.id,
      label: project.nome,
      description: project.archivedAt
        ? "Projeto arquivado"
        : project.servicos || project.status || undefined,
      updatedAt: project.updatedAt,
      })),
      ...(form.contractId && !availableProjects.some((project) => project.isInstitutional === "true")
        ? [{ id: `institutional:${form.contractId}`, label: "Institucional", description: "Projeto institucional" }]
        : []),
    ],
  );
  let hasContractWorkspace = $derived(
    hasDeliveryResponsibleWorkspace({
      contractId: form.contractId,
      contractWorkspaceId: selectedContract?.workspaceId,
      optionsWorkspaceId,
    }),
  );
  let canSelectResponsible = $derived(
    canSelectDeliveryResponsible({
      viewOnly,
      hasContractWorkspace,
      hasProject: Boolean(form.projetoId),
      contractsLoading,
      projectLoading,
      contractsError: Boolean(contractsError),
      projectError: Boolean(projectError),
    }),
  );
  let recordResponsiblesForWorkspace = $derived(
    currentRecordResponsiblesForWorkspace({
      currentRecordResponsibles: currentResponsibleRelations,
      recordWorkspaceId: isUuid(record?.workspaceId) ? record!.workspaceId : "",
      activeWorkspaceId: activeCatalogWorkspaceId(),
    }),
  );
  let memberItems = $derived(
    uniqueSelectorItems([
      ...members.map(responsibleItem),
      ...recordResponsiblesForWorkspace.map(responsibleItem),
    ]),
  );
  let tagItems = $derived(
    uniqueSelectorItems([
      ...availableTags.filter(({ archivedAt }) => !archivedAt).map(tagItem),
      ...currentTagRelations.map(tagItem),
    ]),
  );
  const initialPropagableSignature = buildPropagableSignature({
    nome: form.nome,
    projetoId: form.projetoId,
    descricao: form.descricao,
    categoria: form.categoria,
    dataEntrega: form.dataEntrega,
    responsavelId: initialRelations.responsibles[0]?.userId ?? form.responsavelId,
    tagLabels: initialRelations.tags.map(({ name }) => name),
    recurrence: form.recurrence,
    tasks: tasksFromRecord(initialRecord).map(({ nome, duracao }) => ({
      nome,
      duracao,
    })),
  });

  $effect(() => {
    if (!hasSelectedProject && form.dataEntrega) {
      form.dataEntrega = "";
    }
  });

  function buildPropagableSignature(values: {
    nome: string;
    projetoId: string;
    descricao: string;
    categoria: string;
    dataEntrega: string;
    responsavelId: string;
    tagLabels: string[];
    recurrence: string;
    tasks: Array<{ nome: string; duracao: string }>;
  }): string {
    return JSON.stringify({
      nome: values.nome.trim(),
      projetoId: values.projetoId.trim(),
      descricao: values.descricao.trim(),
      categoria: values.categoria.trim(),
      dataEntrega: values.dataEntrega.trim(),
      responsavelId: values.responsavelId.trim(),
      tagLabels: values.tagLabels
        .map((label) => label.trim().toLocaleLowerCase("pt-BR"))
        .filter(Boolean)
        .sort(),
      recurrence: values.recurrence.trim(),
      tasks: values.tasks
        .filter(({ nome }) => nome.trim())
        .map(({ nome, duracao }) => ({
          nome: nome.trim(),
          duracao: normalizedDuration(duracao),
        })),
    });
  }

  function text(...values: Array<string | undefined>): string {
    return values.find((value) => value?.trim())?.trim() ?? "";
  }

  function formFromRecord(source?: EntityRecord): DeliveryFormState {
    const rawRecurrence = text(source?.recurrence);
    const recurrence: "daily" | "weekly" | "monthly" =
      rawRecurrence === "daily" ||
      rawRecurrence === "weekly" ||
      rawRecurrence === "monthly"
        ? rawRecurrence
        : "daily";
    return {
      nome: source?.nome ?? "",
      contractId: text(source?.contractId),
      negocioId: text(
        source?.negocioId,
        source?.negocio_id,
        source?.business_id,
      ),
      negocioNome: text(source?.negocio, source?.business_name),
      projetoId: text(
        source?.projetoId,
        source?.projeto_id,
        source?.project_id,
      ),
      projetoNome: text(source?.projeto, source?.project_name),
      responsavelId: text(source?.responsavelId, source?.assigned_user_id),
      responsavel: text(source?.responsavel),
      dataEntrega: deliveryDueDate(source),
      recurrence,
      categoria: text(source?.categoria, source?.stage),
      prioridade: text(source?.prioridade, source?.priority),
      status: source?.status ?? "",
      descricao: text(source?.descricao, source?.briefing),
    };
  }

  function recordValue(
    source: Record<string, unknown>,
    ...keys: string[]
  ): string {
    for (const key of keys) {
      const value = source[key];
      if (typeof value === "string" && value.trim()) return value.trim();
      if (typeof value === "number" && Number.isFinite(value)) {
        return String(value);
      }
    }
    return "";
  }

  function normalizedDuration(value: string | undefined): string {
    const parsed = Number(String(value ?? "").replace(",", "."));
    if (!Number.isFinite(parsed)) return "1";
    const bounded = Math.min(
      MAX_TASK_DURATION_HOURS,
      Math.max(MIN_TASK_DURATION_HOURS, Math.round(parsed * 2) / 2),
    );
    return Number.isInteger(bounded) ? String(bounded) : bounded.toFixed(1);
  }

  function taskCompleted(status: string): boolean {
    return [
      "concluida",
      "concluido",
      "conclusao",
      "entregue",
      "done",
      "completed",
    ].includes(normalizeSearch(status));
  }

  function setTaskCompleted(task: DeliveryTask, completed: boolean): void {
    task.status = completed ? "concluida" : "pendente";
    if (!completed || form.status === "conclusao" || form.status === "arquivado") {
      return;
    }
    const namedTasks = tasks.filter(({ nome }) => nome.trim());
    const targetTasks = namedTasks.length ? namedTasks : tasks;
    if (
      targetTasks.length > 0 &&
      targetTasks.every(({ status }) => taskCompleted(status))
    ) {
      form.status = "conclusao";
    }
  }

  function deliveryDueDate(source?: EntityRecord): string {
    const directDate = text(
      source?.dataEntrega,
      source?.data_entrega,
      source?.dueDate,
      source?.due_date,
      source?.prazo,
      source?.data,
    );
    return formatDateForDisplay(directDate);
  }

  function handleDeliveryDateInput(event: Event): void {
    const input = event.currentTarget as HTMLInputElement;
    const rawValue = input.value;
    const rawCaret = input.selectionStart;
    const formatted = formatDateInput(rawValue);
    if (input.value !== formatted) {
      input.value = formatted;
      const nextCaret = dateInputCaretPosition(rawValue, rawCaret, formatted);
      input.setSelectionRange(nextCaret, nextCaret);
    }
    form.dataEntrega = formatted;
    input.setCustomValidity("");
  }

  function handleDeliveryDatePickerChange(event: Event): void {
    form.dataEntrega = formatDateForDisplay(
      (event.currentTarget as HTMLInputElement).value,
    );
    deliveryDateInput?.setCustomValidity("");
  }

  function openDatePicker(event: MouseEvent): void {
    (event.currentTarget as HTMLInputElement).showPicker?.();
  }

  function localExecutionAt(value: string): string {
    if (!value) return "";
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return "";
    const offset = parsed.getTimezoneOffset() * 60_000;
    return new Date(parsed.getTime() - offset).toISOString().slice(0, 16);
  }

  function serializedExecutionAt(value: string): string {
    if (!value) return "";
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? "" : parsed.toISOString();
  }

  function taskExecutionLabel(value: string): string {
    if (!value) return "";
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return "";

    const date = new Intl.DateTimeFormat("pt-BR", {
      day: "numeric",
      month: "long",
    }).format(parsed);
    const hours = parsed.getHours();
    const minutes = parsed.getMinutes();
    const time =
      minutes === 0
        ? `${hours} horas`
        : `${hours}h${String(minutes).padStart(2, "0")}`;

    return `${date}, às ${time}`;
  }

  function newTask(
    values: Partial<Omit<DeliveryTask, "localId">> = {},
  ): DeliveryTask {
    taskSequence += 1;
    return {
      localId: `delivery-task-${taskSequence}`,
      id: values.id ?? "",
      nome: values.nome ?? "",
      duracao: normalizedDuration(
        values.duracao ?? defaultTaskDuration ?? "1",
      ),
      executionAt: localExecutionAt(values.executionAt ?? ""),
      status: values.status ?? "pendente",
    };
  }

  function tasksFromRecord(source?: EntityRecord): DeliveryTask[] {
    const raw = source?.tarefas;
    if (!raw?.trim()) return [];

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return raw
        .split(/\r?\n/)
        .map((name) => name.trim())
        .filter(Boolean)
        .map((nome) => newTask({ nome }));
    }

    const items = Array.isArray(parsed)
      ? parsed
      : parsed &&
          typeof parsed === "object" &&
          Array.isArray((parsed as { tarefas?: unknown }).tarefas)
        ? (parsed as { tarefas: unknown[] }).tarefas
        : [];

    return items.slice(0, 10).flatMap((item) => {
      if (typeof item === "string") {
        const nome = item.trim();
        return nome ? [newTask({ nome })] : [];
      }
      if (!item || typeof item !== "object") return [];
      const candidate = item as Record<string, unknown>;
      return [
        newTask({
          id: recordValue(candidate, "id"),
          nome: recordValue(candidate, "nome", "name"),
          duracao: recordValue(
            candidate,
            "duracao",
            "duration",
            "duration_hours",
          ),
          executionAt: recordValue(candidate, "executionAt", "execution_at"),
          status: recordValue(candidate, "status") || "pendente",
        }),
      ];
    });
  }

  function initialTasks(
    source: EntityRecord | undefined,
    initialFormMode: DeliveryFormMode,
  ): DeliveryTask[] {
    const initial = tasksFromRecord(source);
    return initialFormMode !== "view" && initial.length === 0
      ? [newTask()]
      : initial;
  }

  function optionLabel(value: string): string {
    return value
      .replace(/[_-]+/g, " ")
      .replace(/(^|\s)\S/g, (letter) => letter.toLocaleUpperCase("pt-BR"));
  }

  function normalizeSearch(value: string): string {
    return value
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, "")
      .trim()
      .toLocaleLowerCase("pt-BR");
  }

  function uniqueSelectorItems(
    items: GlobalSelectorItem[],
  ): GlobalSelectorItem[] {
    return items.filter(
      (item, index) => items.findIndex(({ id }) => id === item.id) === index,
    );
  }

  function responsibleItem(
    responsible: ProjectResponsible,
  ): GlobalSelectorItem {
    return {
      id: responsible.userId,
      label: responsible.name,
      description: responsible.email,
      avatarUrl: responsible.avatarUrl ?? undefined,
    };
  }

  function tagItem(tag: ProjectTag): GlobalSelectorItem {
    return {
      id: tag.id,
      label: tag.name,
      description: tag.archivedAt ? "Tag arquivada" : undefined,
    };
  }

  function stringArray(value: string | undefined): string[] {
    if (!value) return [];
    try {
      const parsed: unknown = JSON.parse(value);
      return Array.isArray(parsed)
        ? parsed.filter((item): item is string => typeof item === "string")
        : [];
    } catch {
      return [];
    }
  }

  function serverProjectFromRecord(
    source?: EntityRecord,
  ): EntityRecord | undefined {
    if (!source) return undefined;
    const id = text(source.projetoId, source.projeto_id, source.project_id);
    const name = text(source.projeto, source.project_name);
    const businessId = text(
      source.negocioId,
      source.negocio_id,
      source.business_id,
    );
    const workspaceId = text(source.workspaceId, source.workspace_id);
    const version = Number(source.version);
    if (
      !id ||
      !name ||
      !businessId ||
      !workspaceId ||
      !Number.isInteger(version) ||
      version < 1
    ) {
      return undefined;
    }
    return {
      id,
      workspaceId,
      createdAt: source.createdAt,
      updatedAt: source.updatedAt,
      archivedAt: source.projectArchivedAt ?? "",
      nome: name,
      negocioId: businessId,
      negocio_id: businessId,
      business_id: businessId,
      contractId: text(source.contractId),
      contractType: text(source.projectContractType) || "one_off",
      contract_type: text(source.projectContractType) || "one_off",
      status: source.projectArchivedAt
        ? "arquivado"
        : source.projectStatus || "",
    };
  }

  function isUuid(value: string | undefined): boolean {
    return Boolean(
      value &&
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu.test(
          value.trim(),
        ),
    );
  }

  function activeCatalogWorkspaceId(): string {
    if (selectedContract?.workspaceId) return selectedContract.workspaceId;
    if (isUuid(record?.workspaceId)) return record!.workspaceId;
    return "";
  }

  function hydrateRelations(): void {
    if (selectedContract) {
      form.negocioId = selectedContract.business.id;
      form.negocioNome = selectedContract.business.name;
    }
    if (!projectCatalogLoaded) return;

    if (form.contractId && form.projetoId === `institutional:${form.contractId}`) {
      form.projetoNome = "Institucional";
      return;
    }

    const project = projects.find(({ id }) => id === form.projetoId);
    if (project) {
      const projectContractId = text(project.contractId);
      if (projectContractId) form.contractId = projectContractId;
      if (projectContractId && form.contractId === projectContractId) {
        form.projetoId = project.id;
        form.projetoNome = project.nome;
      } else {
        form.projetoId = "";
        form.projetoNome = "";
      }
    } else {
      form.projetoId = "";
      form.projetoNome = "";
    }
  }

  async function loadProjectCatalog(workspaceId = ""): Promise<void> {
    projectRequest?.abort();
    if (!workspaceId) {
      projectRequest = undefined;
      optionsWorkspaceId = "";
      projectLoading = false;
      projectCatalogLoaded = false;
      projectError = "";
      projects = initialServerProject ? [initialServerProject] : [];
      workspaceMembers = [];
      availableTags = [];
      syncProjectMembers();
      return;
    }
    const request = new AbortController();
    projectRequest = request;
    optionsWorkspaceId = workspaceId;
    projectLoading = true;
    projectCatalogLoaded = false;
    projectError = "";
    workspaceMembers = [];
    members = [];
    availableTags = [];

    try {
      const [apiProjects, options] = await Promise.all([
        listAllActiveProjects({
          workspaceId,
          includeEmptyInstitutional: true,
          signal: request.signal,
        }),
        getProjectOptions({ workspaceId, signal: request.signal }),
      ]);
      if (request.signal.aborted) return;
      if (
        options.workspaceId !== GLOBAL_WORKSPACE_SCOPE_ID &&
        apiProjects.some(
          (project) => project.workspaceId !== options.workspaceId,
        )
      ) {
        throw new ProjectApiError(
          409,
          "O workspace mudou durante o carregamento dos projetos. Tente novamente.",
        );
      }

      const mapped = apiProjects.map(projectToEntityRecord);
      projects =
        initialServerProject &&
        !mapped.some(({ id }) => id === initialServerProject.id)
          ? [initialServerProject, ...mapped]
          : mapped;
      workspaceMembers = options.members;
      availableTags = options.tags;
      projectCatalogLoaded = true;
      hydrateRelations();
      syncProjectMembers();
    } catch (error) {
      if (request.signal.aborted) return;
      projectError =
        error instanceof ProjectApiError
          ? error.message
          : "N\u00e3o foi poss\u00edvel carregar os projetos. Tente novamente.";
    } finally {
      if (projectRequest === request) {
        projectLoading = false;
        projectRequest = undefined;
      }
    }
  }

  async function loadContractCatalog(): Promise<void> {
    contractRequest?.abort();
    const request = new AbortController();
    contractRequest = request;
    contractsLoading = true;
    contractsError = "";
    try {
      const scopedWorkspaceId =
        resolvedMode !== "create" && isUuid(record?.workspaceId)
          ? record!.workspaceId
          : undefined;
      contracts = await listAllActiveContracts({
        ...(scopedWorkspaceId ? { workspaceId: scopedWorkspaceId } : {}),
        signal: request.signal,
      });
      if (request.signal.aborted) return;
      const selected = contracts.find(({ id }) => id === form.contractId);
      if (selected) {
        form.negocioId = selected.business.id;
        form.negocioNome = selected.business.name;
        if (selected.workspaceId !== optionsWorkspaceId) {
          void loadProjectCatalog(selected.workspaceId);
        }
      }
    } catch (error) {
      if (request.signal.aborted) return;
      contractsError = error instanceof ContractApiError
        ? error.message
        : "Não foi possível carregar os contratos. Tente novamente.";
    } finally {
      if (contractRequest === request) {
        contractsLoading = false;
        contractRequest = undefined;
      }
    }
  }

  function syncProjectMembers(): void {
    const project = projects.find(({ id }) => id === form.projetoId);
    const isInstitutionalProject =
      Boolean(form.contractId) &&
      form.projetoId === `institutional:${form.contractId}`;
    const resolved = resolveDeliveryResponsibleSelection({
      hasContractWorkspace,
      hasProject: Boolean(project || isInstitutionalProject),
      workspaceMembers,
      currentRecordResponsibles: currentResponsibleRelations,
      recordWorkspaceId: isUuid(record?.workspaceId) ? record!.workspaceId : "",
      activeWorkspaceId: activeCatalogWorkspaceId(),
      selectedResponsibleIds: selectedResponsibles.map(({ id }) => id),
      fallbackResponsibleId: form.responsavelId,
    });

    members = resolved.members;
    const firstResponsible = resolved.selectedResponsible
      ? responsibleItem(resolved.selectedResponsible)
      : undefined;
    selectedResponsibles = firstResponsible ? [firstResponsible] : [];
    form.responsavelId = firstResponsible?.id ?? "";
    form.responsavel = firstResponsible?.label ?? "";
  }

  function applyDeliverySettings(
    settings: ReturnType<typeof currentSettings>,
  ): void {
    categories = settings.deliveryCategories;
    priorities = settings.deliveryPriorities;
    statuses = settings.deliveryStatuses;
    defaultTaskDuration = normalizedDuration(settings.defaultDeliveryDuration);

    if (!form.prioridade) {
      form.prioridade =
        priorities.find(({ key }) => key === "normal")?.key ??
        priorities[0]?.key ??
        "normal";
    }
    if (!form.status) {
      form.status =
        statuses.find(({ key }) => key !== "arquivado")?.key ?? "planejamento";
    }
  }

  onMount(() => {
    applyDeliverySettings(currentSettings());
    void loadSettingsFromServer()
      .then(applyDeliverySettings)
      .catch(() => undefined);

    const workspace = getActiveWorkspace();
    currentWorkspaceId = workspace.id;
    workspaces = loadWorkspaces();
    if (!workspaces.length) {
      void refreshWorkspaceSnapshot()
        .then((items) => {
          workspaces = items;
        })
        .catch(() => undefined);
    }
    void loadContractCatalog();
    const initialWorkspaceId = isUuid(initialRecord?.workspaceId)
      ? initialRecord!.workspaceId
      : "";
    if (initialWorkspaceId) {
      void loadProjectCatalog(initialWorkspaceId);
    }

    if (resolvedMode !== "view" && tasks.length === 0) {
      tasks = [newTask()];
    } else if (
      tasks.length === 1 &&
      !tasks[0].nome &&
      tasks[0].duracao === "1"
    ) {
      tasks[0].duracao = defaultTaskDuration;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    queueMicrotask(() => {
      if (viewOnly) return;
      formNode
        ?.querySelector<HTMLElement>(
          "input:not(:disabled), select:not(:disabled), textarea:not(:disabled)",
        )
        ?.focus();
    });
    return () => {
      contractRequest?.abort();
      projectRequest?.abort();
      document.body.style.overflow = previousOverflow;
    };
  });

  function selectContract(id: string): void {
    const contract = contracts.find(({ id: contractId }) => contractId === id);
    form.contractId = contract?.id ?? "";
    form.negocioId = contract?.business.id ?? "";
    form.negocioNome = contract?.business.name ?? "";
    form.projetoId = "";
    form.projetoNome = "";
    form.dataEntrega = "";
    deliveryDateInput?.setCustomValidity("");
    if (!contract) {
      selectedResponsibles = [];
      form.responsavelId = "";
      form.responsavel = "";
      selectedTags = [];
      void loadProjectCatalog("");
      return;
    }
    if (
      contract.workspaceId !== optionsWorkspaceId ||
      (!projectCatalogLoaded && !projectLoading)
    ) {
      selectedResponsibles = [];
      form.responsavelId = "";
      form.responsavel = "";
      selectedTags = [];
      void loadProjectCatalog(contract.workspaceId);
      return;
    }
    syncProjectMembers();
  }

  function selectProject(id: string): void {
    if (id === `institutional:${form.contractId}`) {
      form.projetoId = id;
      form.projetoNome = "Institucional";
      syncProjectMembers();
      return;
    }
    const project = availableProjects.find(
      ({ id: projectId }) => projectId === id,
    );
    form.projetoId = project?.id ?? "";
    form.projetoNome = project?.nome ?? "";
    syncProjectMembers();
    if (project && selectedResponsibles.length === 0) {
      const projectResponsibleIds = stringArray(project.responsibleUserIds);
      selectedResponsibles = projectResponsibleIds
        .slice(0, 1)
        .flatMap((userId) => {
          const item = memberItems.find(({ id }) => id === userId);
          return item ? [item] : [];
        });
      const firstResponsible = selectedResponsibles[0];
      form.responsavelId = firstResponsible?.id ?? "";
      form.responsavel = firstResponsible?.label ?? "";
    }
  }

  function selectResponsible(id: string): void {
    const selected = memberItems.find((item) => item.id === id);
    selectedResponsibles = selected ? [selected] : [];
    form.responsavelId = selected?.id ?? "";
    form.responsavel = selected?.label ?? "";
  }

  async function addTask(): Promise<void> {
    if (tasks.length >= 10) return;
    const task = newTask();
    tasks = [...tasks, task];
    await tick();
    formNode
      ?.querySelector<HTMLInputElement>(
        `[data-task-id="${task.localId}"] input`,
      )
      ?.focus();
  }

  async function addTaskOnEnter(
    event: KeyboardEvent,
    task: DeliveryTask,
  ): Promise<void> {
    if (
      event.key !== "Enter" ||
      event.isComposing ||
      !task.nome.trim() ||
      tasks.length >= 10
    )
      return;

    event.preventDefault();
    await addTask();
  }

  function removeTask(localId: string): void {
    if (tasks.length === 1) {
      tasks = [newTask()];
      return;
    }
    tasks = tasks.filter((task) => task.localId !== localId);
  }

  function serializedTasks(): SerializedTask[] {
    return tasks
      .filter(({ nome }) => nome.trim())
      .map((task) => ({
        id: task.id || crypto.randomUUID(),
        nome: task.nome.trim(),
        duracao: normalizedDuration(task.duracao),
        executionAt: serializedExecutionAt(task.executionAt),
        status: task.status || "pendente",
      }));
  }

  function submit(event: SubmitEvent): void {
    event.preventDefault();
    if (viewOnly) return;
    if (!form.nome.trim()) {
      const nameInput = formNode.elements.namedItem("nome");
      if (nameInput instanceof HTMLInputElement) {
        nameInput.setCustomValidity("Preencha este campo.");
        nameInput.reportValidity();
        nameInput.focus();
      }
      return;
    }
    const hasSelectedBusiness = Boolean(selectedContract);
    const hasSelectedProject = projectItems.some(({ id }) => id === form.projetoId);
    if (
      (!hasSelectedBusiness || !hasSelectedProject) &&
      (contractsLoading ||
        projectLoading ||
        Boolean(contractsError) ||
        Boolean(projectError))
    ) {
      return;
    }
    const deliveryDate = normalizeDateInput(form.dataEntrega);
    deliveryDateInput?.setCustomValidity(
      deliveryDate === null
        ? "Informe uma data de entrega válida no formato dd/mm/aaaa."
        : "",
    );
    if (!formNode.reportValidity()) return;
    if (deliveryDate === null) {
      deliveryDateInput?.focus();
      return;
    }
    if (!hasSelectedBusiness || !hasSelectedProject) return;

    const savedTasks = serializedTasks();
    if (savedTasks.length === 0) {
      savedTasks.push({
        id: crypto.randomUUID(),
        nome: form.nome.trim(),
        duracao: defaultTaskDuration,
        executionAt: "",
        status: "pendente",
      });
    }
    const totalDuration = savedTasks.reduce(
      (sum, { duracao }) => sum + Number(duracao),
      0,
    );
    const responsible = selectedResponsibles[0];
    const responsibleNames = selectedResponsibles.map(({ label }) => label);
    const responsibleUserIds = selectedResponsibles.map(({ id }) => id);
    const tagLabels = selectedTags.map(({ label }) => label);
    const project = projects.find(({ id }) => id === form.projetoId);
    if (
      !selectedContract ||
      (!project && form.projetoId !== `institutional:${form.contractId}`)
    ) {
      return;
    }
    const workspaceId = record?.workspaceId || currentWorkspaceId;
    const projectWorkspaceId = project?.workspaceId ?? selectedContract?.workspaceId ?? "";
    const negocioId = selectedContract.business.id;
    const projetoId = project?.id ?? "";
    const negocio = selectedContract.business.name;
    const selectedBusinessWorkspaceId =
      selectedContract.workspaceId ||
      text(record?.businessWorkspaceId, record?.business_workspace_id);
    const projeto = project?.nome ?? "Institucional";
    const duracao = savedTasks.length
      ? String(Math.round(totalDuration * 100) / 100)
      : record?.duracao || record?.duration || "";

    const payload: Record<string, string> = {
      nome: form.nome.trim(),
      workspaceId,
      workspace_id: workspaceId,
      negocio,
      negocioId,
      negocio_id: negocioId,
      business_id: negocioId,
      businessWorkspaceId: selectedBusinessWorkspaceId,
      business_workspace_id: selectedBusinessWorkspaceId,
      projeto,
      projetoId,
      projeto_id: projetoId,
      project_id: projetoId,
      institutionalContractId: form.projetoId === `institutional:${form.contractId}` ? form.contractId : "",
      projectWorkspaceId,
      project_workspace_id: projectWorkspaceId,
      categoria: form.categoria,
      stage: form.categoria,
      prioridade: form.prioridade,
      priority: form.prioridade,
      status: form.status,
      descricao: form.descricao.trim(),
      briefing: form.descricao.trim(),
      responsavel: responsibleNames.join(", "),
      responsaveis: responsibleNames.join(", "),
      responsavelId: responsible?.id ?? "",
      assigned_user_id: responsible?.id ?? "",
      responsibleUserIds: JSON.stringify(responsibleUserIds),
      tags: tagLabels.join(", "),
      tagLabels: JSON.stringify(tagLabels),
      dataEntrega: deliveryDate,
      data_entrega: deliveryDate,
      dueDate: deliveryDate,
      due_date: deliveryDate,
      recurrence: isRecurringProject ? form.recurrence : "",
      duracao,
      duration: duracao,
      tarefas: JSON.stringify(savedTasks),
    };

    if (resolvedMode === "edit" && isRecurringProject && initialRecord?.id) {
      const nextPropagableSignature = buildPropagableSignature({
        nome: form.nome,
        projetoId: form.projetoId,
        descricao: form.descricao,
        categoria: form.categoria,
        dataEntrega: form.dataEntrega,
        responsavelId: responsible?.id ?? "",
        tagLabels,
        recurrence: form.recurrence,
        tasks: savedTasks.map(({ nome, duracao }) => ({ nome, duracao })),
      });
      if (nextPropagableSignature !== initialPropagableSignature) {
        pendingPropagationPayload = payload;
        return;
      }
      onsave({ ...payload, routinePropagation: "single" });
      return;
    }

    onsave(payload);
  }

  function confirmPropagation(modeChoice: "single" | "future"): void {
    if (!pendingPropagationPayload) return;
    const payload = pendingPropagationPayload;
    pendingPropagationPayload = null;
    onsave({ ...payload, routinePropagation: modeChoice });
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
    aria-labelledby="delivery-form-title"
  >
    <header>
      <h2 id="delivery-form-title">
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
        {#if isRecurringProject}
          <label
            class="frequency-pill"
            class:frequency-pill--readonly={viewOnly}
            title="Frequência de renovação da entrega"
          >
            <Repeat size={14} strokeWidth={2} aria-hidden="true" />
            <select
              bind:value={form.recurrence}
              required
              disabled={viewOnly}
              aria-label="Recorrência da entrega"
            >
              <option value="daily">Diário</option>
              <option value="weekly">Semanal</option>
              <option value="monthly">Mensal</option>
            </select>
          </label>
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
        <section class="form-section">
          <div class="fields">
            <div class="control full">
              <span class="control-icon" aria-hidden="true">
                <BadgeCheck size={16} strokeWidth={1.8} />
              </span>
              <input
                name="nome"
                type="text"
                value={form.nome}
                maxlength="140"
                required
                disabled={viewOnly}
                placeholder="Nome da entrega *"
                aria-label="Nome da entrega"
                oninput={(event) => {
                  form.nome = event.currentTarget.value;
                  event.currentTarget.setCustomValidity("");
                }}
              />
            </div>

            <div class="two-column-grid full">
              <div class="selector-field">
                <GlobalSelector
                  items={contractItems}
                  bind:value={form.contractId}
                  presentation="search"
                  selection="single"
                  label="Contrato"
                  placeholder="Digite para buscar contrato"
                  emptyMessage="Nenhum contrato encontrado."
                  icon={BriefcaseBusiness}
                  controlIcon={BriefcaseBusiness}
                  required
                  disabled={viewOnly ||
                    contractsLoading ||
                    Boolean(contractsError)}
                  onchange={selectContract}
                />
                {#if contractsLoading}
                  <p class="catalog-state" role="status">
                    Carregando contratos…
                  </p>
                {:else if contractsError}
                  <div class="catalog-state catalog-state--error" role="alert">
                    <span>{contractsError}</span>
                    <button
                      type="button"
                      onclick={() => void loadContractCatalog()}
                    >
                      Tentar novamente
                    </button>
                  </div>
                {/if}
              </div>

              <div class="selector-field">
                <GlobalSelector
                  items={projectItems}
                  bind:value={form.projetoId}
                  presentation="search"
                  selection="single"
                  label="Projeto"
                  placeholder={form.contractId
                    ? "Digite para buscar projeto"
                    : "Selecione um contrato primeiro"}
                  emptyMessage="Nenhum projeto encontrado para este contrato."
                  icon={FolderKanban}
                  controlIcon={FolderKanban}
                  required
                  disabled={viewOnly ||
                    !form.contractId ||
                    contractsLoading ||
                    projectLoading ||
                    Boolean(contractsError) ||
                    Boolean(projectError)}
                  onchange={selectProject}
                />
                {#if projectLoading}
                  <p class="catalog-state" role="status">
                    Carregando projetos…
                  </p>
                {:else if projectError}
                  <div class="catalog-state catalog-state--error" role="alert">
                    <span>{projectError}</span>
                    <button
                      type="button"
                      onclick={() =>
                        void loadProjectCatalog(activeCatalogWorkspaceId())}
                    >
                      Tentar novamente
                    </button>
                  </div>
                {/if}
              </div>
            </div>

            <div class="two-column-grid full">
              <GlobalSelector
                items={memberItems}
                bind:value={form.responsavelId}
                presentation="search"
                selection="single"
                label="Pessoa responsável"
                placeholder={hasContractWorkspace || form.projetoId
                  ? "Selecione a pessoa responsável"
                  : "Selecione um contrato primeiro"}
                emptyMessage="Nenhum membro disponível neste workspace."
                icon={UsersRound}
                controlIcon={UsersRound}
                showInitials
                required
                onchange={selectResponsible}
                disabled={!canSelectResponsible}
              />

              <div
                class:control--disabled={!viewOnly && !hasSelectedProject}
                class="control date-control"
              >
                <span class="control-icon" aria-hidden="true">
                  <CalendarDays size={16} strokeWidth={1.8} />
                </span>
                <input
                  class="date-picker"
                  type="date"
                  tabindex="-1"
                  disabled={viewOnly || !hasSelectedProject}
                  value={normalizeDateInput(form.dataEntrega) || ""}
                  aria-label="Abrir calendário para a data de entrega"
                  onclick={openDatePicker}
                  onchange={handleDeliveryDatePickerChange}
                />
                <input
                  bind:this={deliveryDateInput}
                  type="text"
                  name="dataEntrega"
                  inputmode="numeric"
                  autocomplete="off"
                  maxlength="10"
                  placeholder={hasSelectedProject
                    ? "Data de entrega"
                    : "Selecione um projeto primeiro"}
                  disabled={viewOnly || !hasSelectedProject}
                  aria-label="Data de entrega da entrega"
                  value={form.dataEntrega}
                  oninput={handleDeliveryDateInput}
                />
              </div>
            </div>

            <div class="three-column-grid full">
              <div class="control">
                <span class="control-icon" aria-hidden="true">
                  <Layers size={16} strokeWidth={1.8} />
                </span>
                <select
                  bind:value={form.categoria}
                  disabled={viewOnly}
                  aria-label="Categoria"
                >
                  <option value="">Categoria</option>
                  {#if form.categoria && !categories.some(({ key }) => key === form.categoria)}
                    <option value={form.categoria}
                      >{optionLabel(form.categoria)}</option
                    >
                  {/if}
                  {#each categories as category (category.key)}
                    <option value={category.key}>{category.label}</option>
                  {/each}
                </select>
              </div>

              <div class="control">
                <span class="control-icon" aria-hidden="true">
                  <SignalHigh size={16} strokeWidth={1.8} />
                </span>
                <select
                  bind:value={form.prioridade}
                  required
                  disabled={viewOnly}
                  aria-label="Prioridade"
                >
                  <option value="" disabled>Prioridade</option>
                  {#if form.prioridade && !priorities.some(({ key }) => key === form.prioridade)}
                    <option value={form.prioridade}
                      >{optionLabel(form.prioridade)}</option
                    >
                  {/if}
                  {#each priorities as priority (priority.key)}
                    <option value={priority.key}>{priority.label}</option>
                  {/each}
                </select>
              </div>

              <div class="control">
                <span class="control-icon" aria-hidden="true">
                  <Flag size={16} strokeWidth={1.8} />
                </span>
                <select
                  bind:value={form.status}
                  required
                  disabled={viewOnly}
                  aria-label="Status"
                >
                  <option value="" disabled>Status</option>
                  {#if form.status && !statuses.some(({ key }) => key === form.status)}
                    <option value={form.status}
                      >{optionLabel(form.status)}</option
                    >
                  {/if}
                  {#each statuses.filter(({ key }) => resolvedMode !== "create" || key !== "arquivado") as status (status.key)}
                    <option value={status.key}>{status.label}</option>
                  {/each}
                </select>
              </div>
            </div>

            <div class="control textarea-control full">
              <span class="control-icon" aria-hidden="true">
                <FileText size={16} strokeWidth={1.8} />
              </span>
              <textarea
                bind:value={form.descricao}
                name="descricao"
                rows="5"
                maxlength="1600"
                disabled={viewOnly}
                placeholder="Briefing"
                aria-label="Briefing"></textarea>
            </div>

            <div class="full">
              <GlobalSelector
                items={tagItems}
                bind:selected={selectedTags}
                presentation="search"
                selection="multiple"
                label="Tags"
                placeholder="Selecione as tags"
                emptyMessage="Nenhuma tag disponível neste workspace."
                icon={Tags}
                controlIcon={Tags}
                showHelper
                helperMessage="Você pode selecionar mais de uma tag."
                disabled={viewOnly || projectLoading || Boolean(projectError)}
              />
            </div>
          </div>
        </section>

        <section class="form-section tasks-section">
          <div class="section-heading">
            <h3>Tarefas</h3>
            {#if !viewOnly}
              <button
                class="add-task"
                type="button"
                disabled={tasks.length >= 10}
                onclick={addTask}
              >
                <Plus size={16} strokeWidth={2} />
                <span
                  >{tasks.length >= 10
                    ? "Limite de 10 tarefas"
                    : "Adicionar tarefa"}</span
                >
              </button>
            {/if}
          </div>

          {#if tasks.length > 0}
            <div class="task-list">
              {#each tasks as task (task.localId)}
                <div
                  class="task-row"
                  class:task-row--editable={!viewOnly}
                  data-task-id={task.localId}
                >
                  <label
                    class="task-check"
                    class:task-check--checked={taskCompleted(
                      task.status,
                    )}
                    title={taskCompleted(task.status)
                      ? "Tarefa concluída"
                      : "Tarefa pendente"}
                  >
                    <input
                      type="checkbox"
                      checked={taskCompleted(task.status)}
                      disabled={viewOnly}
                      aria-label={taskCompleted(task.status)
                        ? "Marcar tarefa como pendente"
                        : "Marcar tarefa como concluída"}
                      onchange={(event) =>
                        setTaskCompleted(
                          task,
                          event.currentTarget.checked,
                        )}
                    />
                    <span class="checkbox-indicator" aria-hidden="true">
                      {#if taskCompleted(task.status)}
                        <Check size={17} strokeWidth={2.5} />
                      {/if}
                    </span>
                  </label>

                  <div class="control task-duration-control">
                    <span class="control-icon" aria-hidden="true">
                      <Timer size={16} strokeWidth={1.8} />
                    </span>
                    <input
                      bind:value={task.duracao}
                      type="number"
                      min={MIN_TASK_DURATION_HOURS}
                      max={MAX_TASK_DURATION_HOURS}
                      step="0.5"
                      required={Boolean(task.nome.trim())}
                      disabled={viewOnly}
                      placeholder="Duração"
                      aria-label="Duração da tarefa em horas"
                      onchange={() =>
                        (task.duracao = normalizedDuration(task.duracao))}
                    />
                    <span class="duration-unit" aria-hidden="true">h</span>
                  </div>

                  <div class="control task-name-control">
                    <span class="control-icon" aria-hidden="true">
                      <ListTodo size={16} strokeWidth={1.8} />
                    </span>
                    <input
                      bind:value={task.nome}
                      type="text"
                      maxlength="120"
                      disabled={viewOnly}
                      placeholder="Nome da tarefa"
                      aria-label="Nome da tarefa"
                      onkeydown={(event) => addTaskOnEnter(event, task)}
                    />
                  </div>

                  <div class="task-date">
                    <span class="task-date-label"
                      >{taskExecutionLabel(task.executionAt)}</span
                    >
                    {#if viewOnly}
                      <span class="task-date-picker" aria-hidden="true">
                        <CalendarDays size={16} strokeWidth={1.8} />
                      </span>
                    {:else}
                      <label
                        class="task-date-picker"
                        title="Alterar data e hora da tarefa"
                      >
                        <CalendarDays size={16} strokeWidth={1.8} />
                        <input
                          bind:value={task.executionAt}
                          type="datetime-local"
                          aria-label="Data e hora de execução da tarefa"
                          onclick={openDatePicker}
                        />
                      </label>
                    {/if}
                  </div>

                  {#if !viewOnly}
                    <button
                      class="remove-task"
                      type="button"
                      aria-label="Remover tarefa"
                      title="Remover tarefa"
                      onclick={() => removeTask(task.localId)}
                    >
                      <Trash2 size={17} strokeWidth={1.9} />
                    </button>
                  {/if}
                </div>
              {/each}
            </div>
          {:else}
            <p class="empty-state">Nenhuma tarefa cadastrada.</p>
          {/if}
        </section>

        <div class="actions">
          {#if resolvedMode === "view"}
            {#if onaddtool}
              <div class="action-group">
                <button class="tool-action" type="button" onclick={onaddtool}>
                  <Wrench size={16} strokeWidth={2} />
                  <span>Adicionar uso</span>
                </button>
              </div>
            {/if}
            <div class="action-group action-group-right">
              <button
                class="primary"
                type="button"
                disabled={!onedit}
                onclick={() => onedit?.()}
              >
                <Pencil size={16} strokeWidth={2} />
                <span>Editar</span>
              </button>
              <button
                class="archive"
                type="button"
                disabled={!onarchive}
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
                disabled={!ondelete}
                onclick={() => ondelete?.()}
              >
                <Trash2 size={16} strokeWidth={2} />
                <span>Excluir</span>
              </button>
              <button
                class="archive"
                type="button"
                disabled={!onarchive}
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
              <button
                class="success"
                type="submit"
                disabled={contractsLoading ||
                  projectLoading ||
                  Boolean(contractsError) ||
                  Boolean(projectError)}
              >
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
              <button
                class="success"
                type="submit"
                disabled={contractsLoading ||
                  projectLoading ||
                  Boolean(contractsError) ||
                  Boolean(projectError)}
              >
                <Save size={16} strokeWidth={2} />
                <span>{createLabel}</span>
              </button>
            </div>
          {/if}
        </div>
      </form>
    </div>
  </div>
</div>

{#if pendingPropagationPayload}
  <div
    class="confirm-backdrop"
    role="presentation"
    onclick={(event) =>
      event.target === event.currentTarget &&
      (pendingPropagationPayload = null)}
  >
    <div
      class="confirm-dialog"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="delivery-propagation-title"
      aria-describedby="delivery-propagation-desc"
    >
      <h3 id="delivery-propagation-title">
        Aplicar alterações às próximas renovações?
      </h3>
      <p id="delivery-propagation-desc">
        Você alterou informações desta entrega recorrente. Deseja aplicar as
        mudanças (nome, data, categoria, briefing, responsável, tags, tarefas e
        frequência) apenas neste cartão ou também nas próximas renovações?
        Status e prioridade valem apenas para este cartão, e entregas arquivadas
        não são alteradas.
      </p>
      <div class="confirm-actions">
        <button
          class="confirm-cancel"
          type="button"
          onclick={() => (pendingPropagationPayload = null)}
        >
          Cancelar
        </button>
        <button
          class="confirm-secondary"
          type="button"
          onclick={() => confirmPropagation("single")}
        >
          Apenas esta entrega
        </button>
        <button
          class="confirm-primary"
          type="button"
          onclick={() => confirmPropagation("future")}
        >
          Esta e as próximas
        </button>
      </div>
    </div>
  </div>
{/if}

<svelte:window
  onkeydown={(event) => {
    if (event.key !== "Escape") return;
    if (pendingPropagationPayload) pendingPropagationPayload = null;
    else oncancel();
  }}
/>

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
    --global-selector-focus-shadow: none;

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

  .header-actions {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .frequency-pill {
    display: inline-flex;
    min-height: 34px;
    align-items: center;
    gap: 6px;
    padding: 0 11px;
    border: 1px solid color-mix(in srgb, var(--primary) 34%, var(--border));
    border-radius: var(--radius-pill);
    color: var(--brand-700);
    background: var(--brand-50);
    font-size: var(--text-xs);
    font-weight: 600;
    cursor: pointer;
    transition:
      border-color var(--motion-fast) ease,
      background var(--motion-fast) ease;
  }

  .frequency-pill:focus-within {
    border-color: var(--primary);
  }

  .frequency-pill select {
    width: auto;
    color: var(--brand-700);
    font-size: var(--text-xs);
    font-weight: 600;
    line-height: 1.2;
    cursor: pointer;
  }

  .frequency-pill--readonly {
    cursor: default;
  }

  .frequency-pill--readonly select:disabled {
    color: var(--brand-700);
    opacity: 1;
    cursor: default;
    -webkit-text-fill-color: var(--brand-700);
  }

  h2,
  h3 {
    margin: 0;
    color: var(--ink-950);
    font-weight: 600;
  }

  h2 {
    font-size: var(--text-xl);
    line-height: 1.25;
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
    line-height: 1.2;
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

  .fields {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 8px 10px;
  }

  .full {
    min-width: 0;
  }

  .two-column-grid,
  .three-column-grid {
    display: grid;
    gap: 10px;
  }

  .two-column-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .three-column-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .selector-field {
    display: grid;
    min-width: 0;
    gap: 7px;
  }

  .catalog-state {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    margin: 0;
    color: var(--muted);
    font-size: var(--text-xs);
  }

  .catalog-state--error {
    color: var(--danger);
  }

  .catalog-state button {
    width: auto;
    min-height: 30px;
    flex: 0 0 auto;
    padding: 5px 9px;
    border: 1px solid color-mix(in srgb, var(--danger) 38%, var(--border));
    border-radius: var(--radius-md);
    color: var(--danger);
    background: var(--panel);
    box-shadow: none;
    font: inherit;
    font-size: var(--text-xs);
    font-weight: 600;
  }

  .catalog-state button:hover {
    background: color-mix(in srgb, var(--danger) 7%, var(--panel));
  }

  .catalog-state button:disabled {
    color: var(--muted);
    cursor: default;
    opacity: 0.72;
  }

  .control {
    display: grid;
    grid-template-columns: 18px minmax(0, 1fr);
    min-width: 0;
    min-height: 58px;
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

  .control--disabled {
    background: var(--surface-soft);
    opacity: 0.72;
  }

  .control--disabled input:disabled {
    cursor: not-allowed;
  }

  .textarea-control {
    min-height: 128px;
    align-items: start;
    padding-block: 12px;
  }

  .control-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    color: var(--muted);
  }

  .date-control {
    position: relative;
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

  .textarea-control .control-icon {
    margin-top: 3px;
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

  textarea {
    min-height: 98px;
    resize: vertical;
  }

  input::placeholder,
  textarea::placeholder {
    color: var(--muted);
    opacity: 1;
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

  .section-heading {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }

  .add-task {
    display: inline-flex;
    min-height: 38px;
    align-items: center;
    justify-content: center;
    gap: 7px;
    padding: 8px 12px;
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    color: var(--text);
    background: var(--surface-soft);
    font: inherit;
    font-size: var(--text-sm);
    font-weight: 500;
    box-shadow: none;
  }

  .add-task:hover {
    border-color: color-mix(in srgb, var(--primary) 42%, var(--border));
    background: var(--surface-hover, var(--surface-soft));
  }

  .add-task:disabled,
  .add-task:disabled:hover {
    border-color: var(--border);
    color: var(--muted);
    background: var(--surface-soft);
    cursor: not-allowed;
  }

  .task-list {
    display: grid;
    gap: 6px;
  }

  .task-row {
    display: grid;
    grid-template-columns: 50px 76px minmax(180px, 1fr) minmax(190px, 210px);
    gap: 0;
    align-items: center;
    overflow: hidden;
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
    background: var(--panel);
    transition:
      border-color var(--motion-fast) ease,
      box-shadow var(--motion-fast) ease,
      background var(--motion-fast) ease;
  }

  .task-row--editable {
    grid-template-columns: 50px 76px minmax(180px, 1fr) minmax(
        190px,
        210px
      ) 50px;
  }

  .task-row:hover {
    background: var(--surface-soft);
  }

  .task-row:focus-within {
    border-color: color-mix(in srgb, var(--primary) 55%, var(--border));
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--primary) 10%, transparent);
  }

  .task-row > .control {
    min-height: 50px;
    padding: 0 12px;
    border: 0;
    border-left: 1px solid var(--border);
    border-radius: 0;
    background: transparent;
  }

  .task-row > .control:focus-within {
    border-left-color: var(--border);
    box-shadow: none;
  }

  .task-row .control input {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .task-duration-control {
    grid-template-columns: 16px 22px auto;
    gap: 4px;
    padding-inline: 9px !important;
  }

  .task-duration-control input {
    width: 22px;
    appearance: textfield;
    -moz-appearance: textfield;
  }

  .task-duration-control input::-webkit-inner-spin-button,
  .task-duration-control input::-webkit-outer-spin-button {
    margin: 0;
    appearance: none;
  }

  .duration-unit {
    color: var(--muted);
    font-size: var(--text-sm);
    font-variant-numeric: tabular-nums;
  }

  .task-date {
    display: flex;
    min-width: 0;
    min-height: 50px;
    align-items: center;
    justify-content: flex-end;
    gap: 6px;
    padding: 0 8px;
  }

  .task-date-label {
    min-width: 0;
    overflow: hidden;
    color: var(--muted);
    font-size: var(--text-xs);
    line-height: 1.3;
    text-align: right;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .task-date-picker {
    position: relative;
    display: inline-grid;
    width: 26px;
    height: 26px;
    flex: 0 0 26px;
    align-items: center;
    justify-content: center;
    border-radius: var(--radius-sm);
    color: var(--muted);
    place-items: center;
  }

  label.task-date-picker {
    cursor: pointer;
    transition:
      color var(--motion-fast) ease,
      background var(--motion-fast) ease;
  }

  label.task-date-picker:hover,
  label.task-date-picker:focus-within {
    color: var(--primary);
    background: color-mix(in srgb, var(--primary) 8%, transparent);
  }

  .task-date-picker input {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    opacity: 0;
    cursor: pointer;
  }

  .task-check {
    position: relative;
    display: grid;
    width: 50px;
    height: 50px;
    border: 0;
    border-radius: var(--radius-lg) 0 0 var(--radius-lg);
    color: var(--muted);
    background: transparent;
    cursor: pointer;
    transition:
      color var(--motion-fast) ease,
      background var(--motion-fast) ease;
    place-items: center;
  }

  .task-check:hover,
  .task-check:focus-within {
    color: var(--primary);
  }

  .task-check--checked {
    color: var(--primary);
    background: color-mix(in srgb, var(--primary) 7%, var(--panel));
  }

  .task-check input,
  .view-mode .task-check input:disabled {
    position: absolute;
    width: 1px;
    height: 1px;
    opacity: 0;
  }

  .task-check:has(input:disabled) {
    cursor: default;
  }

  .checkbox-indicator {
    display: grid;
    width: 22px;
    height: 22px;
    border: 1.5px solid currentColor;
    border-radius: 6px;
    place-items: center;
  }

  .remove-task {
    display: inline-flex;
    width: 50px;
    min-width: 50px;
    height: 50px;
    min-height: 50px;
    align-items: center;
    justify-content: center;
    padding: 0;
    border: 0;
    border-left: 1px solid var(--border);
    border-radius: 0 var(--radius-lg) var(--radius-lg) 0;
    color: var(--danger);
    background: transparent;
    box-shadow: none;
  }

  .remove-task:hover {
    background: color-mix(in srgb, var(--danger) 7%, var(--panel));
  }

  .empty-state {
    margin: 0;
    padding: 16px;
    border: 1px dashed var(--border);
    border-radius: var(--radius-xl);
    color: var(--muted);
    background: var(--surface-soft);
    font-size: var(--text-sm);
    text-align: center;
  }

  .actions {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    margin-top: 6px;
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
    min-width: 150px;
    min-height: 40px;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 10px 12px;
    border-radius: var(--radius-md);
    color: white;
    font: inherit;
    font-size: var(--text-md);
    font-weight: 500;
    line-height: 1.2;
    transition:
      background var(--motion-fast) ease,
      border-color var(--motion-fast) ease,
      box-shadow var(--motion-fast) ease;
  }

  .primary {
    border: 1px solid var(--primary);
    background: var(--primary);
    box-shadow: 0 8px 18px rgba(46, 86, 255, 0.22);
  }

  .primary:hover {
    border-color: #1f3fc2;
    background: #2447d8;
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

  .tool-action {
    border: 1px solid var(--brand-600);
    color: var(--brand-700) !important;
    background: var(--brand-50);
    box-shadow: none;
  }

  .tool-action:hover {
    border-color: var(--brand-700);
    color: white !important;
    background: var(--brand-700);
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
    border-color: #1f3fc2;
    background: #2447d8;
  }

  .actions button:disabled,
  .actions button:disabled:hover {
    border-color: var(--border);
    color: var(--muted);
    background: var(--surface-soft);
    box-shadow: none;
    cursor: not-allowed;
  }

  .confirm-backdrop {
    position: fixed;
    z-index: 3400;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 20px;
    background: rgba(15, 23, 42, 0.56);
    inset: 0;
  }

  .confirm-dialog {
    display: grid;
    gap: 14px;
    width: min(500px, 100%);
    padding: 22px;
    border: 1px solid var(--border);
    border-radius: 18px;
    background: var(--canvas);
    box-shadow: 0 24px 52px rgba(15, 23, 42, 0.24);
  }

  .confirm-dialog p {
    margin: 0;
    color: var(--muted);
    font-size: var(--text-sm);
    line-height: 1.5;
  }

  .confirm-actions {
    display: flex;
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: 8px;
    margin-top: 4px;
  }

  .confirm-actions button {
    display: inline-flex;
    min-height: 38px;
    align-items: center;
    justify-content: center;
    padding: 8px 14px;
    border-radius: var(--radius-md);
    font: inherit;
    font-size: var(--text-sm);
    font-weight: 600;
    cursor: pointer;
  }

  .confirm-cancel {
    border: 1px solid var(--border);
    color: var(--muted);
    background: var(--panel);
  }

  .confirm-secondary {
    border: 1px solid var(--border);
    color: var(--ink-900);
    background: var(--surface-soft);
  }

  .confirm-primary {
    border: 1px solid var(--primary);
    color: white;
    background: var(--primary);
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

    .form-section {
      padding: 12px;
      border-radius: var(--radius-lg);
    }

    .control {
      min-height: 52px;
      border-radius: var(--radius-lg);
    }

    .task-check {
      width: 52px;
      height: 52px;
      border-radius: var(--radius-lg);
    }

    .two-column-grid,
    .three-column-grid,
    .task-row,
    .task-row.task-row--editable {
      grid-template-columns: minmax(0, 1fr);
    }

    .remove-task {
      width: 52px;
      min-width: 52px;
      height: 52px;
      min-height: 52px;
      justify-self: end;
      border-radius: var(--radius-lg);
    }

    .actions {
      display: grid;
      grid-template-columns: 1fr;
      align-items: stretch;
      justify-content: stretch;
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
    .section-heading {
      align-items: stretch;
      flex-direction: column;
    }

    .add-task {
      width: 100%;
    }
  }
</style>
