<script lang="ts">
  import { goto } from "$app/navigation";
  import { deliveryConfig } from "$lib/entities/catalog";
  import {
    BusinessApiError,
    businessToEntityRecord,
    listAllActiveBusinesses,
    observeBusinesses,
  } from "$lib/businesses/client";
  import TaskForm, { type TaskFormMode } from "$lib/entities/TaskForm.svelte";
  import { isArchivedRecord } from "$lib/entities/storage";
  import type { EntityRecord } from "$lib/entities/types";
  import {
    ProjectApiError,
    getProjectOptions,
    listAllActiveProjects,
    observeProjects,
    projectToEntityRecord,
  } from "$lib/projects/client";
  import {
    currentSettings,
    loadSettingsFromServer,
  } from "$lib/settings/client";
  import { defaultSettings } from "$lib/settings/defaults";
  import {
    createTask,
    entityValuesToTaskCreateInput,
    listAllTasks,
    observeTasks,
    TaskApiError,
    taskToEntityRecord,
    taskVersionFromRecord,
    updateTaskBoard,
    updateTaskFromEntityValues,
  } from "$lib/tasks/client";
  import CardDropPlaceholder from "$lib/dnd/CardDropPlaceholder.svelte";
  import { cardDropBeforeId } from "$lib/dnd/card-drop-position";
  import EntityCard from "$lib/ui/EntityCard.svelte";
  import type { EntityCardItem } from "$lib/ui/entity-card";
  import { useGlobalFilters } from "$lib/filters/global-filters.svelte";
  import { belongsToWorkspace } from "$lib/workspaces/project-scope";
  import {
    CURRENT_USER,
    GLOBAL_WORKSPACE_ID,
    loadActiveWorkspaceId,
    loadWorkspaces,
    loadWorkspaceUsers,
    observeWorkspaces,
    PERSONAL_WORKSPACE_ID,
    type WorkspaceUser,
  } from "$lib/workspaces/workspace-storage";
  import {
    ArrowDown,
    ArrowUp,
    BriefcaseBusiness,
    Check,
    CircleDot,
    FolderKanban,
    Flame,
    Flag,
    ListTodo,
    Plus,
    Search,
    TriangleAlert,
    X,
  } from "@lucide/svelte";
  import { onMount } from "svelte";

  type ViewMode = "status" | "priority" | "client" | "project";
  type PautaOrderBy = "manual" | "priority" | "deadline" | "updated";
  type ColumnDefinition = {
    id: string;
    value: string;
    title: string;
    meta: string;
    color: string;
    relationId?: string;
    businessName?: string;
  };
  type PautaColumn = ColumnDefinition & { items: EntityRecord[] };

  const views: { id: ViewMode; label: string }[] = [
    { id: "status", label: "Status" },
    { id: "priority", label: "Prioridade" },
    { id: "client", label: "Cliente" },
    { id: "project", label: "Projeto" },
  ];
  const priorityRank: Record<string, number> = {
    urgente: 5,
    emergente: 4,
    alta: 3,
    normal: 2,
    baixa: 1,
  };
  const priorityColors: Record<string, string> = {
    urgente: "#ef4444",
    emergente: "#f97316",
    alta: "#f59e0b",
    normal: "#2e56ff",
    baixa: "#64748b",
  };
  const dynamicColumnColors = [
    "#2e56ff",
    "#5dac83",
    "#8b5cf6",
    "#f59e0b",
    "#0ea5e9",
    "#ec4899",
  ];
  const globalFilters = useGlobalFilters();

  let settings = $state(defaultSettings);
  let allRecords = $state<EntityRecord[]>([]);
  let projectRecords = $state<EntityRecord[]>([]);
  let businessRecords = $state<EntityRecord[]>([]);
  let businessesLoading = $state(false);
  let businessesError = $state("");
  let businessesAbortController: AbortController | undefined;
  let projectsLoading = $state(false);
  let projectsError = $state("");
  let projectsAbortController: AbortController | undefined;
  let tasksLoading = $state(false);
  let tasksError = $state("");
  let tasksAbortController: AbortController | undefined;
  let taskRequestPending = $state(false);
  let projectWorkspaceId = $state("");
  let localWorkspaceUsers = $state<WorkspaceUser[]>([CURRENT_USER]);
  let serverWorkspaceUsers = $state<WorkspaceUser[]>([]);
  let activeWorkspaceId = $state(PERSONAL_WORKSPACE_ID);
  let viewMode = $state<ViewMode>("status");
  let orderBy = $state<PautaOrderBy>("priority");
  let showDone = $state(false);
  let showArchived = $state(false);
  let query = $state("");
  let formOpen = $state(false);
  let selectedTask = $state<EntityRecord | undefined>();
  let taskFormMode = $state<TaskFormMode>("create");
  let draggedTaskId = $state<string | undefined>();
  let dragTargetId = $state<string | undefined>();
  let dragBeforeTaskId = $state<string | undefined>();
  let dropPlaceholderHeight = $state(92);
  let boardElement = $state<HTMLDivElement>();
  let boardPan = $state<{
    pointerId: number;
    startX: number;
    startScrollLeft: number;
    captureTarget: HTMLElement;
    moved: boolean;
  } | null>(null);

  let responsibleFilters = $derived(globalFilters.responsibleIds);
  let businessCategoryFilters = $derived(globalFilters.businessCategoryKeys);
  let taskCategoryFilters = $derived(globalFilters.taskCategoryKeys);
  let workspaceUsers = $derived.by(() => {
    const users = [...serverWorkspaceUsers, ...localWorkspaceUsers];
    return users.filter(
      (user, index) => users.findIndex(({ id }) => id === user.id) === index,
    );
  });
  $effect(() => {
    globalFilters.setUsers(workspaceUsers);
    globalFilters.setCatalogs(settings);
  });
  let scopedRecords = $derived(
    allRecords.filter((record) => {
      const belongsToParticipatingProject = taskIsVisibleInProjectScope(record);
      const archived = isArchivedRecord(record);
      const done = (record.status || "planejamento") === "conclusao";
      const searchText = [
        record.nome,
        record.negocio,
        record.cliente,
        record.projeto,
        record.responsavel,
        record.prioridade,
        record.status,
      ]
        .filter(Boolean)
        .join(" ")
        .toLocaleLowerCase("pt-BR");
      const responsibleMatches =
        responsibleFilters.length === 0 ||
        responsibleFilters.some((userId) =>
          recordMatchesResponsible(record, userId),
        );
      const businessCategory = businessCategoryFor(record);
      const businessMatches =
        businessCategoryFilters.length === 0 ||
        businessCategoryFilters.includes(businessCategory);
      const taskMatches =
        taskCategoryFilters.length === 0 ||
        taskCategoryFilters.includes(record.categoria || record.stage || "");
      return (
        belongsToParticipatingProject &&
        (viewMode === "status" || showArchived || !archived) &&
        (showDone || !done) &&
        responsibleMatches &&
        businessMatches &&
        taskMatches &&
        searchText.includes(query.trim().toLocaleLowerCase("pt-BR"))
      );
    }),
  );
  let columns = $derived(buildColumns(scopedRecords, viewMode));

  function taskIsVisibleInProjectScope(record: EntityRecord): boolean {
    const projectId = record.projetoId || record.project_id || "";
    const project = projectId
      ? projectRecords.find((candidate) => candidate.id === projectId)
      : undefined;
    if (projectId && !project) {
      // The task snapshot is already tenant-scoped by the server. Its current
      // project may be archived and therefore absent from the active catalog.
      return belongsToWorkspace(record, activeWorkspaceId);
    }
    if (!project) return belongsToWorkspace(record, activeWorkspaceId);

    const recordedWorkspaceId =
      record.projectWorkspaceId || record.project_workspace_id || "";
    return !recordedWorkspaceId || recordedWorkspaceId === project.workspaceId;
  }

  function refreshWorkspace(): void {
    activeWorkspaceId = loadActiveWorkspaceId();
    const workspaces = loadWorkspaces();
    const activeWorkspace = workspaces.find(
      ({ id }) => id === activeWorkspaceId,
    );
    const memberIds = new Set(
      activeWorkspaceId === GLOBAL_WORKSPACE_ID
        ? workspaces.flatMap(({ members }) =>
            members.map(({ userId }) => userId),
          )
        : (activeWorkspace?.members.map(({ userId }) => userId) ?? [
            CURRENT_USER.id,
          ]),
    );
    localWorkspaceUsers = loadWorkspaceUsers().filter(({ id }) =>
      memberIds.has(id),
    );
  }

  async function reloadTasks(): Promise<void> {
    tasksAbortController?.abort();
    const controller = new AbortController();
    tasksAbortController = controller;
    tasksLoading = true;
    tasksError = "";
    try {
      const tasks = await listAllTasks({
        archived: "include",
        signal: controller.signal,
      });
      if (controller.signal.aborted) return;
      allRecords = tasks.map(taskToEntityRecord);
    } catch (cause) {
      if (controller.signal.aborted) return;
      tasksError =
        cause instanceof TaskApiError
          ? cause.message
          : "Não foi possível carregar as tarefas.";
      allRecords = [];
    } finally {
      if (tasksAbortController === controller) tasksLoading = false;
    }
  }

  async function reloadBusinesses(): Promise<void> {
    businessesAbortController?.abort();
    const controller = new AbortController();
    businessesAbortController = controller;
    businessesLoading = true;
    businessesError = "";

    try {
      const businesses = await listAllActiveBusinesses({
        signal: controller.signal,
      });
      if (controller.signal.aborted) return;
      const mapped = businesses.map(businessToEntityRecord);
      businessRecords = mapped;
    } catch (cause) {
      if (controller.signal.aborted) return;
      businessesError =
        cause instanceof BusinessApiError
          ? cause.message
          : "Não foi possível carregar os negócios.";
      businessRecords = [];
    } finally {
      if (businessesAbortController === controller) businessesLoading = false;
    }
  }

  async function reloadProjects(): Promise<void> {
    projectsAbortController?.abort();
    const controller = new AbortController();
    projectsAbortController = controller;
    projectsLoading = true;
    projectsError = "";

    try {
      const [projects, options] = await Promise.all([
        listAllActiveProjects({ signal: controller.signal }),
        getProjectOptions({ signal: controller.signal }),
      ]);
      if (controller.signal.aborted) return;
      if (
        options.workspaceId !== GLOBAL_WORKSPACE_ID &&
        projects.some((project) => project.workspaceId !== options.workspaceId)
      ) {
        throw new ProjectApiError(
          409,
          "O workspace mudou durante o carregamento. Tente novamente.",
        );
      }
      projectWorkspaceId = options.workspaceId;
      projectRecords = projects.map(projectToEntityRecord);
      serverWorkspaceUsers = options.members.map((member) => ({
        id: member.userId,
        name: member.name,
        email: member.email,
        avatarUrl: member.avatarUrl ?? undefined,
      }));
    } catch (cause) {
      if (controller.signal.aborted) return;
      projectsError =
        cause instanceof ProjectApiError
          ? cause.message
          : "Não foi possível carregar os projetos.";
      projectRecords = [];
      serverWorkspaceUsers = [];
      projectWorkspaceId = "";
    } finally {
      if (projectsAbortController === controller) projectsLoading = false;
    }
  }

  function applySettingsPreferences(): void {
    const configuredMode = settings.pautaGroupBy;
    if (
      configuredMode === "status" ||
      configuredMode === "priority" ||
      configuredMode === "client" ||
      configuredMode === "project"
    ) {
      viewMode = configuredMode;
    } else if (configuredMode === "prioridade") {
      viewMode = "priority";
    } else if (configuredMode === "cliente") {
      viewMode = "client";
    } else if (configuredMode === "projeto") {
      viewMode = "project";
    }
    if (
      settings.pautaOrderBy === "manual" ||
      settings.pautaOrderBy === "priority" ||
      settings.pautaOrderBy === "deadline" ||
      settings.pautaOrderBy === "updated"
    ) {
      orderBy = settings.pautaOrderBy;
    }
    showDone = settings.pautaShowDone;
    showArchived = settings.pautaShowArchived;
  }

  onMount(() => {
    settings = currentSettings();
    applySettingsPreferences();
    void loadSettingsFromServer()
      .then((loaded) => {
        settings = loaded;
        applySettingsPreferences();
      })
      .catch(() => undefined);
    refreshWorkspace();
    void reloadTasks();
    void reloadBusinesses();
    void reloadProjects();

    const stopTasks = observeTasks(() => {
      if (!taskRequestPending) void reloadTasks();
    });
    const stopBusinesses = observeBusinesses(() => void reloadBusinesses());
    const stopProjects = observeProjects(() => void reloadProjects());
    const stopWorkspaces = observeWorkspaces(() => {
      refreshWorkspace();
      void reloadTasks();
      void reloadBusinesses();
      void reloadProjects();
    });
    return () => {
      businessesAbortController?.abort();
      projectsAbortController?.abort();
      tasksAbortController?.abort();
      stopTasks();
      stopBusinesses();
      stopProjects();
      stopWorkspaces();
    };
  });

  function normalized(value: string | undefined): string {
    return (value ?? "").trim().toLocaleLowerCase("pt-BR");
  }

  function recordMatchesResponsible(
    record: EntityRecord,
    userId: string,
  ): boolean {
    try {
      const ids = JSON.parse(record.responsibleUserIds || "[]") as unknown;
      if (Array.isArray(ids) && ids.includes(userId)) return true;
    } catch {
      // O fallback singular abaixo cobre registros sem o array tipado.
    }
    const user = workspaceUsers.find(({ id }) => id === userId);
    const recordUserId = record.responsavelId || record.assigned_user_id || "";
    if (recordUserId) return recordUserId === userId;
    return !!user && normalized(record.responsavel) === normalized(user.name);
  }

  function businessCategoryFor(record: EntityRecord): string {
    const businessId =
      record.negocioId || record.negocio_id || record.business_id || "";
    const business = businessId
      ? businessRecords.find((candidate) => candidate.id === businessId)
      : undefined;
    return business?.categoria || business?.category || "";
  }

  function compareTasks(left: EntityRecord, right: EntityRecord): number {
    const leftManualOrder = pautaOrder(left, viewMode);
    const rightManualOrder = pautaOrder(right, viewMode);
    if (leftManualOrder !== undefined || rightManualOrder !== undefined) {
      if (leftManualOrder === undefined) return 1;
      if (rightManualOrder === undefined) return -1;
      if (leftManualOrder !== rightManualOrder)
        return leftManualOrder - rightManualOrder;
    }
    if (orderBy === "manual") return 0;
    if (orderBy === "priority") {
      return (
        (priorityRank[right.prioridade || right.priority] ?? 0) -
          (priorityRank[left.prioridade || left.priority] ?? 0) ||
        (left.nome ?? "").localeCompare(right.nome ?? "", "pt-BR")
      );
    }
    if (orderBy === "deadline") {
      const leftDeadline =
        left.dataEntrega || left.data || left.prazo || "9999-12-31";
      const rightDeadline =
        right.dataEntrega || right.data || right.prazo || "9999-12-31";
      return (
        leftDeadline.localeCompare(rightDeadline) ||
        (left.nome ?? "").localeCompare(right.nome ?? "", "pt-BR")
      );
    }
    return (
      (right.updatedAt ?? "").localeCompare(left.updatedAt ?? "") ||
      (left.nome ?? "").localeCompare(right.nome ?? "", "pt-BR")
    );
  }

  function pautaOrders(
    record: EntityRecord,
  ): Partial<Record<ViewMode, number>> {
    try {
      const parsed = JSON.parse(record.pautaOrderByView || "{}");
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
      return {};
    }
  }

  function pautaOrder(
    record: EntityRecord,
    mode: ViewMode,
  ): number | undefined {
    const order = pautaOrders(record)[mode];
    return Number.isFinite(order) ? order : undefined;
  }

  function withPautaOrder(
    record: EntityRecord,
    mode: ViewMode,
    order: number,
  ): EntityRecord {
    return {
      ...record,
      pautaOrderByView: JSON.stringify({
        ...pautaOrders(record),
        [mode]: order,
      }),
    };
  }

  function buildColumns(
    records: EntityRecord[],
    mode: ViewMode,
  ): PautaColumn[] {
    const definitions = columnDefinitions(records, mode);
    return definitions.map((definition) => ({
      ...definition,
      items: records
        .filter(
          (record) => recordColumnValue(record, mode) === definition.value,
        )
        .sort(compareTasks),
    }));
  }

  function columnDefinitions(
    records: EntityRecord[],
    mode: ViewMode,
  ): ColumnDefinition[] {
    if (mode === "status") {
      return settings.taskStatuses.map(({ key, label, color }) => ({
        id: `status:${key}`,
        value: key,
        title: label,
        meta: "Status",
        color,
      }));
    }
    if (mode === "priority") {
      return [...settings.taskPriorities].reverse().map(({ key, label }) => ({
        id: `priority:${key}`,
        value: key,
        title: label,
        meta: "Prioridade",
        color: priorityColors[key] ?? "#64748b",
      }));
    }

    const groups = new Map<string, ColumnDefinition>();
    for (const record of records) {
      const relationId =
        mode === "client"
          ? record.negocioId || record.business_id
          : record.projetoId || record.project_id;
      const label =
        mode === "client"
          ? record.negocio || record.cliente || "Sem cliente"
          : record.projeto || "Sem projeto";
      const value = relationId || label;
      if (!groups.has(value)) {
        const project =
          mode === "project"
            ? projectRecords.find((candidate) => candidate.id === relationId)
            : undefined;
        groups.set(value, {
          id: `${mode}:${value}`,
          value,
          title: label,
          meta: mode === "client" ? "Cliente" : "Projeto",
          color: dynamicColumnColors[groups.size % dynamicColumnColors.length],
          relationId,
          businessName: project?.negocio || project?.cliente,
        });
      }
    }
    return [...groups.values()].sort((left, right) =>
      left.title.localeCompare(right.title, "pt-BR"),
    );
  }

  function recordColumnValue(record: EntityRecord, mode: ViewMode): string {
    if (mode === "status") return record.status || "planejamento";
    if (mode === "priority") {
      return record.prioridade || record.priority || "normal";
    }
    if (mode === "client") {
      return (
        record.negocioId ||
        record.business_id ||
        record.negocio ||
        record.cliente ||
        "Sem cliente"
      );
    }
    return (
      record.projetoId || record.project_id || record.projeto || "Sem projeto"
    );
  }

  function statusMeta(record: EntityRecord): { label: string; color: string } {
    const status = settings.taskStatuses.find(
      ({ key }) => key === (record.status || "planejamento"),
    );
    return {
      label: status?.label || record.status || "Fila",
      color: status?.color || "#64748b",
    };
  }

  function subtaskProgress(record: EntityRecord): string {
    try {
      const parsed: unknown = JSON.parse(record.subtarefas || "[]");
      if (!Array.isArray(parsed)) return "0/0";
      const completed = parsed.filter((item) => {
        if (!item || typeof item !== "object") return false;
        const status = String((item as { status?: unknown }).status ?? "");
        return ["concluida", "concluido", "feito", "conclusao"].includes(
          status.toLocaleLowerCase("pt-BR"),
        );
      }).length;
      return `${completed}/${parsed.length}`;
    } catch {
      return "0/0";
    }
  }

  function responsibleUser(record: EntityRecord): WorkspaceUser | undefined {
    const id = record.responsavelId || record.assigned_user_id;
    return workspaceUsers.find((user) => user.id === id);
  }

  function toTaskCard(record: EntityRecord): EntityCardItem {
    const status = statusMeta(record);
    return {
      id: record.id,
      kind: "tarefa",
      title: record.nome || "Tarefa sem nome",
      status: status.label,
      statusColor: status.color,
      primary: record.negocio || record.cliente || "Cliente não informado",
      secondary: record.projeto || "Projeto não informado",
      relation: record.categoria || record.descricao || "Tarefa planejada",
      responsible: record.responsavel || "Sem responsável",
      responsibleAvatarUrl: responsibleUser(record)?.avatarUrl,
      steps: subtaskProgress(record),
    };
  }

  function priorityIcon(priority: string) {
    if (priority === "urgente") return Flame;
    if (priority === "emergente") return TriangleAlert;
    if (priority === "alta") return ArrowUp;
    if (priority === "baixa") return ArrowDown;
    return CircleDot;
  }

  function columnIcon(column: PautaColumn) {
    if (viewMode === "priority") return priorityIcon(column.value);
    if (viewMode === "client") return BriefcaseBusiness;
    if (viewMode === "project") return FolderKanban;
    if (column.value === "conclusao") return Check;
    return Flag;
  }

  function beginDrag(event: DragEvent, taskId: string): void {
    draggedTaskId = taskId;
    dragTargetId = undefined;
    dragBeforeTaskId = undefined;
    dropPlaceholderHeight = (
      event.currentTarget as HTMLElement
    ).getBoundingClientRect().height;
    event.dataTransfer?.setData("text/plain", taskId);
    if (event.dataTransfer) event.dataTransfer.effectAllowed = "move";
  }

  function endDrag(): void {
    draggedTaskId = undefined;
    dragTargetId = undefined;
    dragBeforeTaskId = undefined;
  }

  function updateTaskDropTarget(event: DragEvent, column: PautaColumn): void {
    event.preventDefault();
    dragTargetId = column.id;
    dragBeforeTaskId = cardDropBeforeId(
      event,
      event.currentTarget as HTMLElement,
      {
        cardSelector: "[data-pauta-task]",
        idAttribute: "data-pauta-task",
        excludeId: draggedTaskId,
      },
    );
    if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
  }

  function leaveTaskDropTarget(event: DragEvent, column: PautaColumn): void {
    const columnElement = event.currentTarget as HTMLElement;
    if (
      event.relatedTarget instanceof Node &&
      columnElement.contains(event.relatedTarget)
    )
      return;
    const bounds = columnElement.getBoundingClientRect();
    const pointerIsInside =
      event.clientX >= bounds.left &&
      event.clientX <= bounds.right &&
      event.clientY >= bounds.top &&
      event.clientY <= bounds.bottom;
    if (pointerIsInside || dragTargetId !== column.id) return;
    dragTargetId = undefined;
    dragBeforeTaskId = undefined;
  }

  function dropTask(event: DragEvent, column: PautaColumn): void {
    event.preventDefault();
    const taskId =
      draggedTaskId || event.dataTransfer?.getData("text/plain") || "";
    if (!taskId) return;
    void moveTask(
      taskId,
      column,
      dragTargetId === column.id ? dragBeforeTaskId : undefined,
    );
    endDrag();
  }

  async function moveTask(
    taskId: string,
    column: PautaColumn,
    beforeId?: string,
  ): Promise<void> {
    if (taskRequestPending) return;
    const moved = allRecords.find((record) => record.id === taskId);
    if (!moved || beforeId === taskId) return;
    if (isArchivedRecord(moved)) {
      tasksError = "Tarefas arquivadas n\u00e3o podem ser reordenadas.";
      return;
    }
    if (
      viewMode === "project" &&
      column.relationId &&
      !projectRecords.some((project) => project.id === column.relationId) &&
      (moved.projetoId || moved.project_id) !== column.relationId
    )
      return;

    const sourceValue = recordColumnValue(moved, viewMode);
    if (viewMode === "client" && sourceValue !== column.value) {
      tasksError =
        "Para trocar o negócio, mova a tarefa pela visão de projeto ou edite o formulário.";
      return;
    }
    // Reindex the complete active source/target columns, not only the cards
    // currently visible through search and filters. This prevents hidden tasks
    // from retaining duplicate positions.
    const activeBoardRecords = allRecords.filter(
      (record) => !isArchivedRecord(record),
    );
    const sourceItems = activeBoardRecords
      .filter((record) => recordColumnValue(record, viewMode) === sourceValue)
      .sort(compareTasks);
    const targetItems =
      sourceValue === column.value
        ? sourceItems
        : activeBoardRecords
            .filter(
              (record) => recordColumnValue(record, viewMode) === column.value,
            )
            .sort(compareTasks);
    const targetIds = targetItems
      .filter((record) => record.id !== taskId)
      .map((record) => record.id);
    const beforeIndex = beforeId ? targetIds.indexOf(beforeId) : -1;
    targetIds.splice(
      beforeIndex >= 0 ? beforeIndex : targetIds.length,
      0,
      taskId,
    );

    const orderById = new Map<string, number>();
    if (sourceValue !== column.value) {
      sourceItems
        .filter((record) => record.id !== taskId)
        .forEach((record, index) => orderById.set(record.id, index));
    }
    targetIds.forEach((id, index) => orderById.set(id, index));

    const timestamp = new Date().toISOString();
    const previousRecords = allRecords;
    const nextRecords = allRecords.map((record) => {
      let next = record;
      if (record.id === taskId && sourceValue !== column.value) {
        if (viewMode === "status") {
          next = { ...record, status: column.value, updatedAt: timestamp };
        } else if (viewMode === "priority") {
          next = {
            ...record,
            prioridade: column.value,
            priority: column.value,
            updatedAt: timestamp,
          };
        } else if (viewMode === "client") {
          next = {
            ...record,
            negocio: column.title === "Sem cliente" ? "" : column.title,
            negocioId: column.relationId || "",
            business_id: column.relationId || "",
            updatedAt: timestamp,
          };
        } else {
          const project = projectRecords.find(
            (candidate) => candidate.id === column.relationId,
          );
          next = {
            ...record,
            projeto: column.title === "Sem projeto" ? "" : column.title,
            projetoId: column.relationId || "",
            project_id: column.relationId || "",
            projectWorkspaceId: project?.workspaceId || "",
            project_workspace_id: project?.workspaceId || "",
            negocio: project?.negocio || column.businessName || record.negocio,
            negocioId: project?.negocioId || record.negocioId,
            business_id:
              project?.negocioId || project?.business_id || record.business_id,
            businessWorkspaceId:
              project?.workspaceId || record.businessWorkspaceId,
            business_workspace_id:
              project?.workspaceId || record.business_workspace_id,
            updatedAt: timestamp,
          };
        }
      }
      const visualOrder = orderById.get(record.id);
      return visualOrder === undefined
        ? next
        : withPautaOrder(next, viewMode, visualOrder);
    });
    const changedRecords = nextRecords.filter((record) => {
      const previous = previousRecords.find(({ id }) => id === record.id);
      return previous && JSON.stringify(previous) !== JSON.stringify(record);
    });
    if (!changedRecords.length) return;
    const affectedRecords = nextRecords.filter((record) =>
      orderById.has(record.id),
    );

    allRecords = nextRecords;
    taskRequestPending = true;
    tasksError = "";
    try {
      await updateTaskBoard({
        view: viewMode === "client" ? "business" : viewMode,
        // Every task in both columns participates in the version check, even
        // when its position stayed the same. Concurrent appends then contend
        // on the same board snapshot instead of creating duplicate positions.
        updates: affectedRecords.map((affected) => {
          const previous = previousRecords.find(({ id }) => id === affected.id);
          if (!previous) throw new Error("Original task not found.");
          const position = pautaOrder(affected, viewMode);
          if (position === undefined)
            throw new Error("Task position not found.");
          return {
            id: affected.id,
            version: taskVersionFromRecord(previous),
            position,
            columnKey: recordColumnValue(affected, viewMode),
          };
        }),
      });
    } catch (cause) {
      tasksError =
        cause instanceof TaskApiError
          ? cause.message
          : "Não foi possível mover a tarefa.";
    } finally {
      taskRequestPending = false;
      await reloadTasks();
    }
  }

  function beginBoardPan(event: PointerEvent): void {
    if (!boardElement || boardPan || event.button !== 0 || !event.isPrimary)
      return;

    const captureTarget = event.currentTarget as HTMLElement;
    captureTarget.setPointerCapture(event.pointerId);
    boardPan = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startScrollLeft: boardElement.scrollLeft,
      captureTarget,
      moved: false,
    };
    event.preventDefault();
  }

  function moveBoardPan(event: PointerEvent): void {
    if (!boardElement || !boardPan || event.pointerId !== boardPan.pointerId)
      return;

    const delta = event.clientX - boardPan.startX;
    if (!boardPan.moved && Math.abs(delta) < 4) return;
    if (!boardPan.moved) boardPan = { ...boardPan, moved: true };
    boardElement.scrollLeft = boardPan.startScrollLeft - delta;
    event.preventDefault();
  }

  function boardColumnLeft(column: HTMLElement): number {
    if (!boardElement) return 0;
    return (
      column.getBoundingClientRect().left -
      boardElement.getBoundingClientRect().left +
      boardElement.scrollLeft
    );
  }

  function snapBoardView(behavior: ScrollBehavior = "smooth"): void {
    if (!boardElement) return;
    const columns = Array.from(
      boardElement.querySelectorAll<HTMLElement>("[data-pauta-column]"),
    );
    const anchor = columns.reduce<HTMLElement | null>((nearest, column) => {
      if (!nearest) return column;
      return Math.abs(boardColumnLeft(column) - boardElement!.scrollLeft) <
        Math.abs(boardColumnLeft(nearest) - boardElement!.scrollLeft)
        ? column
        : nearest;
    }, null);
    if (anchor)
      boardElement.scrollTo({ left: boardColumnLeft(anchor), behavior });
  }

  function endBoardPan(event: PointerEvent): void {
    if (!boardPan || event.pointerId !== boardPan.pointerId) return;
    const completedPan = boardPan;
    if (completedPan.captureTarget.hasPointerCapture(event.pointerId)) {
      completedPan.captureTarget.releasePointerCapture(event.pointerId);
    }
    boardPan = null;
    if (completedPan.moved) snapBoardView();
  }

  function openCreate(): void {
    selectedTask = undefined;
    taskFormMode = "create";
    formOpen = true;
  }

  function openTask(record: EntityRecord): void {
    selectedTask = record;
    taskFormMode = "view";
    formOpen = true;
  }

  function closeForm(): void {
    formOpen = false;
    selectedTask = undefined;
    taskFormMode = "create";
  }

  async function saveTask(values: Record<string, string>): Promise<void> {
    if (taskRequestPending) return;
    taskRequestPending = true;
    tasksError = "";
    try {
      if (selectedTask) {
        await updateTaskFromEntityValues(selectedTask.id, values, selectedTask);
      } else {
        await createTask(entityValuesToTaskCreateInput(values));
      }
      closeForm();
    } catch (cause) {
      tasksError =
        cause instanceof TaskApiError
          ? cause.message
          : "Não foi possível salvar a tarefa.";
    } finally {
      taskRequestPending = false;
      await reloadTasks();
    }
  }
