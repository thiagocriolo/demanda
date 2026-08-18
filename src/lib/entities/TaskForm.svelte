<script module lang="ts">
  export type TaskFormMode = "create" | "view" | "edit";
</script>

<script lang="ts">
  import {
    BusinessApiError,
    businessToEntityRecord,
    listAllActiveBusinesses,
  } from "$lib/businesses/client";
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
  import { taskRelationsFromRecord } from "$lib/tasks/client";
  import GlobalSelector, {
    type GlobalSelectorItem,
  } from "$lib/ui/GlobalSelector.svelte";
  import { getActiveWorkspace } from "$lib/workspaces/workspace-storage";
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
  import type { EntityConfig, EntityRecord } from "./types";

  type TaskFormState = {
    nome: string;
    negocioId: string;
    negocioNome: string;
    projetoId: string;
    projetoNome: string;
    responsavelId: string;
    responsavel: string;
    dataEntrega: string;
    categoria: string;
    prioridade: string;
    status: string;
    descricao: string;
  };

  type TaskSubtask = {
    localId: string;
    id: string;
    nome: string;
    duracao: string;
    status: string;
  };

  type SerializedSubtask = {
    id: string;
    nome: string;
    duracao: string;
    status: string;
  };

  const LEGACY_BUSINESS_FIELD = "__legacyBusiness";
  const LEGACY_BUSINESS_ID_FIELD = "__legacyBusinessId";
  const LEGACY_BUSINESS_NAME_FIELD = "__legacyBusinessName";
  const BUSINESS_WORKSPACE_ID_FIELD = "__businessWorkspaceId";
  const MIN_SUBTASK_DURATION_HOURS = 0.5;
  const MAX_SUBTASK_DURATION_HOURS = 168;

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
    mode?: TaskFormMode;
    oncancel: () => void;
    onsave: (values: Record<string, string>) => void;
    onedit?: () => void;
    onarchive?: () => void;
    ondelete?: () => void;
    onaddtool?: () => void;
  }>();

  let formNode: HTMLFormElement;
  let categories = $state<StyledChoice[]>([]);
  let priorities = $state<Choice[]>([]);
  let statuses = $state<StyledChoice[]>([]);
  let businesses = $state<EntityRecord[]>([]);
  let businessLoading = $state(false);
  let businessCatalogLoaded = $state(false);
  let businessError = $state("");
  let projects = $state<EntityRecord[]>([]);
  let projectLoading = $state(false);
  let projectCatalogLoaded = $state(false);
  let projectError = $state("");
  let workspaceMembers = $state<ProjectResponsible[]>([]);
  let members = $state<ProjectResponsible[]>([]);
  let availableTags = $state<ProjectTag[]>([]);
  let defaultSubtaskDuration = $state("1");
  let currentWorkspaceId = $state("personal");
  let businessRequest: AbortController | undefined;
  let projectRequest: AbortController | undefined;
  let subtaskSequence = 0;

  const initialRecord = untrack(() => record);
  const initialRelations = taskRelationsFromRecord(initialRecord);
  const initialMode = untrack(
    () => mode ?? (initialRecord ? "edit" : "create"),
  );
  let form = $state<TaskFormState>(formFromRecord(initialRecord));
  const initialServerBusiness =
    initialMode === "create"
      ? undefined
      : serverBusinessFromRecord(initialRecord);
  const initialServerProject =
    initialMode === "create"
      ? undefined
      : serverProjectFromRecord(initialRecord);
  const initialLegacyBusiness = initialServerBusiness
    ? undefined
    : legacyBusinessFromRecord(initialRecord);
  const initialBusiness = initialServerBusiness ?? initialLegacyBusiness;
  if (initialBusiness) {
    businesses = [initialBusiness];
    form.negocioId = initialBusiness.id;
    form.negocioNome = businessReferenceName(initialBusiness);
  }
  if (initialServerProject) projects = [initialServerProject];
  let subtasks = $state<TaskSubtask[]>(
    initialSubtasks(initialRecord, initialMode),
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
      ? "Detalhes da tarefa"
      : resolvedMode === "edit"
        ? "Editar tarefa"
        : "Nova tarefa",
  );
  let createLabel = $derived(
    config.createAction.toLocaleLowerCase("pt-BR").includes("tarefa")
      ? config.createAction
      : "Criar tarefa",
  );
  let availableProjects = $derived(
    form.negocioId
      ? projects.filter((project) =>
          projectBelongsToBusiness(project, form.negocioId),
        )
      : [],
  );
  let businessItems = $derived(
    businesses.map((business) => ({
      id: business.id,
      label: business.nome,
      description: business.archivedAt
        ? "Neg\u00f3cio arquivado"
        : business.responsaveis || business.observacoes || undefined,
      updatedAt: business.updatedAt,
    })),
  );
  let projectItems = $derived(
    availableProjects.map((project) => ({
      id: project.id,
      label: project.nome,
      description: project.archivedAt
        ? "Projeto arquivado"
        : project.servicos || project.status || undefined,
      updatedAt: project.updatedAt,
    })),
  );
  let memberItems = $derived(
    uniqueSelectorItems([
      ...members.map(responsibleItem),
      ...currentResponsibleRelations.map(responsibleItem),
    ]),
  );
  let tagItems = $derived(
    uniqueSelectorItems([
      ...availableTags.filter(({ archivedAt }) => !archivedAt).map(tagItem),
      ...currentTagRelations.map(tagItem),
    ]),
  );

  function text(...values: Array<string | undefined>): string {
    return values.find((value) => value?.trim())?.trim() ?? "";
  }

  function formFromRecord(source?: EntityRecord): TaskFormState {
    return {
      nome: source?.nome ?? "",
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
      dataEntrega: taskDueDate(source),
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
      MAX_SUBTASK_DURATION_HOURS,
      Math.max(MIN_SUBTASK_DURATION_HOURS, Math.round(parsed * 2) / 2),
    );
    return Number.isInteger(bounded) ? String(bounded) : bounded.toFixed(1);
  }

  function subtaskCompleted(status: string): boolean {
    return [
      "concluida",
      "concluido",
      "conclusao",
      "entregue",
      "done",
      "completed",
    ].includes(normalizeSearch(status));
  }

  function setSubtaskCompleted(subtask: TaskSubtask, completed: boolean): void {
    subtask.status = completed ? "concluida" : "pendente";
  }

  function taskDueDate(source?: EntityRecord): string {
    const directDate = text(
      source?.dataEntrega,
      source?.data_entrega,
      source?.dueDate,
      source?.due_date,
      source?.prazo,
      source?.data,
    );
    if (directDate) return directDate;
    return "";
  }

  function newSubtask(
    values: Partial<Omit<TaskSubtask, "localId">> = {},
  ): TaskSubtask {
    subtaskSequence += 1;
    return {
      localId: `task-subtask-${subtaskSequence}`,
      id: values.id ?? "",
      nome: values.nome ?? "",
      duracao: normalizedDuration(
        values.duracao ?? defaultSubtaskDuration ?? "1",
      ),
      status: values.status ?? "pendente",
    };
  }

  function subtasksFromRecord(source?: EntityRecord): TaskSubtask[] {
    const raw = source?.subtarefas;
    if (!raw?.trim()) return [];

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return raw
        .split(/\r?\n/)
        .map((name) => name.trim())
        .filter(Boolean)
        .map((nome) => newSubtask({ nome }));
    }

    const items = Array.isArray(parsed)
      ? parsed
      : parsed &&
          typeof parsed === "object" &&
          Array.isArray((parsed as { subtarefas?: unknown }).subtarefas)
        ? (parsed as { subtarefas: unknown[] }).subtarefas
        : [];

    return items.slice(0, 10).flatMap((item) => {
      if (typeof item === "string") {
        const nome = item.trim();
        return nome ? [newSubtask({ nome })] : [];
      }
      if (!item || typeof item !== "object") return [];
      const candidate = item as Record<string, unknown>;
      return [
        newSubtask({
          id: recordValue(candidate, "id"),
          nome: recordValue(candidate, "nome", "name"),
          duracao: recordValue(
            candidate,
            "duracao",
            "duration",
            "duration_hours",
          ),
          status: recordValue(candidate, "status") || "pendente",
        }),
      ];
    });
  }

  function initialSubtasks(
    source: EntityRecord | undefined,
    initialFormMode: TaskFormMode,
  ): TaskSubtask[] {
    const initial = subtasksFromRecord(source);
    return initialFormMode !== "view" && initial.length === 0
      ? [newSubtask()]
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

  function legacyBusinessFromRecord(
    source?: EntityRecord,
  ): EntityRecord | undefined {
    const originalId = text(
      source?.negocioId,
      source?.negocio_id,
      source?.business_id,
    );
    const originalName = text(source?.negocio, source?.business_name);
    if (!originalId && !originalName) return undefined;

    return {
      id:
        originalId ||
        `legacy-business-name:${encodeURIComponent(normalizeSearch(originalName))}`,
      createdAt: source?.createdAt ?? "1970-01-01T00:00:00.000Z",
      updatedAt: source?.updatedAt ?? "1970-01-01T00:00:00.000Z",
      nome: originalName || "Negócio legado",
      [LEGACY_BUSINESS_FIELD]: "true",
      [LEGACY_BUSINESS_ID_FIELD]: originalId,
      [LEGACY_BUSINESS_NAME_FIELD]: originalName,
      [BUSINESS_WORKSPACE_ID_FIELD]: text(
        source?.businessWorkspaceId,
        source?.business_workspace_id,
      ),
    };
  }

  function serverBusinessFromRecord(
    source?: EntityRecord,
  ): EntityRecord | undefined {
    if (!source) return undefined;
    const id = text(source.negocioId, source.negocio_id, source.business_id);
    const name = text(source.negocio, source.business_name);
    const workspaceId = text(source.workspaceId, source.workspace_id);
    const version = Number(source.version);
    if (
      !id ||
      !name ||
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
      archivedAt: source.businessArchivedAt ?? "",
      nome: name,
      etapa: source.businessArchivedAt ? "arquivado" : "",
    };
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
      status: source.projectArchivedAt
        ? "arquivado"
        : source.projectStatus || "",
    };
  }

  function isLegacyBusiness(business?: EntityRecord): boolean {
    return business?.[LEGACY_BUSINESS_FIELD] === "true";
  }

  function businessReferenceId(business?: EntityRecord): string {
    if (!business) return "";
    return isLegacyBusiness(business)
      ? business[LEGACY_BUSINESS_ID_FIELD]
      : business.id;
  }

  function businessReferenceName(business?: EntityRecord): string {
    if (!business) return "";
    return isLegacyBusiness(business)
      ? business[LEGACY_BUSINESS_NAME_FIELD]
      : business.nome;
  }

  function businessWorkspaceId(business?: EntityRecord): string {
    if (!business) return "";
    return isLegacyBusiness(business)
      ? business[BUSINESS_WORKSPACE_ID_FIELD]
      : business.workspaceId;
  }

  function relationId(candidate: EntityRecord): string {
    return text(
      candidate.negocioId,
      candidate.negocio_id,
      candidate.business_id,
    );
  }

  function projectBelongsToBusiness(
    project: EntityRecord,
    businessId: string,
  ): boolean {
    if (!businessId) return false;
    const selectedBusiness = businesses.find(({ id }) => id === businessId);
    if (!selectedBusiness || isLegacyBusiness(selectedBusiness)) return false;
    return relationId(project) === businessReferenceId(selectedBusiness);
  }

  function hydrateRelations(): void {
    const selectedBusiness = businesses.find(({ id }) => id === form.negocioId);
    if (selectedBusiness) {
      form.negocioNome = businessReferenceName(selectedBusiness);
    }
    if (!businessCatalogLoaded || !projectCatalogLoaded) return;

    const selectedProject = projects.find(({ id }) => id === form.projetoId);
    const project = selectedProject;
    if (project) {
      if (!form.negocioId) {
        let relatedBusiness = businesses.find(
          (business) =>
            !isLegacyBusiness(business) && business.id === relationId(project),
        );
        if (!relatedBusiness && relationId(project)) {
          relatedBusiness = {
            id: relationId(project),
            workspaceId: project.workspaceId,
            createdAt: project.createdAt,
            updatedAt: project.updatedAt,
            nome:
              text(project.negocio, project.business_name) ||
              "Negócio vinculado",
            __projectContextBusiness: "true",
          };
          businesses = [relatedBusiness, ...businesses];
        }
        if (relatedBusiness) {
          form.negocioId = relatedBusiness.id;
          form.negocioNome = businessReferenceName(relatedBusiness);
        }
      }
      if (projectBelongsToBusiness(project, form.negocioId)) {
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

  async function loadProjectCatalog(): Promise<void> {
    projectRequest?.abort();
    const request = new AbortController();
    projectRequest = request;
    projectLoading = true;
    projectCatalogLoaded = false;
    projectError = "";

    try {
      const [apiProjects, options] = await Promise.all([
        listAllActiveProjects({
          includeEmptyInstitutional: true,
          signal: request.signal,
        }),
        getProjectOptions({ signal: request.signal }),
      ]);
      if (request.signal.aborted) return;
      if (
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

  async function loadBusinessCatalog(): Promise<void> {
    businessRequest?.abort();
    const request = new AbortController();
    businessRequest = request;
    businessLoading = true;
    businessCatalogLoaded = false;
    businessError = "";

    try {
      const apiBusinesses = await listAllActiveBusinesses({
        signal: request.signal,
      });
      if (request.signal.aborted) return;

      const mapped = apiBusinesses.map(businessToEntityRecord);
      businesses =
        initialBusiness && !mapped.some(({ id }) => id === initialBusiness.id)
          ? [initialBusiness, ...mapped]
          : mapped;
      businessCatalogLoaded = true;
      hydrateRelations();
      syncProjectMembers();
    } catch (error) {
      if (request.signal.aborted) return;
      businessError =
        error instanceof BusinessApiError
          ? error.message
          : "Não foi possível carregar os negócios. Tente novamente.";
    } finally {
      if (businessRequest === request) {
        businessLoading = false;
        businessRequest = undefined;
      }
    }
  }

  function syncProjectMembers(): void {
    const project = projects.find(({ id }) => id === form.projetoId);
    if (!project) {
      members = [];
      selectedResponsibles = [];
      form.responsavelId = "";
      form.responsavel = "";
      return;
    }

    members = workspaceMembers;
    const available = uniqueSelectorItems([
      ...members.map(responsibleItem),
      ...currentResponsibleRelations.map(responsibleItem),
    ]);
    if (!selectedResponsibles.length && form.responsavelId) {
      const selected = available.find(({ id }) => id === form.responsavelId);
      if (selected) selectedResponsibles = [selected];
    } else {
      selectedResponsibles = selectedResponsibles
        .slice(0, 1)
        .flatMap((selection) => {
          const selected = available.find(({ id }) => id === selection.id);
          return selected ? [selected] : [];
        });
    }
    const firstResponsible = selectedResponsibles[0];
    form.responsavelId = firstResponsible?.id ?? "";
    form.responsavel = firstResponsible?.label ?? "";
  }

  function applyTaskSettings(
    settings: ReturnType<typeof currentSettings>,
  ): void {
    categories = settings.taskCategories;
    priorities = settings.taskPriorities;
    statuses = settings.taskStatuses;
    defaultSubtaskDuration = normalizedDuration(settings.defaultTaskDuration);

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
    applyTaskSettings(currentSettings());
    void loadSettingsFromServer()
      .then(applyTaskSettings)
      .catch(() => undefined);

    const workspace = getActiveWorkspace();
    currentWorkspaceId = workspace.id;
    void loadBusinessCatalog();
    void loadProjectCatalog();

    if (resolvedMode !== "view" && subtasks.length === 0) {
      subtasks = [newSubtask()];
    } else if (
      subtasks.length === 1 &&
      !subtasks[0].nome &&
      subtasks[0].duracao === "1"
    ) {
      subtasks[0].duracao = defaultSubtaskDuration;
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
      businessRequest?.abort();
      projectRequest?.abort();
      document.body.style.overflow = previousOverflow;
    };
  });

  function selectBusiness(id: string): void {
    const business = businesses.find(({ id: businessId }) => businessId === id);
    form.negocioId = business?.id ?? "";
    form.negocioNome = businessReferenceName(business);
    const currentProject = projects.find(
      ({ id: projectId }) => projectId === form.projetoId,
    );
    if (
      !currentProject ||
      !projectBelongsToBusiness(currentProject, form.negocioId)
    ) {
      form.projetoId = "";
      form.projetoNome = "";
      syncProjectMembers();
    }
  }

  function selectProject(id: string): void {
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

  async function addSubtask(): Promise<void> {
    if (subtasks.length >= 10) return;
    const subtask = newSubtask();
    subtasks = [...subtasks, subtask];
    await tick();
    formNode
      ?.querySelector<HTMLInputElement>(
        `[data-subtask-id="${subtask.localId}"] input`,
      )
      ?.focus();
  }

  function removeSubtask(localId: string): void {
    if (subtasks.length === 1) {
      subtasks = [newSubtask()];
      return;
    }
    subtasks = subtasks.filter((subtask) => subtask.localId !== localId);
  }

  function serializedSubtasks(): SerializedSubtask[] {
    return subtasks
      .filter(({ nome }) => nome.trim())
      .map((subtask) => ({
        id: subtask.id || crypto.randomUUID(),
        nome: subtask.nome.trim(),
        duracao: normalizedDuration(subtask.duracao),
        status: subtask.status || "pendente",
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
    const hasSelectedBusiness = businesses.some(
      ({ id }) => id === form.negocioId,
    );
    const hasSelectedProject = projects.some(({ id }) => id === form.projetoId);
    if (
      (!hasSelectedBusiness || !hasSelectedProject) &&
      (businessLoading ||
        projectLoading ||
        Boolean(businessError) ||
        Boolean(projectError))
    ) {
      return;
    }
    if (!formNode.reportValidity()) return;
    if (!hasSelectedBusiness || !hasSelectedProject) return;

    const savedSubtasks = serializedSubtasks();
    if (savedSubtasks.length === 0) {
      savedSubtasks.push({
        id: crypto.randomUUID(),
        nome: form.nome.trim(),
        duracao: defaultSubtaskDuration,
        status: "pendente",
      });
    }
    const totalDuration = savedSubtasks.reduce(
      (sum, { duracao }) => sum + Number(duracao),
      0,
    );
    const responsible = selectedResponsibles[0];
    const responsibleNames = selectedResponsibles.map(({ label }) => label);
    const responsibleUserIds = selectedResponsibles.map(({ id }) => id);
    const tagLabels = selectedTags.map(({ label }) => label);
    const business = businesses.find(({ id }) => id === form.negocioId);
    const project = projects.find(({ id }) => id === form.projetoId);
    if (
      !business ||
      !project ||
      !projectBelongsToBusiness(project, form.negocioId)
    ) {
      return;
    }
    const workspaceId = record?.workspaceId || currentWorkspaceId;
    const projectWorkspaceId = project.workspaceId;
    const negocioId = businessReferenceId(business);
    const projetoId = project.id;
    const negocio = businessReferenceName(business);
    const selectedBusinessWorkspaceId =
      businessWorkspaceId(business) ||
      text(record?.businessWorkspaceId, record?.business_workspace_id);
    const projeto = project.nome;
    const duracao = savedSubtasks.length
      ? String(Math.round(totalDuration * 100) / 100)
      : record?.duracao || record?.duration || "";

    onsave({
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
      dataEntrega: form.dataEntrega,
      data_entrega: form.dataEntrega,
      dueDate: form.dataEntrega,
      due_date: form.dataEntrega,
      duracao,
      duration: duracao,
      subtarefas: JSON.stringify(savedSubtasks),
    });
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
    aria-labelledby="task-form-title"
  >
    <header>
      <h2 id="task-form-title">{title}</h2>
      <button
        class="close"
        type="button"
        aria-label="Fechar"
        onclick={oncancel}
      >
        <X size={18} strokeWidth={2} />
      </button>
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
                placeholder="Nome da tarefa *"
                aria-label="Nome da tarefa"
                oninput={(event) => {
                  form.nome = event.currentTarget.value;
                  event.currentTarget.setCustomValidity("");
                }}
              />
            </div>

            <div class="two-column-grid full">
              <div class="selector-field">
                <GlobalSelector
                  items={businessItems}
                  bind:value={form.negocioId}
                  presentation="search"
                  selection="single"
                  label="Negócio"
                  placeholder="Digite para buscar negócio"
                  emptyMessage="Nenhum negócio encontrado."
                  icon={BriefcaseBusiness}
                  controlIcon={BriefcaseBusiness}
                  required
                  disabled={viewOnly ||
                    businessLoading ||
                    Boolean(businessError)}
                  onchange={selectBusiness}
                />
                {#if businessLoading}
                  <p class="catalog-state" role="status">
                    Carregando negócios…
                  </p>
                {:else if businessError}
                  <div class="catalog-state catalog-state--error" role="alert">
                    <span>{businessError}</span>
                    <button
                      type="button"
                      onclick={() => void loadBusinessCatalog()}
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
                  placeholder={form.negocioId
                    ? "Digite para buscar projeto"
                    : "Selecione um negócio primeiro"}
                  emptyMessage="Nenhum projeto encontrado para este negócio."
                  icon={FolderKanban}
                  controlIcon={FolderKanban}
                  required
                  disabled={viewOnly ||
                    !form.negocioId ||
                    businessLoading ||
                    projectLoading ||
                    Boolean(businessError) ||
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
                      onclick={() => void loadProjectCatalog()}
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
                placeholder="Selecione a pessoa responsável"
                emptyMessage="Nenhum membro disponível neste workspace."
                icon={UsersRound}
                controlIcon={UsersRound}
                showInitials
                required
                onchange={selectResponsible}
                disabled={viewOnly ||
                  !form.projetoId ||
                  projectLoading ||
                  Boolean(projectError)}
              />

              <div
                class:date-control--empty={!form.dataEntrega}
                class="control date-control"
              >
                <span class="control-icon" aria-hidden="true">
                  <CalendarDays size={16} strokeWidth={1.8} />
                </span>
                <input
                  bind:value={form.dataEntrega}
                  type="date"
                  placeholder="Data de entrega"
                  disabled={viewOnly}
                  aria-label="Data de entrega da tarefa"
                />
                {#if !form.dataEntrega}
                  <span class="date-placeholder" aria-hidden="true"
                    >Data de entrega</span
                  >
                {/if}
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

        <section class="form-section subtasks-section">
          <div class="section-heading">
            <h3>Subtarefas</h3>
            {#if !viewOnly}
              <button
                class="add-subtask"
                type="button"
                disabled={subtasks.length >= 10}
                onclick={addSubtask}
              >
                <Plus size={16} strokeWidth={2} />
                <span
                  >{subtasks.length >= 10
                    ? "Limite de 10 subtarefas"
                    : "Adicionar subtarefa"}</span
                >
              </button>
            {/if}
          </div>

          {#if subtasks.length > 0}
            <div class="subtask-list">
              {#each subtasks as subtask (subtask.localId)}
                <div class="subtask-row" data-subtask-id={subtask.localId}>
                  <label
                    class="subtask-check"
                    class:subtask-check--checked={subtaskCompleted(
                      subtask.status,
                    )}
                    title={subtaskCompleted(subtask.status)
                      ? "Subtarefa concluída"
                      : "Subtarefa pendente"}
                  >
                    <input
                      type="checkbox"
                      checked={subtaskCompleted(subtask.status)}
                      disabled={viewOnly}
                      aria-label={subtaskCompleted(subtask.status)
                        ? "Marcar subtarefa como pendente"
                        : "Marcar subtarefa como concluída"}
                      onchange={(event) =>
                        setSubtaskCompleted(
                          subtask,
                          event.currentTarget.checked,
                        )}
                    />
                    <span class="checkbox-indicator" aria-hidden="true">
                      {#if subtaskCompleted(subtask.status)}
                        <Check size={17} strokeWidth={2.5} />
                      {/if}
                    </span>
                  </label>

                  <div class="control">
                    <span class="control-icon" aria-hidden="true">
                      <ListTodo size={16} strokeWidth={1.8} />
                    </span>
                    <input
                      bind:value={subtask.nome}
                      type="text"
                      maxlength="120"
                      disabled={viewOnly}
                      placeholder="Nome da subtarefa"
                      aria-label="Nome da subtarefa"
                    />
                  </div>

                  <div class="control">
                    <span class="control-icon" aria-hidden="true">
                      <Timer size={16} strokeWidth={1.8} />
                    </span>
                    <input
                      bind:value={subtask.duracao}
                      type="number"
                      min={MIN_SUBTASK_DURATION_HOURS}
                      max={MAX_SUBTASK_DURATION_HOURS}
                      step="0.5"
                      required={Boolean(subtask.nome.trim())}
                      disabled={viewOnly}
                      placeholder="Duração"
                      aria-label="Duração da subtarefa em horas"
                      onchange={() =>
                        (subtask.duracao = normalizedDuration(subtask.duracao))}
                    />
                  </div>

                  {#if !viewOnly}
                    <button
                      class="remove-subtask"
                      type="button"
                      aria-label="Remover subtarefa"
                      title="Remover subtarefa"
                      onclick={() => removeSubtask(subtask.localId)}
                    >
                      <Trash2 size={17} strokeWidth={1.9} />
                    </button>
                  {/if}
                </div>
              {/each}
            </div>
          {:else}
            <p class="empty-state">Nenhuma subtarefa cadastrada.</p>
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
                disabled={businessLoading ||
                  projectLoading ||
                  Boolean(businessError) ||
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
                disabled={businessLoading ||
                  projectLoading ||
                  Boolean(businessError) ||
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

  header {
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
  }

  h2 {
    font-size: var(--text-xl);
    line-height: 1.25;
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

  .date-control input,
  .date-placeholder {
    grid-column: 2;
    grid-row: 1;
  }

  .date-placeholder {
    min-width: 0;
    overflow: hidden;
    color: var(--muted);
    font-size: var(--text-md);
    font-weight: 400;
    line-height: 1.45;
    pointer-events: none;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .date-control:focus-within .date-placeholder {
    visibility: hidden;
  }

  .date-control--empty:not(:focus-within) input::-webkit-datetime-edit {
    color: transparent;
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

  .add-subtask {
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

  .add-subtask:hover {
    border-color: color-mix(in srgb, var(--primary) 42%, var(--border));
    background: var(--surface-hover, var(--surface-soft));
  }

  .add-subtask:disabled,
  .add-subtask:disabled:hover {
    border-color: var(--border);
    color: var(--muted);
    background: var(--surface-soft);
    cursor: not-allowed;
  }

  .subtask-list {
    display: grid;
    gap: 8px;
  }

  .subtask-row {
    display: grid;
    grid-template-columns: 58px minmax(200px, 1fr) 82px 58px;
    gap: 8px;
    align-items: center;
  }

  .subtask-check {
    position: relative;
    display: grid;
    width: 58px;
    height: 58px;
    border: 1px solid var(--border);
    border-radius: var(--radius-xl);
    color: var(--muted);
    background: var(--panel);
    cursor: pointer;
    transition:
      border-color var(--motion-fast) ease,
      color var(--motion-fast) ease,
      background var(--motion-fast) ease;
    place-items: center;
  }

  .subtask-check:hover,
  .subtask-check:focus-within {
    border-color: color-mix(in srgb, var(--primary) 45%, var(--border));
  }

  .subtask-check--checked {
    border-color: color-mix(in srgb, var(--primary) 55%, var(--border));
    color: var(--primary);
    background: color-mix(in srgb, var(--primary) 7%, var(--panel));
  }

  .subtask-check input,
  .view-mode .subtask-check input:disabled {
    position: absolute;
    width: 1px;
    height: 1px;
    opacity: 0;
  }

  .subtask-check:has(input:disabled) {
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

  .remove-subtask {
    display: inline-flex;
    width: 58px;
    min-width: 58px;
    height: 58px;
    min-height: 58px;
    align-items: center;
    justify-content: center;
    padding: 0;
    border: 1px solid var(--border);
    border-radius: var(--radius-xl);
    color: var(--danger);
    background: var(--panel);
    box-shadow: none;
  }

  .remove-subtask:hover {
    border-color: color-mix(in srgb, var(--danger) 45%, var(--border));
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

    header {
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

    .subtask-check {
      width: 52px;
      height: 52px;
      border-radius: var(--radius-lg);
    }

    .two-column-grid,
    .three-column-grid,
    .subtask-row {
      grid-template-columns: minmax(0, 1fr);
    }

    .remove-subtask {
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

    .add-subtask {
      width: 100%;
    }
  }
</style>
