<script lang="ts">
  import { page } from "$app/state";
  import { autoScheduleWeek } from "$lib/cronograma/auto-schedule";
  import {
    CRONOGRAMA_AUTO_SCHEDULE_REQUEST_EVENT,
    publishCronogramaAutoScheduleState,
  } from "$lib/cronograma/auto-schedule-events";
  import {
    MAX_DURATION_SLOTS,
    MIN_DURATION_SLOTS,
    MINUTES_PER_SLOT,
    buildWeekDays,
    layoutScheduleGroup,
    minutesToTime,
    resolveWeekStart,
  } from "$lib/cronograma/date";
  import {
    describeScheduleConflict,
    findScheduleConflict,
    findSequenceConflict,
    type ScheduleConflict,
  } from "$lib/cronograma/conflicts";
  import ScheduleCard from "$lib/cronograma/ScheduleCard.svelte";
  import {
    CronogramaApiError,
    deleteCronogramaEntry,
    loadCronogramaSnapshot,
    saveCronogramaEntry,
    saveCronogramaReorganization,
    scheduleMapFromSnapshot,
  } from "$lib/cronograma/client";
  import {
    isCronogramaTaskMuted,
    nextUnscheduledSubtasksForWorkspace,
    toScheduleSubtasks,
  } from "$lib/cronograma/subtasks";
  import type {
    PositionedTask,
    ScheduleEntry,
    ScheduleMap,
    ScheduleTask,
  } from "$lib/cronograma/types";
  import { deliveryConfig } from "$lib/entities/catalog";
  import TaskForm, { type TaskFormMode } from "$lib/entities/TaskForm.svelte";
  import type { EntityRecord } from "$lib/entities/types";
  import {
    currentSettings,
    loadSettingsFromServer,
  } from "$lib/settings/client";
  import {
    listAllTasks,
    observeTasks,
    TaskApiError,
    taskToEntityRecord,
    updateTaskFromEntityValues,
  } from "$lib/tasks/client";
  import CardDrawer from "$lib/ui/CardDrawer.svelte";
  import EntityCard from "$lib/ui/EntityCard.svelte";
  import type { EntityCardItem } from "$lib/ui/entity-card";
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
    isAssignedToUser,
    resolveResponsibleUser,
  } from "$lib/workspaces/responsible-user";
  import { AlertTriangle, Inbox, ListTodo, X } from "@lucide/svelte";
  import { onMount, tick } from "svelte";

  type DragMode = "drag" | "resize";
  type DragState = {
    task: ScheduleTask;
    mode: DragMode;
    pointerId: number;
    startX: number;
    startY: number;
    pointerOffsetMinutes: number;
    original?: ScheduleEntry;
    working?: ScheduleEntry;
    conflict?: ScheduleConflict;
    sequenceError?: string;
    moved: boolean;
    clientX: number;
    clientY: number;
  };

  let tasks = $state<ScheduleTask[]>([]);
  let schedules = $state<ScheduleMap>({});
  let allTasks = $state<ScheduleTask[]>([]);
  let allTaskRecords = $state<EntityRecord[]>([]);
  let activeWorkspaceId = $state(PERSONAL_WORKSPACE_ID);
  let workspaceUsers = $state<WorkspaceUser[]>([]);
  let drawerOpen = $state(false);
  let includeSaturday = $state(true);
  let showCurrentTime = $state(true);
  let initialized = $state(false);
  let now = $state(new Date());
  const visibleStart = 0;
  const visibleEnd = 24 * 60;
  let workdayStart = $state(8 * 60);
  let selectedTask = $state<EntityRecord>();
  let taskFormMode = $state<TaskFormMode>("view");
  let drag = $state<DragState | null>(null);
  let activeDropTarget = $state<string>();
  let scheduleError = $state<string>();
  let tasksLoading = $state(false);
  let scheduleSaving = $state(false);
  let autoScheduling = $state(false);
  let scheduleNotice = $state<string>();
  let scheduleNoticeWarning = $state(false);
  let tasksAbortController: AbortController | undefined;
  let viewport: HTMLDivElement;
  let grid: HTMLDivElement;
  let pointerCleanup: (() => void) | undefined;
  let lastAutoScrollKey = "";
  let scheduleNoticeTimeout: number | undefined;
  let heldTaskCard = $derived(
    drag?.mode === "drag" ? toTaskCardItem(drag.task) : undefined,
  );

  let weekStart = $derived(
    resolveWeekStart(page.url.searchParams.get("week"), now),
  );
  let days = $derived(buildWeekDays(weekStart, now, includeSaturday));
  let weekStartIso = $derived(days[0]?.iso ?? "");
  let weekEndIso = $derived(days.at(-1)?.iso ?? "");
  let scheduledThisWeek = $derived(
    tasks
      .map((task) => ({ task, schedule: schedules[task.id] }))
      .filter(
        (item): item is { task: ScheduleTask; schedule: ScheduleEntry } =>
          !!item.schedule &&
          item.schedule.date >= weekStartIso &&
          item.schedule.date <= weekEndIso,
      ),
  );
  let slots = $derived(
    Array.from(
      { length: Math.max(1, (visibleEnd - visibleStart) / MINUTES_PER_SLOT) },
      (_, index) => visibleStart + index * MINUTES_PER_SLOT,
    ),
  );
  let unscheduledTasks = $derived(
    nextUnscheduledSubtasksForWorkspace(tasks, schedules, activeWorkspaceId),
  );
  let positionedByDay = $derived(
    days.map(
      (day) =>
        layoutScheduleGroup(
          scheduledThisWeek.filter((item) => item.schedule.date === day.iso),
        ) as PositionedTask[],
    ),
  );
  let currentMinutes = $derived(now.getHours() * 60 + now.getMinutes());
  let currentDayIndex = $derived(days.findIndex((day) => day.isToday));
  let showCurrentMarker = $derived(
    showCurrentTime &&
      currentDayIndex >= 0 &&
      currentMinutes >= visibleStart &&
      currentMinutes <= visibleEnd,
  );

  function applyCronogramaPreferences(
    settings: ReturnType<typeof currentSettings>,
  ): void {
    drawerOpen = settings.cronogramaDrawerDefault === "expanded";
    includeSaturday = settings.cronogramaDays === "saturday";
    showCurrentTime = settings.cronogramaShowCurrentTime;
    const starts = settings.workdayShifts
      .map((shift) => parseTime(shift.start))
      .filter((value): value is number => value !== null);
    if (starts.length) {
      workdayStart =
        Math.floor(Math.min(...starts) / MINUTES_PER_SLOT) * MINUTES_PER_SLOT;
    }
  }

  onMount(() => {
    applyCronogramaPreferences(currentSettings());
    void loadSettingsFromServer()
      .then(applyCronogramaPreferences)
      .catch(() => undefined);

    void refreshTasks();
    initialized = true;
    const stopTasks = observeTasks(() => void refreshTasks());
    const stopWorkspaces = observeWorkspaces(() => void refreshTasks());
    const minuteTimer = window.setInterval(() => (now = new Date()), 60_000);
    const autoSchedule = () => void autoOrganizeSchedule();
    window.addEventListener(
      CRONOGRAMA_AUTO_SCHEDULE_REQUEST_EVENT,
      autoSchedule,
    );

    return () => {
      tasksAbortController?.abort();
      stopTasks();
      stopWorkspaces();
      window.clearInterval(minuteTimer);
      if (scheduleNoticeTimeout) window.clearTimeout(scheduleNoticeTimeout);
      window.removeEventListener(
        CRONOGRAMA_AUTO_SCHEDULE_REQUEST_EVENT,
        autoSchedule,
      );
      publishCronogramaAutoScheduleState({ ready: false, busy: false });
      pointerCleanup?.();
      clearInteractionCursor();
    };
  });

  $effect(() => {
    const ready = initialized && !tasksLoading && tasks.length > 0;
    const busy = scheduleSaving || autoScheduling || !!drag;
    if (typeof window !== "undefined") {
      publishCronogramaAutoScheduleState({ ready, busy });
    }
  });

  $effect(() => {
    const week = weekStartIso;
    const scrollKey = `${week}:${showCurrentMarker ? "now" : workdayStart}`;
    const shouldScroll = initialized && viewport && week;
    if (!shouldScroll || lastAutoScrollKey === scrollKey) return;
    lastAutoScrollKey = scrollKey;
    void tick().then(() => {
      const marker = viewport.querySelector<HTMLElement>("[data-now-marker]");
      const targetOffset = marker
        ? marker.offsetTop - viewport.clientHeight * 0.42
        : ((workdayStart - visibleStart) / MINUTES_PER_SLOT) * slotHeight() -
          20;
      viewport.scrollTop = Math.max(0, targetOffset);
    });
  });

  function parseTime(value: string): number | null {
    if (!/^\d{2}:\d{2}$/.test(value)) return null;
    const [hours, minutes] = value.split(":").map(Number);
    return Number.isFinite(hours) && Number.isFinite(minutes)
      ? hours * 60 + minutes
      : null;
  }

  function taskDurationSlots(value: string): number {
    const slots = Math.round(Number(value) * (60 / MINUTES_PER_SLOT));
    if (!Number.isFinite(slots)) return 2;
    return Math.max(MIN_DURATION_SLOTS, Math.min(MAX_DURATION_SLOTS, slots));
  }

  function assignedToCurrentUser(task: ScheduleTask): boolean {
    try {
      const ids = JSON.parse(task.responsibleUserIds || "[]") as unknown;
      if (Array.isArray(ids) && ids.includes(CURRENT_USER.id)) return true;
    } catch {
      // Registros sem o array tipado ainda usam a compatibilidade singular.
    }
    return isAssignedToUser(task, CURRENT_USER, workspaceUsers);
  }

  function toTaskCardItem(task: ScheduleTask): EntityCardItem {
    const statusKey = task.status || "planejamento";
    const statusByValue: Record<string, { label: string; color: string }> = {
      pendente: { label: "Pendente", color: "#64748b" },
      planejamento: { label: "Fila", color: "#64748b" },
      fila: { label: "A fazer", color: "#64748b" },
      producao: { label: "Fazendo", color: "#2e56ff" },
      revisao: { label: "Em revisão", color: "#eab308" },
      conclusao: { label: "Feito", color: "#5dac83" },
      entregue: { label: "Entregue", color: "#5dac83" },
    };
    const status = statusByValue[statusKey] ?? {
      label: statusKey,
      color: "#64748b",
    };

    return {
      id: task.id,
      kind: "tarefa",
      title: task.nome,
      status: status.label,
      statusColor: status.color,
      primary: task.taskNome,
      secondary: task.projeto || "Projeto não informado",
      relation: task.descricao || "Tarefa planejada",
      responsible: task.responsavel || "Sem responsável",
      responsibleAvatarUrl: task.responsibleAvatarUrl,
      steps: `${task.sequence + 1}/${task.subtaskCount}`,
    };
  }

  async function refreshTasks(): Promise<void> {
    tasksAbortController?.abort();
    const controller = new AbortController();
    tasksAbortController = controller;
    tasksLoading = true;
    scheduleError = undefined;
    try {
      activeWorkspaceId = loadActiveWorkspaceId();
      const workspaceIds = loadWorkspaces().map(({ id }) => id);
      const concreteWorkspaceIds = workspaceIds.length
        ? workspaceIds
        : activeWorkspaceId && activeWorkspaceId !== GLOBAL_WORKSPACE_ID
          ? [activeWorkspaceId]
          : [];
      const [taskGroups, cronogramas] = concreteWorkspaceIds.length
        ? await Promise.all([
            Promise.all(
              concreteWorkspaceIds.map((workspaceId) =>
                listAllTasks({ workspaceId, signal: controller.signal }),
              ),
            ),
            Promise.all(
              concreteWorkspaceIds.map((workspaceId) =>
                loadCronogramaSnapshot({ workspaceId }),
              ),
            ),
          ])
        : [
            [await listAllTasks({ signal: controller.signal })],
            [await loadCronogramaSnapshot()],
          ];
      if (controller.signal.aborted) return;
      const serverTasks = taskGroups.flat();
      const cronograma = {
        workspaceId: GLOBAL_WORKSPACE_ID,
        items: cronogramas.flatMap(({ items }) => items),
      };
      allTaskRecords = serverTasks
        .map(taskToEntityRecord)
        .filter((record) => !!record.nome);
      workspaceUsers = loadWorkspaceUsers();
      allTasks = toScheduleSubtasks(allTaskRecords).map((task) => ({
        ...task,
        responsibleAvatarUrl:
          task.responsibleAvatarUrl ||
          resolveResponsibleUser(task, workspaceUsers)?.avatarUrl,
      }));
      tasks = allTasks.filter(
        (task) =>
          assignedToCurrentUser(task) &&
          !task.archivedAt &&
          task.taskStatus !== "arquivado",
      );
      schedules = scheduleMapFromSnapshot(cronograma);
    } catch (cause) {
      if (controller.signal.aborted) return;
      allTaskRecords = [];
      allTasks = [];
      tasks = [];
      scheduleError =
        cause instanceof TaskApiError || cause instanceof CronogramaApiError
          ? cause.message
          : "Não foi possível carregar o Cronograma.";
    } finally {
      if (tasksAbortController === controller) tasksLoading = false;
    }
  }

  function updateSchedule(taskId: string, entry?: ScheduleEntry): void {
    const next = { ...schedules };
    if (entry) next[taskId] = entry;
    else delete next[taskId];
    schedules = next;
  }

  function applyWorkspaceScheduleSnapshot(
    snapshot: Awaited<ReturnType<typeof loadCronogramaSnapshot>>,
  ): void {
    const next = { ...schedules };
    for (const task of allTasks) {
      if (
        (task.workspaceId ?? PERSONAL_WORKSPACE_ID) === snapshot.workspaceId
      ) {
        delete next[task.id];
      }
    }
    schedules = { ...next, ...scheduleMapFromSnapshot(snapshot) };
  }

  async function loadCompleteCronogramaSnapshot() {
    const workspaceIds = loadWorkspaces().map(({ id }) => id);
    const concreteWorkspaceIds = workspaceIds.length
      ? workspaceIds
      : activeWorkspaceId && activeWorkspaceId !== GLOBAL_WORKSPACE_ID
        ? [activeWorkspaceId]
        : [];
    if (!concreteWorkspaceIds.length) return loadCronogramaSnapshot();
    const snapshots = await Promise.all(
      concreteWorkspaceIds.map((workspaceId) =>
        loadCronogramaSnapshot({ workspaceId }),
      ),
    );
    return {
      workspaceId: GLOBAL_WORKSPACE_ID,
      items: snapshots.flatMap(({ items }) => items),
    };
  }

  async function persistSchedule(completed: DragState): Promise<void> {
    scheduleSaving = true;
    try {
      const snapshot = completed.working
        ? await saveCronogramaEntry(completed.task.subtaskId, {
            date: completed.working.date,
            startMinutes: completed.working.startMinutes,
            durationMinutes: completed.working.durationSlots * MINUTES_PER_SLOT,
            version: completed.original?.version ?? 0,
          })
        : await deleteCronogramaEntry(
            completed.task.subtaskId,
            completed.original?.version ?? 0,
          );
      applyWorkspaceScheduleSnapshot(snapshot);
      scheduleError = undefined;
    } catch (cause) {
      updateSchedule(completed.task.id, completed.original);
      scheduleError =
        cause instanceof CronogramaApiError
          ? cause.message
          : "Não foi possível atualizar o Cronograma.";
      try {
        schedules = scheduleMapFromSnapshot(
          await loadCompleteCronogramaSnapshot(),
        );
      } catch {
        // Mantém a cópia anterior quando a recarga também falhar.
      }
    } finally {
      scheduleSaving = false;
    }
  }

  function applyScheduleCandidate(entry: ScheduleEntry): void {
    if (!drag) return;
    const current = drag;
    const conflict = findScheduleConflict(
      current.task,
      entry,
      allTasks,
      schedules,
    );
    const sequenceConflict = findSequenceConflict(
      current.task,
      entry,
      allTasks,
      schedules,
    );
    drag = {
      ...current,
      working: entry,
      conflict,
      sequenceError: sequenceConflict?.message,
    };
    activeDropTarget = entry.date;

    if (conflict || sequenceConflict) {
      updateSchedule(current.task.id, current.original);
      scheduleError = conflict
        ? describeScheduleConflict(conflict)
        : sequenceConflict?.message;
      return;
    }

    scheduleError = undefined;
    updateSchedule(current.task.id, entry);
  }

  function slotHeight(): number {
    if (!grid) return 36;
    const parsed = Number.parseFloat(
      window.getComputedStyle(grid).getPropertyValue("--slot-height"),
    );
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 36;
  }

  function clampStart(value: number, durationSlots: number): number {
    const maxStart = Math.max(
      visibleStart,
      visibleEnd - durationSlots * MINUTES_PER_SLOT,
    );
    return Math.max(visibleStart, Math.min(maxStart, value));
  }

  function beginInteraction(
    event: PointerEvent,
    task: ScheduleTask,
    schedule?: ScheduleEntry,
  ): void {
    if (
      event.button !== 0 ||
      drag ||
      scheduleSaving ||
      isCronogramaTaskMuted(task, activeWorkspaceId)
    )
      return;
    const card = event.currentTarget;
    if (!(card instanceof HTMLElement)) return;

    const rect = card.getBoundingClientRect();
    const mode: DragMode =
      schedule && rect.bottom - event.clientY <= 17 ? "resize" : "drag";
    const durationSlots =
      schedule?.durationSlots ?? taskDurationSlots(task.duracao);
    const pointerRatio = Math.max(
      0,
      Math.min(1, (event.clientY - rect.top) / Math.max(1, rect.height)),
    );
    const pointerOffsetMinutes =
      Math.round(
        (durationSlots * MINUTES_PER_SLOT * pointerRatio) / MINUTES_PER_SLOT,
      ) * MINUTES_PER_SLOT;

    scheduleError = undefined;

    drag = {
      task,
      mode,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      pointerOffsetMinutes: Math.min(
        pointerOffsetMinutes,
        durationSlots * MINUTES_PER_SLOT - MINUTES_PER_SLOT,
      ),
      original: schedule ? { ...schedule } : undefined,
      working: schedule ? { ...schedule } : undefined,
      moved: false,
      clientX: event.clientX,
      clientY: event.clientY,
    };

    const handleMove = (moveEvent: PointerEvent) => {
      if (moveEvent.pointerId !== drag?.pointerId) return;
      moveInteraction(moveEvent);
    };
    const handleUp = (upEvent: PointerEvent) => {
      if (upEvent.pointerId !== drag?.pointerId) return;
      finishInteraction(false);
    };
    const handleCancel = (cancelEvent: PointerEvent) => {
      if (cancelEvent.pointerId !== drag?.pointerId) return;
      finishInteraction(true);
    };

    window.addEventListener("pointermove", handleMove, true);
    window.addEventListener("pointerup", handleUp, true);
    window.addEventListener("pointercancel", handleCancel, true);
    pointerCleanup = () => {
      window.removeEventListener("pointermove", handleMove, true);
      window.removeEventListener("pointerup", handleUp, true);
      window.removeEventListener("pointercancel", handleCancel, true);
      pointerCleanup = undefined;
    };
  }

  function moveInteraction(event: PointerEvent): void {
    if (!drag) return;
    const distance = Math.hypot(
      event.clientX - drag.startX,
      event.clientY - drag.startY,
    );
    if (!drag.moved && distance < (drag.mode === "resize" ? 3 : 5)) return;

    event.preventDefault();
    if (!drag.moved) {
      document.documentElement.classList.add(
        drag.mode === "resize" ? "cronograma-resizing" : "cronograma-dragging",
      );
    }

    drag = {
      ...drag,
      moved: true,
      clientX: event.clientX,
      clientY: event.clientY,
    };
    const target = document.elementFromPoint(event.clientX, event.clientY);
    const drawer =
      drag.mode === "drag" ? target?.closest("[data-card-drawer]") : null;
    if (!drawer) autoScroll(event.clientX, event.clientY);

    if (drag.mode === "resize") {
      if (!drag.original) return;
      const deltaSlots = Math.round(
        (event.clientY - drag.startY) / slotHeight(),
      );
      const maxByViewport = Math.max(
        MIN_DURATION_SLOTS,
        Math.floor(
          (visibleEnd - drag.original.startMinutes) / MINUTES_PER_SLOT,
        ),
      );
      const durationSlots = Math.max(
        MIN_DURATION_SLOTS,
        Math.min(
          MAX_DURATION_SLOTS,
          maxByViewport,
          drag.original.durationSlots + deltaSlots,
        ),
      );
      const working = { ...drag.original, durationSlots };
      applyScheduleCandidate(working);
      return;
    }

    if (drawer) {
      drag = {
        ...drag,
        working: undefined,
        conflict: undefined,
        sequenceError: undefined,
      };
      activeDropTarget = "drawer";
      scheduleError = undefined;
      updateSchedule(drag.task.id);
      return;
    }

    const day = target?.closest<HTMLElement>("[data-schedule-day]");
    if (day) {
      const durationSlots =
        drag.working?.durationSlots ??
        drag.original?.durationSlots ??
        taskDurationSlots(drag.task.duracao);
      const rect = day.getBoundingClientRect();
      const rawMinutes =
        visibleStart +
        Math.round((event.clientY - rect.top) / slotHeight()) *
          MINUTES_PER_SLOT -
        drag.pointerOffsetMinutes;
      const startMinutes = clampStart(
        Math.round(rawMinutes / MINUTES_PER_SLOT) * MINUTES_PER_SLOT,
        durationSlots,
      );
      const working = {
        date: day.dataset.date ?? weekStartIso,
        startMinutes,
        durationSlots,
      };
      applyScheduleCandidate(working);
      return;
    }

    activeDropTarget = undefined;
    if (!drag.original) {
      drag = {
        ...drag,
        working: undefined,
        conflict: undefined,
        sequenceError: undefined,
      };
      scheduleError = undefined;
      updateSchedule(drag.task.id);
    }
  }

  function finishInteraction(cancelled: boolean): void {
    if (!drag) return;
    const completed = drag;
    pointerCleanup?.();
    clearInteractionCursor();
    activeDropTarget = undefined;
    drag = null;

    if (!completed.moved) {
      openTask(completed.task);
      return;
    }

    if (cancelled) {
      updateSchedule(completed.task.id, completed.original);
      return;
    }

    if (completed.conflict) {
      updateSchedule(completed.task.id, completed.original);
      scheduleError = describeScheduleConflict(completed.conflict);
      return;
    }

    if (completed.sequenceError) {
      updateSchedule(completed.task.id, completed.original);
      scheduleError = completed.sequenceError;
      return;
    }

    void persistSchedule(completed);
  }

  function clearInteractionCursor(): void {
    document.documentElement.classList.remove(
      "cronograma-dragging",
      "cronograma-resizing",
    );
  }

  function autoScroll(clientX: number, clientY: number): void {
    if (!viewport) return;
    const rect = viewport.getBoundingClientRect();
    const edge = 54;
    const speed = 18;
    if (clientY < rect.top + edge) viewport.scrollTop -= speed;
    else if (clientY > rect.bottom - edge) viewport.scrollTop += speed;
    if (clientX < rect.left + edge) viewport.scrollLeft -= speed;
    else if (clientX > rect.right - edge) viewport.scrollLeft += speed;
  }

  function openTask(task: ScheduleTask): void {
    if (drag || isCronogramaTaskMuted(task, activeWorkspaceId)) return;
    selectedTask = allTaskRecords.find((record) => record.id === task.taskId);
    taskFormMode = "view";
  }

  function handleTaskCardKeydown(
    event: KeyboardEvent,
    task: ScheduleTask,
  ): void {
    if (event.target !== event.currentTarget) return;
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    openTask(task);
  }

  async function saveTask(values: Record<string, string>): Promise<void> {
    if (!selectedTask) return;
    tasksLoading = true;
    scheduleError = undefined;
    try {
      await updateTaskFromEntityValues(selectedTask.id, values, selectedTask);
      selectedTask = undefined;
      await refreshTasks();
    } catch (cause) {
      scheduleError =
        cause instanceof TaskApiError
          ? cause.message
          : "Não foi possível salvar a tarefa.";
    } finally {
      tasksLoading = false;
    }
  }

  function showScheduleNotice(message: string, warning = false): void {
    scheduleNotice = message;
    scheduleNoticeWarning = warning;
    if (scheduleNoticeTimeout) window.clearTimeout(scheduleNoticeTimeout);
    scheduleNoticeTimeout = window.setTimeout(() => {
      scheduleNotice = undefined;
      scheduleNoticeTimeout = undefined;
    }, 5_500);
  }

  async function autoOrganizeSchedule(): Promise<void> {
    if (autoScheduling || scheduleSaving || tasksLoading || drag) return;
    autoScheduling = true;
    scheduleError = undefined;
    scheduleNotice = undefined;
    const originalSchedules = schedules;

    try {
      const settings = currentSettings();
      const eligibleTasks = tasks.filter(
        (task) => !isCronogramaTaskMuted(task, activeWorkspaceId),
      );
      const tasksByWorkspace = new Map<string, ScheduleTask[]>();
      for (const task of eligibleTasks) {
        if (!task.workspaceId) {
          throw new Error("Uma tarefa não possui workspace válido.");
        }
        tasksByWorkspace.set(task.workspaceId, [
          ...(tasksByWorkspace.get(task.workspaceId) ?? []),
          task,
        ]);
      }
      let calculatedSchedules = { ...schedules };
      const changedTaskIds: string[] = [];
      const unscheduledTaskIds: string[] = [];
      for (const [, workspaceTasks] of [...tasksByWorkspace].sort(
        ([left], [right]) => left.localeCompare(right),
      )) {
        const workspaceResult = autoScheduleWeek({
          tasks: allTasks,
          candidateTaskIds: workspaceTasks.map((task) => task.id),
          schedules: calculatedSchedules,
          days: days.map((day) => day.iso),
          shifts: settings.workdayShifts,
          now,
        });
        calculatedSchedules = workspaceResult.schedule;
        changedTaskIds.push(...workspaceResult.changedTaskIds);
        unscheduledTaskIds.push(...workspaceResult.unscheduledTaskIds);
      }
      const result = {
        schedule: calculatedSchedules,
        changedTaskIds,
        unscheduledTaskIds,
      };

      if (!result.changedTaskIds.length) {
        showScheduleNotice(
          result.unscheduledTaskIds.length
            ? `Não há espaço livre nesta semana para ${result.unscheduledTaskIds.length} ${result.unscheduledTaskIds.length === 1 ? "card" : "cards"}.`
            : "O cronograma desta semana já está organizado.",
          result.unscheduledTaskIds.length > 0,
        );
        return;
      }

      schedules = result.schedule;
      const taskById = new Map(allTasks.map((task) => [task.id, task]));
      const byWorkspace = new Map<
        string,
        Array<{
          subtaskId: string;
          date: string;
          startMinutes: number;
          durationMinutes: number;
          version: number;
        }>
      >();

      for (const taskId of result.changedTaskIds) {
        const task = taskById.get(taskId);
        const entry = result.schedule[taskId];
        const workspaceId = task?.workspaceId;
        if (!task || !entry || !workspaceId) {
          throw new Error("Uma tarefa não possui workspace válido.");
        }
        byWorkspace.set(workspaceId, [
          ...(byWorkspace.get(workspaceId) ?? []),
          {
            subtaskId: task.subtaskId,
            date: entry.date,
            startMinutes: entry.startMinutes,
            durationMinutes: entry.durationSlots * MINUTES_PER_SLOT,
            version: originalSchedules[taskId]?.version ?? 0,
          },
        ]);
      }

      for (const [workspaceId, blocks] of [...byWorkspace].sort(
        ([left], [right]) => left.localeCompare(right),
      )) {
        await saveCronogramaReorganization({ workspaceId, blocks });
      }
      schedules = scheduleMapFromSnapshot(
        await loadCompleteCronogramaSnapshot(),
      );

      const newlyScheduled = result.changedTaskIds.filter(
        (taskId) => !originalSchedules[taskId],
      ).length;
      const moved = result.changedTaskIds.length - newlyScheduled;
      const summary = [
        moved
          ? `${moved} ${moved === 1 ? "card reposicionado" : "cards reposicionados"}`
          : "",
        newlyScheduled
          ? `${newlyScheduled} ${newlyScheduled === 1 ? "card agendado" : "cards agendados"}`
          : "",
      ].filter(Boolean);
      const pending = result.unscheduledTaskIds.length;
      showScheduleNotice(
        `${summary.join(" e ")}.${
          pending
            ? ` ${pending} ${pending === 1 ? "card ficou" : "cards ficaram"} aguardando espaço.`
            : ""
        }`,
        pending > 0,
      );
    } catch (cause) {
      schedules = originalSchedules;
      scheduleError =
        cause instanceof CronogramaApiError
          ? cause.message
          : "Não foi possível reorganizar o Cronograma.";
      try {
        schedules = scheduleMapFromSnapshot(
          await loadCompleteCronogramaSnapshot(),
        );
      } catch {
        // Mantém a cópia anterior quando a recarga também falhar.
      }
    } finally {
      autoScheduling = false;
    }
  }
