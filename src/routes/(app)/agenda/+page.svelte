<script lang="ts">
  import { tick } from "svelte";
  import { onMount } from "svelte";
  import type { EntityRecord } from "$lib/entities/types";
  import {
    BusinessApiError,
    businessToEntityRecord,
    listAllActiveBusinesses,
    observeBusinesses,
  } from "$lib/businesses/client";
  import { useGlobalFilters } from "$lib/filters/global-filters.svelte";
  import {
    ProjectApiError,
    listAllActiveProjects,
    observeProjects,
    projectToEntityRecord,
  } from "$lib/projects/client";
  import {
    listAllTasks,
    observeTasks,
    TaskApiError,
    taskToEntityRecord,
  } from "$lib/tasks/client";
  import {
    currentSettings,
    loadSettingsFromServer,
  } from "$lib/settings/client";
  import CardDropPlaceholder from "$lib/dnd/CardDropPlaceholder.svelte";
  import { cardDropBeforeId } from "$lib/dnd/card-drop-position";
  import AgendaEntityCard from "$lib/agenda/AgendaEntityCard.svelte";
  import AgendaDayColumn from "$lib/agenda/AgendaDayColumn.svelte";
  import CardDrawer from "$lib/ui/CardDrawer.svelte";
  import {
    addDays,
    formatDayMonth,
    formatPeriod,
    fromIso,
    isSameMonth,
    monthGridStart,
    shiftCursor,
    startOfWeek,
    todayIso,
  } from "$lib/agenda/date-utils";
  import {
    AgendaApiError,
    loadAgendaSnapshot,
    saveAgendaOrder,
  } from "$lib/agenda/client";
  import { loadAgendaItems } from "$lib/agenda/storage";
  import type {
    AgendaItem,
    AgendaMode,
    AgendaSnapshot,
    AgendaView,
  } from "$lib/agenda/types";
  import {
    loadWorkspaceUsers,
    observeWorkspaces,
  } from "$lib/workspaces/workspace-storage";
  import {
    ArchiveRestore,
    CalendarDays,
    CalendarRange,
    ChevronLeft,
    ChevronRight,
    FolderKanban,
    GripVertical,
    ListTodo,
    X,
  } from "@lucide/svelte";

  const allWeekdays = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];
  const emptyTimeLabels: Record<string, string> = {};
  const globalFilters = useGlobalFilters();

  let itemsByMode = $state<Record<AgendaMode, AgendaItem[]>>({
    projects: [],
    tasks: [],
  });
  let projectRecords = $state<EntityRecord[]>([]);
  let taskRecords = $state<EntityRecord[]>([]);
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
  let agendaSnapshot = $state<AgendaSnapshot>({
    workspaceId: "",
    projects: [],
    tasks: [],
  });
  let agendaLoading = $state(false);
  let agendaError = $state("");
  let mode = $state<AgendaMode>("projects");
  let view = $state<AgendaView>("daily");
  let today = $state(todayIso());
  let cursor = $state(todayIso());
  let drawerOpen = $state(false);
  let showWeekends = $state(true);
  let rememberLastView = $state(true);
  let draggingId = $state<string | null>(null);
  let activeDropDate = $state<string | null>(null);
  let activeDropBeforeId = $state<string | undefined>();
  let dropPlaceholderHeight = $state(92);
  let dropPlaceholderWidth = $state<number | undefined>();
  let drawerDropTarget = $state(false);
  let selectedItem = $state<AgendaItem | null>(null);
  let weeklyScroller = $state<HTMLDivElement | null>(null);
  let weeklyPan = $state<{
    pointerId: number;
    startX: number;
    startScrollLeft: number;
    captureTarget: HTMLElement;
    moved: boolean;
  } | null>(null);
  let initialized = $state(false);

  let activeItems = $derived(
    itemsByMode[mode].filter((item) => itemMatchesGlobalFilters(item)),
  );
  let scheduledItems = $derived(
    activeItems.filter((item) => item.date !== null),
  );
  let unscheduledItems = $derived(
    activeItems.filter((item) => item.date === null).sort(compareItems),
  );
  let upcomingDates = $derived(
    Array.from({ length: 6 }, (_, index) => addDays(cursor, index + 1)),
  );
  let dailyDates = $derived([cursor, ...upcomingDates]);
  let weekdays = $derived(showWeekends ? allWeekdays : allWeekdays.slice(0, 5));
  let weeklyDates = $derived.by(() => {
    const first = addDays(startOfWeek(cursor), -14);
    const dates = Array.from({ length: 35 }, (_, index) =>
      addDays(first, index),
    );
    return showWeekends ? dates : dates.filter((date) => !isWeekend(date));
  });
  let monthlyDates = $derived.by(() => {
    const first = monthGridStart(cursor);
    const dates = Array.from({ length: 42 }, (_, index) =>
      addDays(first, index),
    );
    return showWeekends ? dates : dates.filter((date) => !isWeekend(date));
  });
  let periodLabel = $derived(
    view === "weekly" && !showWeekends
      ? `${formatDayMonth(startOfWeek(cursor))} — ${formatDayMonth(addDays(startOfWeek(cursor), 4))}`
      : formatPeriod(cursor, view),
  );
  let boardCount = $derived.by(() => {
    if (view === "daily") {
      const visible = new Set(dailyDates);
      return scheduledItems.filter(
        (item) => item.date && visible.has(item.date),
      ).length;
    }
    if (view === "weekly") {
      const start = startOfWeek(cursor);
      const end = addDays(start, showWeekends ? 6 : 4);
      return scheduledItems.filter(
        (item) => item.date && item.date >= start && item.date <= end,
      ).length;
    }
    const month = cursor.slice(0, 7);
    return scheduledItems.filter(
      (item) =>
        item.date?.startsWith(month) && (showWeekends || !isWeekend(item.date)),
    ).length;
  });

  function isWeekend(date: string): boolean {
    const weekday = fromIso(date).getDay();
    return weekday === 0 || weekday === 6;
  }

  function compareItems(left: AgendaItem, right: AgendaItem): number {
    return (
      left.order - right.order || left.title.localeCompare(right.title, "pt-BR")
    );
  }

  function sourceRecord(item: AgendaItem): EntityRecord | undefined {
    const records = item.mode === "tasks" ? taskRecords : projectRecords;
    return records.find((record) => record.id === item.id);
  }

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
    const recordUserId = record.responsavelId || record.assigned_user_id || "";
    if (recordUserId) return recordUserId === userId;
    const user = globalFilters.users.find(({ id }) => id === userId);
    return !!user && normalized(record.responsavel) === normalized(user.name);
  }

  function businessCategoryFor(record: EntityRecord): string {
    const businessId =
      record.negocioId || record.negocio_id || record.business_id || "";
    const business = businessRecords.find(({ id }) => id === businessId);
    return business?.categoria || business?.category || "";
  }

  function itemMatchesGlobalFilters(item: AgendaItem): boolean {
    const record = sourceRecord(item);
    if (!record) return globalFilters.activeCount === 0;
    const responsibleMatches =
      globalFilters.responsibleIds.length === 0 ||
      globalFilters.responsibleIds.some((userId) =>
        recordMatchesResponsible(record, userId),
      );
    const businessMatches =
      globalFilters.businessCategoryKeys.length === 0 ||
      globalFilters.businessCategoryKeys.includes(businessCategoryFor(record));
    const taskMatches =
      item.mode === "projects" ||
      globalFilters.taskCategoryKeys.length === 0 ||
      globalFilters.taskCategoryKeys.includes(record.categoria || record.stage);
    return responsibleMatches && businessMatches && taskMatches;
  }

  function itemsForDate(date: string): AgendaItem[] {
    return activeItems.filter((item) => item.date === date).sort(compareItems);
  }

  function normalizeDayOrders(
    items: AgendaItem[],
    date: string | null,
  ): AgendaItem[] {
    const ids = items
      .filter((item) => item.date === date)
      .sort(compareItems)
      .map((item) => item.id);
    const orderById = new Map(ids.map((id, index) => [id, index]));
    return items.map((item) =>
      item.date === date
        ? { ...item, order: orderById.get(item.id) ?? item.order }
        : item,
    );
  }

  function draggedItemId(event: DragEvent): string | null {
    if (draggingId) return draggingId;
    const raw =
      event.dataTransfer?.getData("application/x-demanda-agenda") ?? "";
    try {
      const payload = JSON.parse(raw) as { id?: string; mode?: AgendaMode };
      return payload.mode === mode && payload.id ? payload.id : null;
    } catch {
      return event.dataTransfer?.getData("text/plain") || null;
    }
  }

  async function moveItem(
    itemId: string,
    date: string | null,
    beforeId?: string,
  ): Promise<void> {
    const current = itemsByMode[mode];
    const moved = current.find((item) => item.id === itemId);
    if (!moved || beforeId === itemId) return;

    const sourceDate = moved.date;
    const target = current
      .filter((item) => item.date === date && item.id !== itemId)
      .sort(compareItems);
    const foundIndex = beforeId
      ? target.findIndex((item) => item.id === beforeId)
      : -1;
    const insertIndex = foundIndex >= 0 ? foundIndex : target.length;
    target.splice(insertIndex, 0, { ...moved, date });
    const orderById = new Map(
      target.map((item, targetIndex) => [item.id, targetIndex]),
    );

    let next = current.map((item) => {
      if (item.id === itemId)
        return { ...item, date, order: orderById.get(item.id) ?? 0 };
      if (item.date === date && orderById.has(item.id)) {
        return { ...item, order: orderById.get(item.id) ?? item.order };
      }
      return item;
    });
    if (sourceDate !== date) next = normalizeDayOrders(next, sourceDate);
    itemsByMode = { ...itemsByMode, [mode]: next };
    agendaError = "";
    try {
      agendaSnapshot = await saveAgendaOrder(mode, next);
      rebuildAgenda();
      if (selectedItem?.id === itemId) {
        selectedItem =
          itemsByMode[mode].find((item) => item.id === itemId) ?? null;
      }
    } catch (cause) {
      agendaError =
        cause instanceof AgendaApiError
          ? cause.message
          : "Não foi possível atualizar a Agenda.";
      await reloadAgenda();
    }
  }

  function handleDragStart(event: DragEvent, item: AgendaItem): void {
    draggingId = item.id;
    activeDropDate = null;
    activeDropBeforeId = undefined;
    drawerDropTarget = false;
    const card = event.currentTarget as HTMLElement;
    const bounds = card.getBoundingClientRect();
    dropPlaceholderHeight = bounds.height;
    dropPlaceholderWidth = bounds.width;
    if (!event.dataTransfer) return;
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData(
      "application/x-demanda-agenda",
      JSON.stringify({ id: item.id, mode: item.mode }),
    );
    event.dataTransfer.setData("text/plain", item.id);
  }

  function clearDrag(): void {
    draggingId = null;
    activeDropDate = null;
    activeDropBeforeId = undefined;
    drawerDropTarget = false;
  }

  function handleDrop(event: DragEvent, date: string, beforeId?: string): void {
    event.preventDefault();
    const itemId = draggedItemId(event);
    const destinationBeforeId =
      activeDropDate === date ? activeDropBeforeId : beforeId;
    if (itemId) void moveItem(itemId, date, destinationBeforeId);
    clearDrag();
  }

  function handleMonthDragOver(event: DragEvent, date: string): void {
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
    activeDropDate = date;
    activeDropBeforeId = cardDropBeforeId(
      event,
      event.currentTarget as HTMLElement,
      {
        cardSelector: "[data-agenda-month-card]",
        idAttribute: "data-agenda-month-card",
        excludeId: draggingId,
      },
    );
    drawerDropTarget = false;
  }

  function handleUnscheduledDrop(event: DragEvent): void {
    event.preventDefault();
    const itemId = draggedItemId(event);
    if (itemId) void moveItem(itemId, null);
    clearDrag();
  }

  function selectMode(nextMode: AgendaMode): void {
    mode = nextMode;
    selectedItem = null;
    if (rememberLastView) persistAgendaState();
  }

  function selectView(nextView: AgendaView): void {
    view = nextView;
    if (rememberLastView) persistAgendaState();
  }

  function shift(direction: -1 | 1): void {
    cursor = shiftCursor(cursor, view, direction);
  }

  function goToday(): void {
    today = todayIso();
    cursor = today;
  }

  function rebuildAgenda(): void {
    itemsByMode = loadAgendaItems(projectRecords, taskRecords, agendaSnapshot);
  }

  async function reloadAgenda(): Promise<void> {
    agendaLoading = true;
    agendaError = "";
    try {
      agendaSnapshot = await loadAgendaSnapshot();
      rebuildAgenda();
    } catch (cause) {
      agendaError =
        cause instanceof AgendaApiError
          ? cause.message
          : "Não foi possível carregar a Agenda.";
    } finally {
      agendaLoading = false;
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
      businessRecords = businesses.map(businessToEntityRecord);
    } catch (cause) {
      if (controller.signal.aborted) return;
      businessRecords = [];
      businessesError =
        cause instanceof BusinessApiError
          ? cause.message
          : "Não foi possível carregar os negócios.";
    } finally {
      if (businessesAbortController === controller) businessesLoading = false;
    }
  }

  async function reloadTasks(): Promise<void> {
    tasksAbortController?.abort();
    const controller = new AbortController();
    tasksAbortController = controller;
    tasksLoading = true;
    tasksError = "";
    try {
      const tasks = await listAllTasks({ signal: controller.signal });
      if (controller.signal.aborted) return;
      taskRecords = tasks.map(taskToEntityRecord);
      if (
        selectedItem?.mode === "tasks" &&
        !taskRecords.some((task) => task.id === selectedItem?.id)
      ) {
        selectedItem = null;
      }
      rebuildAgenda();
    } catch (cause) {
      if (controller.signal.aborted) return;
      taskRecords = [];
      tasksError =
        cause instanceof TaskApiError
          ? cause.message
          : "Não foi possível carregar as tarefas.";
      rebuildAgenda();
    } finally {
      if (tasksAbortController === controller) tasksLoading = false;
    }
  }

  async function reloadProjects(): Promise<void> {
    projectsAbortController?.abort();
    const controller = new AbortController();
    projectsAbortController = controller;
    projectsLoading = true;
    projectsError = "";
    try {
      const projects = await listAllActiveProjects({
        signal: controller.signal,
      });
      if (controller.signal.aborted) return;
      projectRecords = projects.map(projectToEntityRecord);
      if (
        selectedItem?.mode === "projects" &&
        !projectRecords.some((project) => project.id === selectedItem?.id)
      ) {
        selectedItem = null;
      }
      rebuildAgenda();
    } catch (cause) {
      if (controller.signal.aborted) return;
      projectRecords = [];
      projectsError =
        cause instanceof ProjectApiError
          ? cause.message
          : "Não foi possível carregar os projetos.";
      rebuildAgenda();
    } finally {
      if (projectsAbortController === controller) projectsLoading = false;
    }
  }

  function toggleDrawer(): void {
    drawerOpen = !drawerOpen;
    if (rememberLastView) persistAgendaState();
  }

  function persistAgendaState(): void {
    const url = new URL(window.location.href);
    url.searchParams.set("mode", mode);
    url.searchParams.set("view", view);
    url.searchParams.set("drawer", drawerOpen ? "open" : "closed");
    window.history.replaceState({}, "", url);
  }

  function openItem(item: AgendaItem): void {
    if (draggingId) return;
    selectedItem = item;
  }

  function updateSelectedDate(event: Event): void {
    if (!selectedItem) return;
    const value = (event.currentTarget as HTMLInputElement).value;
    void moveItem(selectedItem.id, value || null);
  }

  function beginWeeklyPan(event: PointerEvent): void {
    if (
      view !== "weekly" ||
      !weeklyScroller ||
      weeklyPan ||
      event.button !== 0 ||
      !event.isPrimary
    )
      return;

    const captureTarget = event.currentTarget as HTMLElement;
    captureTarget.setPointerCapture(event.pointerId);
    weeklyPan = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startScrollLeft: weeklyScroller.scrollLeft,
      captureTarget,
      moved: false,
    };
    event.preventDefault();
  }

  function moveWeeklyPan(event: PointerEvent): void {
    if (
      !weeklyScroller ||
      !weeklyPan ||
      event.pointerId !== weeklyPan.pointerId
    )
      return;

    const delta = event.clientX - weeklyPan.startX;
    if (!weeklyPan.moved && Math.abs(delta) < 4) return;
    if (!weeklyPan.moved) weeklyPan = { ...weeklyPan, moved: true };
    weeklyScroller.scrollLeft = weeklyPan.startScrollLeft - delta;
    event.preventDefault();
  }

  function weeklyColumnLeft(column: HTMLElement): number {
    if (!weeklyScroller) return 0;
    return (
      column.getBoundingClientRect().left -
      weeklyScroller.getBoundingClientRect().left +
      weeklyScroller.scrollLeft
    );
  }

  function snapWeeklyView(behavior: ScrollBehavior = "smooth"): void {
    if (!weeklyScroller) return;
    const columns = Array.from(
      weeklyScroller.querySelectorAll<HTMLElement>("[data-agenda-date]"),
    );
    const anchor = columns.reduce<HTMLElement | null>((nearest, column) => {
      if (!nearest) return column;
      return Math.abs(weeklyColumnLeft(column) - weeklyScroller!.scrollLeft) <
        Math.abs(weeklyColumnLeft(nearest) - weeklyScroller!.scrollLeft)
        ? column
        : nearest;
    }, null);
    if (anchor)
      weeklyScroller.scrollTo({ left: weeklyColumnLeft(anchor), behavior });
  }

  function endWeeklyPan(event: PointerEvent): void {
    if (!weeklyPan || event.pointerId !== weeklyPan.pointerId) return;
    const completedPan = weeklyPan;
    if (completedPan.captureTarget.hasPointerCapture(event.pointerId)) {
      completedPan.captureTarget.releasePointerCapture(event.pointerId);
    }
    weeklyPan = null;
    if (completedPan.moved) snapWeeklyView();
  }

  async function centerWeeklyView(): Promise<void> {
    if (!weeklyScroller || view !== "weekly") return;
    await tick();
    const anchor = weeklyScroller.querySelector<HTMLElement>(
      `[data-agenda-date="${startOfWeek(cursor)}"]`,
    );
    if (anchor) weeklyScroller.scrollLeft = weeklyColumnLeft(anchor);
  }

  $effect(() => {
    if (!initialized || view !== "weekly") return;
    cursor;
    weeklyScroller;
    void centerWeeklyView();
  });

  function applyAgendaPreferences(
    settings: ReturnType<typeof currentSettings>,
  ): void {
    globalFilters.setCatalogs(settings);
    const preferredView = {
      day: "daily",
      week: "weekly",
      month: "monthly",
    }[settings.agendaDefaultView] as AgendaView | undefined;
    const defaultMode: AgendaMode =
      settings.agendaDefaultMode === "tasks" ? "tasks" : "projects";
    const defaultView = preferredView ?? "daily";
    rememberLastView = settings.agendaRememberLastView;
    showWeekends = settings.agendaShowWeekends;
    const query = new URLSearchParams(window.location.search);
    const requestedMode = query.get("mode");
    const requestedView = query.get("view");
    mode =
      rememberLastView &&
      (requestedMode === "projects" || requestedMode === "tasks")
        ? requestedMode
        : defaultMode;
    view =
      rememberLastView &&
      (requestedView === "daily" ||
        requestedView === "weekly" ||
        requestedView === "monthly")
        ? requestedView
        : defaultView;
    const defaultDrawerOpen = settings.agendaDrawerDefault === "expanded";
    const requestedDrawer = query.get("drawer");
    drawerOpen =
      rememberLastView &&
      (requestedDrawer === "open" || requestedDrawer === "closed")
        ? requestedDrawer === "open"
        : defaultDrawerOpen;
  }

  onMount(() => {
    today = todayIso();
    cursor = today;
    globalFilters.setUsers(loadWorkspaceUsers());
    applyAgendaPreferences(currentSettings());
    void loadSettingsFromServer()
      .then(applyAgendaPreferences)
      .catch(() => undefined);
    rebuildAgenda();
    void reloadAgenda();
    void reloadBusinesses();
    void reloadProjects();
    void reloadTasks();
    initialized = true;
    const stopTasks = observeTasks(() => void reloadTasks());
    const stopBusinesses = observeBusinesses(() => void reloadBusinesses());
    const stopProjects = observeProjects(() => void reloadProjects());
    const stopWorkspaces = observeWorkspaces(() => {
      globalFilters.setUsers(loadWorkspaceUsers());
      selectedItem = null;
      agendaSnapshot = { workspaceId: "", projects: [], tasks: [] };
      rebuildAgenda();
      void reloadAgenda();
      void reloadBusinesses();
      void reloadProjects();
      void reloadTasks();
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
</script>

<svelte:window
  onpointermove={moveWeeklyPan}
  onpointerup={endWeeklyPan}
  onpointercancel={endWeeklyPan}
/>

<svelte:head><title>Agenda · Demanda</title></svelte:head>

<section
  class="agenda-page"
  aria-label="Agenda"
  aria-busy={businessesLoading ||
    projectsLoading ||
    tasksLoading ||
    agendaLoading}
>
  {#if agendaError}
    <div class="project-load-error" role="alert">
      <span>{agendaError}</span>
      <button type="button" onclick={() => void reloadAgenda()}
        >Tentar novamente</button
      >
    </div>
  {/if}
  {#if businessesError}
    <div class="project-load-error" role="alert">
      <span>{businessesError}</span>
      <button type="button" onclick={() => void reloadBusinesses()}
        >Tentar novamente</button
      >
    </div>
  {/if}
  {#if projectsError}
    <div class="project-load-error" role="alert">
      <span>{projectsError}</span>
      <button type="button" onclick={() => void reloadProjects()}
        >Tentar novamente</button
      >
    </div>
  {/if}
  {#if tasksError}
    <div class="project-load-error" role="alert">
      <span>{tasksError}</span>
      <button type="button" onclick={() => void reloadTasks()}
        >Tentar novamente</button
      >
    </div>
  {/if}
  <div class="agenda-shell">
    <header class="agenda-toolbar">
      <div class="mode-switch" role="group" aria-label="Conteúdo da agenda">
        <button
          class:active={mode === "projects"}
          type="button"
          aria-pressed={mode === "projects"}
          onclick={() => selectMode("projects")}
          ><FolderKanban size={16} /><span>Projetos</span></button
        >
        <button
          class:active={mode === "tasks"}
          type="button"
          aria-pressed={mode === "tasks"}
          onclick={() => selectMode("tasks")}
          ><ListTodo size={16} /><span>Tarefas</span></button
        >
      </div>

      <nav class="period-nav" aria-label="Navegar pelo período">
        <button
          type="button"
          aria-label="Período anterior"
          onclick={() => shift(-1)}><ChevronLeft size={17} /></button
        >
        <button
          class="period-label"
          type="button"
          title="Voltar para hoje"
          onclick={goToday}
        >
          <CalendarDays size={15} /><span>{periodLabel}</span>
        </button>
        <button
          type="button"
          aria-label="Próximo período"
          onclick={() => shift(1)}><ChevronRight size={17} /></button
        >
      </nav>

      <div class="view-switch" role="group" aria-label="Visualização da agenda">
        {#each [["daily", "Diário"], ["weekly", "Semanal"], ["monthly", "Mensal"]] as option}
          <button
            class:active={view === option[0]}
            type="button"
            aria-pressed={view === option[0]}
            onclick={() => selectView(option[0] as AgendaView)}
            >{option[1]}</button
          >
        {/each}
      </div>
    </header>

    <div class="agenda-summary" aria-live="polite">
      <span
        ><GripVertical size={14} />Arraste os cards para alterar a data de
        entrega</span
      >
      <span
        >{boardCount}
        {mode === "tasks" ? "tarefas" : "projetos"} neste período</span
      >
    </div>

    <div class:drawer-open={drawerOpen} class="agenda-board">
      <div class={`view-shell view-${view}`}>
        {#if !initialized}
          <div class="loading">
            <CalendarRange size={22} /><span>Preparando agenda…</span>
          </div>
        {:else if view === "daily"}
          <div class="daily-layout">
            {#each dailyDates as date (date)}
              <AgendaDayColumn
                {date}
                items={itemsForDate(date)}
                {today}
                variant="daily"
                {draggingId}
                {activeDropDate}
                {activeDropBeforeId}
                {dropPlaceholderHeight}
                {dropPlaceholderWidth}
                timeLabels={emptyTimeLabels}
                ondragstart={handleDragStart}
                ondragend={clearDrag}
                ondragoverdate={(dropDate, beforeId) => {
                  activeDropDate = dropDate;
                  activeDropBeforeId = beforeId;
                  drawerDropTarget = false;
                }}
                ondropitem={handleDrop}
                onunschedule={(item) => moveItem(item.id, null)}
                onopen={openItem}
              />
            {/each}
          </div>
        {:else if view === "weekly"}
          <div
            class:weekly-panning={weeklyPan?.moved}
            class="weekly-scroll"
            bind:this={weeklyScroller}
          >
            <div class="week-grid">
              {#each weeklyDates as date (date)}
                <AgendaDayColumn
                  {date}
                  items={itemsForDate(date)}
                  {today}
                  variant="weekly"
                  {draggingId}
                  {activeDropDate}
                  {activeDropBeforeId}
                  {dropPlaceholderHeight}
                  {dropPlaceholderWidth}
                  timeLabels={emptyTimeLabels}
                  ondragstart={handleDragStart}
                  ondragend={clearDrag}
                  ondragoverdate={(dropDate, beforeId) => {
                    activeDropDate = dropDate;
                    activeDropBeforeId = beforeId;
                    drawerDropTarget = false;
                  }}
                  ondropitem={handleDrop}
                  onunschedule={(item) => moveItem(item.id, null)}
                  onopen={openItem}
                  onpanstart={beginWeeklyPan}
                />
              {/each}
            </div>
          </div>
        {:else}
          <div class="month-scroll">
            <div
              class="month-grid"
              style={`--month-day-count: ${weekdays.length}; --month-min-width: ${weekdays.length * 220}px`}
            >
              {#each weekdays as weekday}
                <div class="month-weekday">{weekday}</div>
              {/each}
              {#each monthlyDates as date (date)}
                {@const cellItems = itemsForDate(date)}
                <article
                  class:outside={!isSameMonth(date, cursor)}
                  class:today={date === today}
                  class:drop-target={activeDropDate === date}
                  class="month-cell"
                  data-agenda-date={date}
                  ondragover={(event) => handleMonthDragOver(event, date)}
                  ondrop={(event) => handleDrop(event, date)}
                >
                  <header>
                    <span class="month-day">{fromIso(date).getDate()}</span>
                    <span
                      >{cellItems.length}
                      {mode === "tasks" ? "tarefas" : "projetos"}</span
                    >
                  </header>
                  <div class="month-items">
                    {#each cellItems.slice(0, 3) as item (item.id)}
                      {#if activeDropDate === date && activeDropBeforeId === item.id}
                        <CardDropPlaceholder
                          height={dropPlaceholderHeight}
                          compact
                        />
                      {/if}
                      <div class="month-card" data-agenda-month-card={item.id}>
                        <AgendaEntityCard
                          {item}
                          level={2}
                          isDragging={draggingId === item.id}
                          ondragstart={handleDragStart}
                          ondragend={clearDrag}
                          ondropbefore={(event) =>
                            handleDrop(event, date, activeDropBeforeId)}
                          onunschedule={(card) => moveItem(card.id, null)}
                          onopen={openItem}
                        />
                      </div>
                    {/each}
                    {#if activeDropDate === date && activeDropBeforeId === undefined}
                      <CardDropPlaceholder
                        height={dropPlaceholderHeight}
                        compact
                      />
                    {/if}
                    {#if cellItems.length > 3}<span class="month-more"
                        >+{cellItems.length - 3} restantes</span
                      >{/if}
                  </div>
                </article>
              {/each}
            </div>
          </div>
        {/if}
      </div>

      {#if initialized}
        <CardDrawer
          ariaLabel={`${mode === "tasks" ? "Tarefas" : "Projetos"} não agendados`}
          title={mode === "tasks"
            ? "Tarefas a programar"
            : "Projetos a programar"}
          description="Estes itens não têm data de entrega. Arraste para um dia ou solte aqui para remover o prazo."
          icon={mode === "tasks" ? ListTodo : FolderKanban}
          items={unscheduledItems}
          getKey={(item) => item.id}
          open={drawerOpen}
          isDropTarget={drawerDropTarget}
          countLabel={mode === "tasks"
            ? "tarefas não agendadas"
            : "projetos não agendados"}
          toggleAriaLabel={drawerOpen
            ? "Recolher itens não agendados"
            : "Abrir itens não agendados"}
          ontoggle={toggleDrawer}
          ondragover={() => {
            drawerDropTarget = true;
            activeDropDate = null;
            activeDropBeforeId = undefined;
          }}
          ondrop={handleUnscheduledDrop}
        >
          {#snippet card(item)}
            <AgendaEntityCard
              {item}
              level={4}
              isDragging={draggingId === item.id}
              ondragstart={handleDragStart}
              ondragend={clearDrag}
              ondropbefore={(event) => {
                event.preventDefault();
                event.stopPropagation();
                handleUnscheduledDrop(event);
              }}
              onunschedule={() => undefined}
              onopen={openItem}
            />
          {/snippet}

          {#snippet empty()}
            <ArchiveRestore size={18} />Todos os itens têm data de entrega.
          {/snippet}
        </CardDrawer>
      {/if}
    </div>
  </div>
</section>

{#if selectedItem}
  <div
    class="dialog-backdrop"
    role="presentation"
    onclick={(event) => {
      if (event.currentTarget === event.target) selectedItem = null;
    }}
  >
    <div
      class="item-dialog"
      role="dialog"
      aria-modal="true"
      aria-labelledby="agenda-dialog-title"
    >
      <header>
        <span class={`dialog-icon tone-${selectedItem.tone}`}>
          {#if selectedItem.mode === "tasks"}<ListTodo
              size={18}
            />{:else}<FolderKanban size={18} />{/if}
        </span>
        <div>
          <span>{selectedItem.mode === "tasks" ? "Tarefa" : "Projeto"}</span>
          <h2 id="agenda-dialog-title">{selectedItem.title}</h2>
        </div>
        <button
          type="button"
          aria-label="Fechar detalhes"
          onclick={() => (selectedItem = null)}><X size={18} /></button
        >
      </header>
      <div class="dialog-content">
        <span class="dialog-status">{selectedItem.statusLabel}</span>
        <p>{selectedItem.description}</p>
        <dl>
          <div>
            <dt>{selectedItem.mode === "tasks" ? "Projeto" : "Cliente"}</dt>
            <dd>{selectedItem.client}</dd>
          </div>
          <div>
            <dt>Responsável</dt>
            <dd>{selectedItem.relation}</dd>
          </div>
          {#if selectedItem.mode === "tasks"}<div>
              <dt>Duração</dt>
              <dd>{Math.round(selectedItem.durationMinutes / 30) / 2} horas</dd>
            </div>{/if}
        </dl>
        <label
          >Data de entrega<input
            type="date"
            value={selectedItem.date ?? ""}
            onchange={updateSelectedDate}
          /></label
        >
      </div>
      <footer>
        {#if selectedItem.date}<button
            class="remove-date"
            type="button"
            onclick={() => moveItem(selectedItem!.id, null)}
            >Remover data de entrega</button
          >{/if}
        <a href="/registros">Abrir em Registros</a>
      </footer>
    </div>
  </div>
{/if}

<style>
  .agenda-page {
    position: relative;
    width: 100%;
    height: 100%;
    min-width: 0;
    min-height: 0;
  }
  .project-load-error {
    position: absolute;
    z-index: 10;
    right: 12px;
    bottom: 12px;
    display: flex;
    max-width: min(420px, calc(100% - 24px));
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 10px 12px;
    border: 1px solid color-mix(in srgb, var(--danger) 30%, var(--border));
    border-radius: var(--radius-lg);
    color: var(--danger);
    background: var(--surface);
    box-shadow: var(--shadow-lg);
    font-size: var(--text-sm);
  }
  .project-load-error button {
    border: 0;
    color: inherit;
    background: transparent;
    font-weight: 700;
    white-space: nowrap;
  }
  .agenda-shell {
    position: relative;
    display: grid;
    height: 100%;
    min-width: 0;
    min-height: 0;
    grid-template-rows: auto minmax(0, 1fr);
    gap: 12px;
  }
  .agenda-toolbar {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
    align-items: center;
    gap: 14px;
    padding: 11px 13px;
    border: 1px solid var(--border);
    border-radius: var(--radius-xl);
    background: var(--surface);
  }
  .mode-switch,
  .view-switch,
  .period-nav {
    display: inline-flex;
    width: fit-content;
    align-items: center;
    padding: 3px;
    border: 1px solid var(--border);
    border-radius: var(--radius-pill);
    background: var(--surface-soft);
  }
  .mode-switch {
    justify-self: start;
  }
  .view-switch {
    justify-self: end;
  }
  .mode-switch button,
  .view-switch button,
  .period-nav button {
    display: inline-flex;
    min-height: 31px;
    align-items: center;
    justify-content: center;
    gap: 6px;
    padding: 0 12px;
    border: 0;
    border-radius: var(--radius-pill);
    color: var(--ink-500);
    background: transparent;
    font-size: var(--text-xs);
    font-weight: 600;
    white-space: nowrap;
  }
  .mode-switch button.active,
  .view-switch button.active {
    color: var(--brand-700);
    background: #fff;
    box-shadow: 0 1px 4px rgba(15, 23, 42, 0.12);
  }
  .period-nav {
    justify-self: center;
    padding: 0;
    overflow: hidden;
    border-radius: 10px;
    background: #fff;
  }
  .period-nav button {
    min-width: 34px;
    min-height: 36px;
    padding: 0 8px;
    border-radius: 0;
  }
  .period-nav button:hover {
    color: var(--brand-600);
    background: var(--brand-50);
  }
  .period-nav .period-label {
    min-width: 174px;
    border-right: 1px solid var(--border);
    border-left: 1px solid var(--border);
    color: var(--ink-700);
  }
  .agenda-summary {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }
  .agenda-summary span {
    display: inline-flex;
    align-items: center;
    gap: 4px;
  }
  .agenda-board {
    display: grid;
    min-width: 0;
    min-height: 0;
    grid-template-rows: minmax(0, 1fr) auto;
    gap: 12px;
  }
  .view-shell {
    height: auto;
    min-height: 0;
    overflow: hidden;
  }
  .daily-layout {
    display: grid;
    height: 100%;
    min-width: 0;
    min-height: 0;
    grid-auto-rows: max-content;
    align-content: start;
    gap: 12px;
    overflow-y: auto;
    overscroll-behavior: contain;
    scrollbar-width: thin;
  }
  .weekly-scroll,
  .month-scroll {
    width: 100%;
    height: 100%;
    overflow: auto;
    overscroll-behavior: contain;
    scrollbar-width: thin;
  }
  .weekly-scroll {
    overflow-x: auto;
    overflow-y: hidden;
    overscroll-behavior-inline: contain;
    scroll-snap-type: x mandatory;
    scrollbar-width: none;
    -ms-overflow-style: none;
  }
  .weekly-scroll.weekly-panning {
    cursor: grabbing;
    scroll-snap-type: none;
    user-select: none;
  }
  .weekly-scroll::-webkit-scrollbar {
    display: none;
  }
  .week-grid {
    display: flex;
    width: max-content;
    height: 100%;
    min-height: 100%;
    align-items: stretch;
    gap: 12px;
  }
  .month-grid {
    display: grid;
    min-width: var(--month-min-width);
    grid-template-columns: repeat(var(--month-day-count), minmax(210px, 1fr));
    gap: 8px;
  }
  .month-weekday {
    padding: 1px 8px 5px;
    color: var(--ink-400);
    font-size: 10px;
    font-weight: 600;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }
  .month-cell {
    display: grid;
    min-height: 190px;
    align-content: start;
    gap: 7px;
    padding: 9px;
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
    background: var(--surface-soft);
    transition:
      border-color var(--motion-fast),
      box-shadow var(--motion-fast);
  }
  .month-cell.outside {
    opacity: 0.48;
  }
  .month-cell.today {
    border-color: color-mix(in srgb, var(--brand-600) 54%, var(--border));
  }
  .month-cell.drop-target {
    border-color: var(--brand-600);
    box-shadow: inset 0 0 0 2px
      color-mix(in srgb, var(--brand-600) 30%, transparent);
  }
  .month-cell > header {
    display: flex;
    min-height: 28px;
    align-items: center;
    justify-content: space-between;
    gap: 6px;
  }
  .month-cell > header > span:last-child {
    color: var(--ink-400);
    font-size: 9px;
  }
  .month-day {
    display: grid;
    width: 27px;
    height: 27px;
    border-radius: 50%;
    color: var(--ink-700);
    font-size: var(--text-xs);
    font-weight: 600;
    place-items: center;
  }
  .month-cell.today .month-day {
    color: #fff;
    background: var(--brand-600);
  }
  .month-items {
    display: grid;
    gap: 5px;
    container-type: inline-size;
  }
  .month-more {
    padding: 2px 4px;
    color: var(--ink-500);
    font-size: 9px;
    font-weight: 600;
  }
  .loading {
    display: grid;
    height: 100%;
    place-content: center;
    justify-items: center;
    gap: 9px;
    color: var(--ink-400);
    font-size: var(--text-sm);
  }
  .dialog-backdrop {
    position: fixed;
    inset: 0;
    z-index: 70;
    display: grid;
    padding: 20px;
    background: rgba(15, 23, 42, 0.42);
    backdrop-filter: blur(3px);
    place-items: center;
  }
  .item-dialog {
    width: min(510px, 100%);
    overflow: hidden;
    border: 1px solid var(--border);
    border-radius: 18px;
    background: var(--surface);
    box-shadow: 0 28px 80px rgba(15, 23, 42, 0.24);
  }
  .item-dialog > header {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: center;
    gap: 11px;
    padding: 16px 18px;
    border-bottom: 1px solid var(--border);
  }
  .dialog-icon {
    display: grid;
    width: 38px;
    height: 38px;
    border-radius: 11px;
    color: var(--brand-600);
    background: var(--brand-50);
    place-items: center;
  }
  .item-dialog header div > span {
    color: var(--ink-400);
    font-size: 10px;
    text-transform: uppercase;
  }
  .item-dialog h2 {
    margin-top: 2px;
    color: var(--ink-800);
    font-size: var(--text-lg);
    line-height: 1.25;
  }
  .item-dialog header button {
    display: grid;
    width: 34px;
    height: 34px;
    padding: 0;
    border: 0;
    border-radius: 9px;
    color: var(--ink-500);
    background: var(--surface-soft);
    place-items: center;
  }
  .dialog-content {
    display: grid;
    gap: 14px;
    padding: 18px;
  }
  .dialog-status {
    width: fit-content;
    padding: 4px 9px;
    border-radius: var(--radius-pill);
    color: var(--brand-700);
    background: var(--brand-50);
    font-size: var(--text-xs);
    font-weight: 600;
  }
  .dialog-content > p {
    color: var(--ink-500);
    font-size: var(--text-sm);
    line-height: 1.5;
  }
  dl {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;
    margin: 0;
  }
  dl div {
    min-width: 0;
    padding: 9px 10px;
    border: 1px solid var(--border);
    border-radius: 9px;
    background: var(--surface-soft);
  }
  dt {
    color: var(--ink-400);
    font-size: 9px;
    text-transform: uppercase;
  }
  dd {
    margin: 3px 0 0;
    overflow: hidden;
    color: var(--ink-700);
    font-size: var(--text-xs);
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .dialog-content label {
    display: grid;
    gap: 5px;
    color: var(--ink-600, var(--ink-500));
    font-size: var(--text-xs);
    font-weight: 600;
  }
  .dialog-content input {
    min-height: 40px;
    padding: 0 11px;
    border: 1px solid var(--border);
    border-radius: 9px;
    color: var(--ink-800);
    background: #fff;
  }
  .item-dialog > footer {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 9px;
    padding: 13px 18px;
    border-top: 1px solid var(--border);
    background: var(--surface-soft);
  }
  .item-dialog footer button,
  .item-dialog footer a {
    display: inline-flex;
    min-height: 37px;
    align-items: center;
    justify-content: center;
    padding: 0 13px;
    border: 0;
    border-radius: 9px;
    color: #fff;
    background: var(--brand-600);
    font-size: var(--text-xs);
    font-weight: 600;
  }
  .item-dialog footer .remove-date {
    margin-right: auto;
    color: var(--red-500);
    background: color-mix(in srgb, var(--red-500) 8%, #fff);
  }
  @media (max-width: 1080px) {
    .agenda-toolbar {
      grid-template-columns: 1fr 1fr;
    }
    .period-nav {
      grid-column: 1 / -1;
      grid-row: 2;
    }
    .view-switch {
      grid-column: 2;
      grid-row: 1;
    }
  }
  @media (max-width: 760px) {
    .agenda-toolbar {
      display: flex;
      flex-wrap: wrap;
      justify-content: center;
      gap: 8px;
    }
    .mode-switch,
    .view-switch,
    .period-nav {
      justify-self: auto;
    }
    .period-nav {
      order: 3;
      width: 100%;
      justify-content: center;
    }
    .period-nav .period-label {
      min-width: 0;
      flex: 1;
    }
    .agenda-summary span:first-child {
      display: none;
    }
    .daily-layout {
      grid-auto-rows: auto;
    }
    dl {
      grid-template-columns: minmax(0, 1fr);
    }
  }
  @media (max-width: 460px) {
    .mode-switch,
    .view-switch {
      width: 100%;
    }
    .mode-switch button,
    .view-switch button {
      min-width: 0;
      flex: 1;
      padding-inline: 8px;
    }
    .item-dialog > footer {
      align-items: stretch;
      flex-direction: column;
    }
    .item-dialog footer .remove-date {
      width: 100%;
    }
  }
</style>