</script>

<svelte:window
  onpointermove={moveBoardPan}
  onpointerup={endBoardPan}
  onpointercancel={endBoardPan}
/>

<svelte:head><title>Pauta · Demanda</title></svelte:head>

<section
  class="pauta-page"
  aria-label="Pauta de tarefas"
  aria-busy={businessesLoading ||
    projectsLoading ||
    tasksLoading ||
    taskRequestPending}
>
  <div class="pauta-toolbar">
    {#if tasksError}
      <div class="business-load-error" role="alert">
        <span>{tasksError}</span>
        <button type="button" onclick={() => void reloadTasks()}
          >Tentar novamente</button
        >
      </div>
    {/if}
    {#if businessesError}
      <div class="business-load-error" role="alert">
        <span>{businessesError}</span>
        <button type="button" onclick={() => void reloadBusinesses()}
          >Tentar novamente</button
        >
      </div>
    {/if}
    {#if projectsError}
      <div class="business-load-error" role="alert">
        <span>{projectsError}</span>
        <button type="button" onclick={() => void reloadProjects()}
          >Tentar novamente</button
        >
      </div>
    {/if}
    <div
      class="view-switcher"
      role="tablist"
      aria-label="Visualização das colunas"
    >
      {#each views as view}
        <button
          type="button"
          role="tab"
          aria-selected={viewMode === view.id}
          class:active={viewMode === view.id}
          onclick={() => (viewMode = view.id)}
        >
          {view.label}
        </button>
      {/each}
    </div>

    <label class="search-field">
      <Search size={16} aria-hidden="true" />
      <span class="sr-only">Buscar tarefas</span>
      <input bind:value={query} type="search" placeholder="Buscar tarefa" />
      {#if query}
        <button
          type="button"
          aria-label="Limpar busca"
          onclick={() => (query = "")}
        >
          <X size={14} />
        </button>
      {/if}
    </label>
  </div>

  {#if columns.length}
    <div
      class:board-panning={boardPan?.moved}
      class="board-scroll"
      bind:this={boardElement}
    >
      <div
        class="board-columns"
        style={`--column-count: ${Math.min(columns.length, 5)}`}
      >
        {#each columns as column (column.id)}
          {@const ColumnIcon = columnIcon(column)}
          <section
            class:drop-target={dragTargetId === column.id}
            class="pauta-column"
            style={`--column-color: ${column.color}`}
            aria-label={`${column.meta}: ${column.title}`}
            data-pauta-column={column.id}
            ondragover={(event) => updateTaskDropTarget(event, column)}
            ondragleave={(event) => leaveTaskDropTarget(event, column)}
            ondrop={(event) => dropTask(event, column)}
          >
            <header
              class="column-header"
              role="group"
              aria-label={`${column.meta}: ${column.title}. Arraste para navegar pelas colunas.`}
              title="Arraste para navegar pelas colunas"
              onpointerdown={beginBoardPan}
            >
              <div class="column-heading">
                <span class="column-icon"><ColumnIcon size={15} /></span>
                <div>
                  <small>{column.meta}</small>
                  <h2 title={column.title}>{column.title}</h2>
                </div>
              </div>
              <span class="column-count">{column.items.length}</span>
            </header>

            <div class="column-cards">
              {#each column.items as task (task.id)}
                {#if dragTargetId === column.id && dragBeforeTaskId === task.id}
                  <CardDropPlaceholder height={dropPlaceholderHeight} />
                {/if}
                <div
                  class:dragging={draggedTaskId === task.id}
                  class="task-card-wrap"
                  data-pauta-task={task.id}
                  draggable="true"
                  role="button"
                  tabindex="0"
                  aria-label={`Abrir tarefa ${task.nome || "sem nome"}`}
                  ondragstart={(event) => beginDrag(event, task.id)}
                  ondragend={endDrag}
                  onclick={() => openTask(task)}
                  onkeydown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      openTask(task);
                    }
                  }}
                >
                  <EntityCard
                    item={toTaskCard(task)}
                    level={5}
                    interactive={false}
                  />
                </div>
              {/each}
              {#if dragTargetId === column.id && dragBeforeTaskId === undefined}
                <CardDropPlaceholder height={dropPlaceholderHeight} />
              {:else if column.items.length === 0}
                <div class="column-empty">
                  <ListTodo size={18} aria-hidden="true" />
                  <span>Solte uma tarefa aqui</span>
                </div>
              {/if}
            </div>
          </section>
        {/each}
      </div>
    </div>
  {:else}
    <div class="empty-board">
      <ListTodo size={25} aria-hidden="true" />
      <strong>Nenhuma tarefa encontrada</strong>
      <span>Crie uma tarefa ou ajuste a busca para preencher a pauta.</span>
      <button type="button" onclick={openCreate}
        ><Plus size={16} />Nova tarefa</button
      >
    </div>
  {/if}
</section>

{#if formOpen}
  {#key `${selectedTask?.id ?? "new"}:${taskFormMode}`}
    <TaskForm
      config={deliveryConfig}
      record={selectedTask}
      mode={taskFormMode}
      oncancel={closeForm}
      onsave={saveTask}
      onedit={() => (taskFormMode = "edit")}
      onaddtool={() => {
        if (!selectedTask) return;
        const taskId = selectedTask.id;
        closeForm();
        void goto(
          `/ferramentas?novoUso=1&taskId=${encodeURIComponent(taskId)}`,
        );
      }}
    />
  {/key}
{/if}

<style>
  .pauta-page {
    display: grid;
    grid-template-rows: auto minmax(0, 1fr);
    gap: 12px;
    height: 100%;
    min-height: 0;
  }

  .pauta-toolbar {
    position: relative;
    z-index: 4;
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(190px, 260px) minmax(0, 1fr);
    min-width: 0;
    min-height: 58px;
    align-items: center;
    gap: 12px;
    padding: 10px 12px;
    border: 1px solid var(--border);
    border-radius: var(--radius-xl);
    background: var(--panel);
  }

  .business-load-error {
    display: flex;
    grid-column: 1 / -1;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 8px 10px;
    border: 1px solid color-mix(in srgb, var(--danger) 30%, var(--border));
    border-radius: 9px;
    color: var(--danger);
    background: color-mix(in srgb, var(--danger) 7%, var(--surface));
    font-size: var(--text-sm);
  }

  .business-load-error button {
    border: 0;
    color: inherit;
    background: transparent;
    font-weight: 700;
    white-space: nowrap;
  }

  .view-switcher {
    display: inline-flex;
    min-width: 0;
    align-items: center;
    justify-self: start;
    gap: 4px;
    padding: 4px;
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
    background: var(--surface-soft);
  }

  .view-switcher button {
    min-height: 32px;
    padding: 0 12px;
    border: 0;
    border-radius: var(--radius-md);
    color: var(--ink-500);
    background: transparent;
    font: inherit;
    font-size: var(--text-xs);
    font-weight: 600;
    white-space: nowrap;
    cursor: pointer;
  }

  .view-switcher button:hover {
    color: var(--ink-700);
    background: color-mix(in srgb, var(--surface) 72%, transparent);
  }

  .view-switcher button.active {
    color: var(--brand-700);
    background: var(--surface);
    box-shadow: 0 1px 3px rgba(15, 23, 42, 0.09);
  }

  .search-field {
    display: flex;
    width: 100%;
    max-width: 260px;
    min-width: 0;
    min-height: 38px;
    align-items: center;
    gap: 7px;
    grid-column: 3;
    justify-self: end;
    padding: 0 9px;
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
    color: var(--ink-400);
    background: var(--surface);
  }

  .search-field:focus-within {
    border-color: var(--brand-400);
    box-shadow: var(--focus-ring);
  }

  .search-field input {
    width: 100%;
    min-width: 0;
    border: 0;
    outline: 0;
    color: var(--ink-700);
    background: transparent;
    font: inherit;
    font-size: var(--text-xs);
  }

  .search-field button {
    display: inline-grid;
    width: 24px;
    height: 24px;
    flex: 0 0 auto;
    padding: 0;
    border: 0;
    border-radius: 50%;
    color: var(--ink-400);
    background: transparent;
    place-items: center;
    cursor: pointer;
  }

  .empty-board button {
    display: inline-flex;
    min-height: 38px;
    align-items: center;
    justify-content: center;
    gap: 7px;
    padding: 0 13px;
    border: 0;
    border-radius: var(--radius-lg);
    color: white;
    background: var(--brand-600);
    font: inherit;
    font-size: var(--text-xs);
    font-weight: 600;
    white-space: nowrap;
    cursor: pointer;
  }

  .empty-board button:hover {
    background: var(--brand-700);
  }

  .board-scroll {
    min-width: 0;
    min-height: 0;
    overflow-x: auto;
    overflow-y: hidden;
    padding: 1px 1px 8px;
    overscroll-behavior-x: contain;
    scroll-snap-type: x mandatory;
    scrollbar-width: none;
    -ms-overflow-style: none;
  }

  .board-scroll.board-panning {
    cursor: grabbing;
    scroll-snap-type: none;
    user-select: none;
  }

  .board-scroll::-webkit-scrollbar {
    display: none;
  }

  .board-columns {
    --column-gap: 12px;
    display: flex;
    min-width: 100%;
    height: 100%;
    align-items: stretch;
    gap: var(--column-gap);
  }

  .pauta-column {
    flex: 0 0
      max(
        246px,
        calc(
          (100% - (var(--column-gap) * (var(--column-count) - 1))) /
            var(--column-count)
        )
      );
    display: grid;
    grid-template-rows: auto minmax(0, 1fr);
    min-width: 246px;
    min-height: 0;
    gap: 10px;
    padding: 11px;
    border: 1px solid color-mix(in srgb, var(--column-color) 30%, var(--border));
    border-radius: var(--radius-xl);
    background:
      linear-gradient(
        180deg,
        color-mix(in srgb, var(--column-color) 10%, var(--panel)) 0%,
        color-mix(in srgb, var(--column-color) 3%, var(--panel)) 120px
      ),
      var(--panel);
    transition:
      border-color var(--motion-fast),
      transform var(--motion-fast),
      box-shadow var(--motion-fast);
    scroll-snap-align: start;
    scroll-snap-stop: always;
  }

  .pauta-column.drop-target {
    border-color: color-mix(in srgb, var(--column-color) 72%, var(--border));
    box-shadow: 0 0 0 3px
      color-mix(in srgb, var(--column-color) 13%, transparent);
    transform: translateY(-1px);
  }

  .column-header {
    display: flex;
    min-width: 0;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding: 2px 1px 10px;
    border-bottom: 1px solid
      color-mix(in srgb, var(--column-color) 17%, var(--border));
    cursor: grab;
    touch-action: pan-y;
    user-select: none;
  }

  .column-header:active {
    cursor: grabbing;
  }

  .column-heading {
    display: flex;
    min-width: 0;
    align-items: center;
    gap: 8px;
  }

  .column-heading > div {
    min-width: 0;
  }

  .column-icon {
    display: grid;
    width: 30px;
    height: 30px;
    flex: 0 0 auto;
    border: 1px solid color-mix(in srgb, var(--column-color) 32%, var(--border));
    border-radius: var(--radius-md);
    color: color-mix(in srgb, var(--column-color) 82%, var(--ink-700));
    background: color-mix(in srgb, var(--column-color) 11%, var(--surface));
    place-items: center;
  }

  .column-header small {
    display: block;
    margin-bottom: 3px;
    color: color-mix(in srgb, var(--column-color) 72%, var(--ink-500));
    font-size: 9px;
    font-weight: 600;
    letter-spacing: 0.055em;
    line-height: 1;
    text-transform: uppercase;
  }

  .column-header h2 {
    margin: 0;
    overflow: hidden;
    color: var(--ink-800);
    font-size: var(--text-md);
    font-weight: 600;
    line-height: 1.1;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .column-count {
    display: inline-grid;
    min-width: 28px;
    height: 28px;
    flex: 0 0 auto;
    padding: 0 8px;
    border: 1px solid color-mix(in srgb, var(--column-color) 28%, var(--border));
    border-radius: var(--radius-pill);
    color: color-mix(in srgb, var(--column-color) 76%, var(--ink-700));
    background: var(--surface);
    font-size: var(--text-xs);
    font-weight: 600;
    place-items: center;
  }

  .column-cards {
    display: grid;
    min-width: 0;
    min-height: 76px;
    align-content: start;
    gap: 10px;
    overflow-y: auto;
    padding-right: 2px;
    overscroll-behavior: contain;
    scrollbar-width: thin;
  }

  .task-card-wrap {
    min-width: 0;
    border-radius: 16px;
    outline: 0;
    cursor: grab;
    transition:
      opacity var(--motion-fast),
      transform var(--motion-fast);
  }

  .task-card-wrap:active {
    cursor: grabbing;
  }

  .task-card-wrap:focus-visible {
    box-shadow: var(--focus-ring);
  }

  .task-card-wrap.dragging {
    opacity: 0.35;
    transform: scale(0.98);
  }

  .task-card-wrap :global(.wc-card-item) {
    cursor: inherit;
    box-shadow: 0 1px 2px rgba(15, 23, 42, 0.05);
  }

  .task-card-wrap:hover :global(.wc-card-item) {
    box-shadow: 0 5px 14px rgba(15, 23, 42, 0.08);
  }

  .column-empty {
    display: grid;
    min-height: 78px;
    align-content: center;
    justify-items: center;
    gap: 6px;
    padding: 14px;
    border: 1px dashed
      color-mix(in srgb, var(--column-color) 28%, var(--border));
    border-radius: var(--radius-lg);
    color: var(--ink-400);
    font-size: var(--text-xs);
    text-align: center;
  }

  .empty-board {
    display: grid;
    min-height: 280px;
    align-content: center;
    justify-items: center;
    gap: 8px;
    padding: 32px;
    border: 1px dashed var(--border);
    border-radius: var(--radius-xl);
    color: var(--ink-400);
    background: var(--panel);
    text-align: center;
  }

  .empty-board strong {
    color: var(--ink-700);
    font-size: var(--text-md);
  }

  .empty-board span {
    max-width: 360px;
    margin-bottom: 6px;
    font-size: var(--text-xs);
  }

  @media (max-width: 920px) {
    .pauta-page {
      height: auto;
      min-height: 100%;
    }

    .pauta-toolbar {
      grid-template-columns: minmax(0, 1fr);
      align-items: stretch;
    }

    .view-switcher {
      width: 100%;
      overflow-x: auto;
    }

    .view-switcher button {
      flex: 1 0 auto;
    }

    .search-field {
      width: 100%;
      max-width: none;
      grid-column: 1;
      grid-row: 2;
    }

    .board-scroll {
      min-height: 540px;
    }

    .pauta-column {
      flex-basis: min(82vw, 300px);
      min-width: min(82vw, 300px);
    }
  }
</style>