</script>

<svelte:head><title>Cronograma · Demanda</title></svelte:head>

<section
  class="cronograma-page"
  aria-label="Cronograma semanal"
  aria-busy={tasksLoading || scheduleSaving || autoScheduling}
>
  <article
    class="schedule-board"
    aria-label={`Tarefas programadas de segunda a ${includeSaturday ? "sábado" : "sexta"}`}
  >
    <div class="schedule-viewport" bind:this={viewport} data-schedule-viewport>
      <div
        class="schedule-grid"
        bind:this={grid}
        style={`--slot-count: ${slots.length}; --day-count: ${days.length}; --days-min-width: ${116 + days.length * 210}px`}
      >
        <div class="grid-head grid-head-time">Horário</div>

        {#each days as day}
          <div
            class:today={day.isToday}
            class="grid-head grid-head-day"
            style={`grid-column: ${day.index + 2}`}
          >
            <strong>
              <span class="day-label full">{day.fullLabel}</span>
              <span class="day-label medium">{day.mediumLabel}</span>
              <span class="day-label short">{day.shortLabel}</span>
            </strong>
            <span>{day.dateLabel}</span>
          </div>
        {/each}

        <div class="time-column">
          {#each slots as minutes}
            <div class:full-hour={minutes % 60 === 0} class="time-slot">
              <strong>{minutesToTime(minutes)}</strong>
              <span>{minutesToTime(minutes + MINUTES_PER_SLOT)}</span>
            </div>
          {/each}
        </div>

        {#each days as day}
          <div
            class:today={day.isToday}
            class:drop-target={activeDropTarget === day.iso &&
              !drag?.conflict &&
              !drag?.sequenceError}
            class:conflict-target={activeDropTarget === day.iso &&
              (!!drag?.conflict || !!drag?.sequenceError)}
            class="schedule-day"
            data-schedule-day
            data-date={day.iso}
            style={`grid-column: ${day.index + 2}`}
          >
            {#if showCurrentMarker && currentDayIndex === day.index}
              <span
                class="now-marker"
                data-now-marker
                style={`--now-offset: ${(currentMinutes - visibleStart) / MINUTES_PER_SLOT}`}
              >
                <span>{minutesToTime(currentMinutes)}</span>
              </span>
            {/if}

            {#each positionedByDay[day.index] ?? [] as item (item.task.id)}
              <div
                class="positioned-task"
                style={`--task-start: ${(item.schedule.startMinutes - visibleStart) / MINUTES_PER_SLOT}; --task-span: ${item.schedule.durationSlots}; --task-left: ${(item.lane / item.laneCount) * 100}%; --task-width: ${100 / item.laneCount}%`}
              >
                <ScheduleCard
                  task={item.task}
                  schedule={item.schedule}
                  muted={isCronogramaTaskMuted(item.task, activeWorkspaceId)}
                  dragging={drag?.moved &&
                    drag.task.id === item.task.id &&
                    drag.mode === "drag"}
                  onpointerstart={(event) =>
                    beginInteraction(event, item.task, item.schedule)}
                  onopen={() => openTask(item.task)}
                />
              </div>
            {/each}
          </div>
        {/each}
      </div>
    </div>
  </article>

  <CardDrawer
    ariaLabel="Subtarefas disponíveis"
    title="Subtarefas a programar"
    description="Mostra somente a próxima subtarefa disponível de cada tarefa. Arraste para definir sua execução."
    icon={ListTodo}
    items={unscheduledTasks}
    getKey={(task) => task.id}
    open={drawerOpen}
    isDropTarget={activeDropTarget === "drawer"}
    countLabel="subtarefas disponíveis"
    toggleAriaLabel={drawerOpen
      ? "Recolher itens não agendados"
      : "Abrir itens não agendados"}
    ontoggle={() => (drawerOpen = !drawerOpen)}
  >
    {#snippet card(task)}
      <div
        class:dragging={drag?.moved && drag.task.id === task.id}
        class="unscheduled-task-card"
        role="button"
        tabindex="0"
        aria-label={`Subtarefa: ${task.nome}. Tarefa: ${task.taskNome}. Arraste para programar.`}
        data-task-id={task.id}
        data-drawer-task-card
        onpointerdown={(event) => beginInteraction(event, task)}
        onkeydown={(event) => handleTaskCardKeydown(event, task)}
      >
        <EntityCard item={toTaskCardItem(task)} level={4} />
      </div>
    {/snippet}

    {#snippet empty()}
      <Inbox size={18} />Nenhuma subtarefa disponível para programar.
    {/snippet}
  </CardDrawer>
</section>

{#if scheduleError}
  <div class="conflict-notice" role="alert" data-schedule-conflict>
    <AlertTriangle size={18} aria-hidden="true" />
    <span>{scheduleError}</span>
    <button
      type="button"
      aria-label="Fechar aviso de conflito"
      onclick={() => (scheduleError = undefined)}
    >
      <X size={16} />
    </button>
  </div>
{/if}

{#if scheduleNotice}
  <div
    class:warning={scheduleNoticeWarning}
    class="schedule-notice"
    role="status"
  >
    <span>{scheduleNotice}</span>
    <button
      type="button"
      aria-label="Fechar confirmação"
      onclick={() => (scheduleNotice = undefined)}
    >
      <X size={16} />
    </button>
  </div>
{/if}

{#if drag?.moved && heldTaskCard}
  <div
    class="drag-preview"
    style={`left: ${drag.clientX + 14}px; top: ${drag.clientY + 14}px`}
    aria-hidden="true"
    data-drag-preview-card
  >
    <EntityCard item={heldTaskCard} level={5} interactive={false} />
  </div>
{/if}

{#if selectedTask}
  <TaskForm
    config={deliveryConfig}
    record={selectedTask}
    mode={taskFormMode}
    oncancel={() => (selectedTask = undefined)}
    onsave={saveTask}
    onedit={() => (taskFormMode = "edit")}
  />
{/if}

<style>
  :global(html.cronograma-dragging),
  :global(html.cronograma-dragging body) {
    cursor: grabbing !important;
    user-select: none;
  }
  :global(html.cronograma-resizing),
  :global(html.cronograma-resizing body) {
    cursor: ns-resize !important;
    user-select: none;
  }
  .cronograma-page {
    display: flex;
    width: 100%;
    height: 100%;
    min-width: 0;
    min-height: 0;
    flex-direction: column;
    gap: 12px;
  }
  .schedule-board {
    min-width: 0;
    min-height: 0;
    flex: 1 1 0;
    overflow: hidden;
    border: 1px solid var(--border);
    border-radius: var(--radius-xl);
    background: var(--panel);
  }
  .schedule-viewport {
    width: 100%;
    height: 100%;
    min-width: 0;
    min-height: 0;
    overflow: auto;
    overscroll-behavior: contain;
    scrollbar-color: rgba(100, 116, 139, 0.55) transparent;
    scrollbar-width: thin;
  }
  .schedule-grid {
    --time-column-width: 104px;
    --day-column-min: 210px;
    --slot-height: 35px;
    display: grid;
    min-width: var(--days-min-width);
    grid-template-columns: var(--time-column-width) repeat(
        var(--day-count),
        minmax(var(--day-column-min), 1fr)
      );
    grid-template-rows: auto auto;
    background: var(--panel);
  }
  .grid-head {
    position: sticky;
    z-index: 12;
    top: 0;
    min-height: 40px;
    padding: 6px 10px;
    border-bottom: 1px solid var(--border);
    background: linear-gradient(180deg, #edf2fa, #f4f7fb);
    backdrop-filter: blur(9px);
  }
  .grid-head-time {
    z-index: 14;
    left: 0;
    display: flex;
    align-items: center;
    color: var(--ink-500);
    font-size: var(--text-xs);
    font-weight: 700;
    letter-spacing: 0.05em;
    text-transform: uppercase;
    grid-column: 1;
  }
  .grid-head-day {
    container-type: inline-size;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    border-left: 1px solid var(--border);
    text-align: left;
  }
  .grid-head-day strong {
    min-width: 0;
    color: var(--ink-800);
    font-size: var(--text-md);
    line-height: 1.05;
    white-space: nowrap;
  }
  .grid-head-day > span {
    flex: none;
    color: var(--ink-500);
    font-size: var(--text-sm);
    font-variant-numeric: tabular-nums;
    line-height: 1.05;
    text-align: right;
    white-space: nowrap;
  }
  .grid-head-day.today {
    background: linear-gradient(180deg, #dfe9f8, #eef4fa);
  }
  .day-label.medium,
  .day-label.short {
    display: none;
  }
  @container (max-width: 150px) {
    .day-label.full {
      display: none;
    }
    .day-label.medium {
      display: inline;
    }
  }
  @container (max-width: 96px) {
    .day-label.medium {
      display: none;
    }
    .day-label.short {
      display: inline;
    }
  }
  .time-column {
    position: sticky;
    z-index: 10;
    left: 0;
    border-right: 1px solid var(--border);
    background: repeating-linear-gradient(
      to bottom,
      rgba(255, 255, 255, 0.98) 0,
      rgba(255, 255, 255, 0.98) calc(var(--slot-height) - 1px),
      rgba(203, 213, 225, 0.78) calc(var(--slot-height) - 1px),
      rgba(203, 213, 225, 0.78) var(--slot-height)
    );
    grid-column: 1;
    grid-row: 2;
  }
  .time-slot {
    display: flex;
    height: var(--slot-height);
    align-items: center;
    justify-content: flex-start;
    gap: 6px;
    padding: 0 8px;
    color: var(--ink-400);
    font-size: var(--text-sm);
    white-space: nowrap;
  }
  .time-slot strong {
    color: var(--ink-700);
    font-size: var(--text-md);
    font-weight: 500;
  }
  .time-slot span {
    margin-left: auto;
    font-size: var(--text-md);
    font-weight: 400;
    text-align: right;
  }
  .schedule-day {
    position: relative;
    min-height: calc(var(--slot-count) * var(--slot-height));
    border-left: 1px solid var(--border);
    transition: background-color 120ms ease;
    background: repeating-linear-gradient(
      to bottom,
      rgba(255, 255, 255, 0.9) 0,
      rgba(255, 255, 255, 0.9) calc(var(--slot-height) - 1px),
      rgba(203, 213, 225, 0.68) calc(var(--slot-height) - 1px),
      rgba(203, 213, 225, 0.68) var(--slot-height)
    );
    grid-row: 2;
  }
  .schedule-day.today {
    background:
      linear-gradient(rgba(46, 86, 255, 0.035), rgba(46, 86, 255, 0.035)),
      repeating-linear-gradient(
        to bottom,
        rgba(255, 255, 255, 0.9) 0,
        rgba(255, 255, 255, 0.9) calc(var(--slot-height) - 1px),
        rgba(203, 213, 225, 0.68) calc(var(--slot-height) - 1px),
        rgba(203, 213, 225, 0.68) var(--slot-height)
      );
  }
  .schedule-day.drop-target {
    background-color: rgba(46, 86, 255, 0.1);
    background-blend-mode: multiply;
  }
  .schedule-day.conflict-target {
    background-color: rgba(220, 38, 38, 0.12);
    background-blend-mode: multiply;
  }
  .positioned-task {
    position: absolute;
    z-index: 3;
    top: calc(var(--task-start) * var(--slot-height));
    left: var(--task-left);
    width: var(--task-width);
    height: calc(var(--task-span) * var(--slot-height));
    min-height: var(--slot-height);
  }
  .positioned-task::after {
    position: absolute;
    z-index: 9;
    right: 0;
    bottom: 0;
    left: 0;
    height: 1px;
    background: var(--border);
    content: "";
    pointer-events: none;
  }
  :global(.positioned-task > .task-card) {
    position: relative;
    width: 100%;
    height: 100%;
  }
  .now-marker {
    position: absolute;
    z-index: 5;
    top: calc(var(--now-offset) * var(--slot-height));
    right: 0;
    left: 0;
    height: 2px;
    background: var(--danger);
    pointer-events: none;
  }
  .now-marker::before {
    position: absolute;
    top: -3px;
    left: -4px;
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--danger);
    content: "";
  }
  .now-marker span {
    position: absolute;
    top: -10px;
    right: 7px;
    padding: 2px 7px;
    border-radius: var(--radius-pill);
    color: #ffffff;
    background: var(--danger);
    font-size: var(--text-xs);
    font-weight: 700;
  }
  .unscheduled-task-card {
    width: 100%;
    min-width: 0;
    cursor: grab;
    touch-action: none;
    user-select: none;
    transition: opacity var(--motion-fast);
  }
  .unscheduled-task-card:active {
    cursor: grabbing;
  }
  .unscheduled-task-card.dragging {
    opacity: 0.28;
    pointer-events: none;
  }
  .drag-preview {
    position: fixed;
    z-index: 90;
    width: min(290px, calc(100vw - 28px));
    filter: drop-shadow(0 12px 22px rgba(15, 23, 42, 0.16));
    pointer-events: none;
  }
  .conflict-notice {
    position: fixed;
    z-index: 95;
    top: calc(var(--topbar-height) + 14px);
    right: 18px;
    display: grid;
    width: min(440px, calc(100vw - 36px));
    min-height: 48px;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: center;
    gap: 10px;
    padding: 10px 11px 10px 13px;
    border: 1px solid rgba(220, 38, 38, 0.28);
    border-radius: 11px;
    color: #991b1b;
    background: rgba(254, 242, 242, 0.98);
    box-shadow: var(--shadow-md);
    font-size: var(--text-sm);
  }
  .conflict-notice button {
    display: grid;
    width: 30px;
    height: 30px;
    padding: 0;
    border: 0;
    border-radius: 8px;
    color: inherit;
    background: transparent;
    place-items: center;
  }
  .conflict-notice button:hover {
    background: rgba(220, 38, 38, 0.08);
  }
  .schedule-notice {
    position: fixed;
    z-index: 95;
    top: calc(var(--topbar-height) + 14px);
    right: 18px;
    display: grid;
    width: min(440px, calc(100vw - 36px));
    min-height: 48px;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    gap: 10px;
    padding: 10px 11px 10px 14px;
    border: 1px solid rgba(22, 163, 74, 0.28);
    border-radius: 11px;
    color: #166534;
    background: rgba(240, 253, 244, 0.98);
    box-shadow: var(--shadow-md);
    font-size: var(--text-sm);
  }
  .schedule-notice.warning {
    border-color: rgba(217, 119, 6, 0.3);
    color: #92400e;
    background: rgba(255, 251, 235, 0.98);
  }
  .schedule-notice button {
    display: grid;
    width: 30px;
    height: 30px;
    padding: 0;
    border: 0;
    border-radius: 8px;
    color: inherit;
    background: transparent;
    place-items: center;
  }
  .schedule-notice button:hover {
    background: rgba(15, 23, 42, 0.06);
  }
  @media (max-width: 920px) {
    .schedule-grid {
      --time-column-width: 104px;
      --day-column-min: 190px;
      --slot-height: 34px;
    }
  }
</style>
