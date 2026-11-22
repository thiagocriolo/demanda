<script lang="ts">
  import { onMount } from "svelte";
  import type { Component } from "svelte";
  import {
    ArrowRight,
    ArrowUpRight,
    BellRing,
    CalendarCheck2,
    CalendarDays,
    CalendarRange,
    Check,
    FolderKanban,
    HandCoins,
    Inbox,
    ListTodo,
    Plus,
    ReceiptText,
    Scale,
    Trash2,
    TriangleAlert,
    UsersRound,
    Wallet,
  } from "@lucide/svelte";
  import TabSystem from "$lib/ui/TabSystem.svelte";
  import {
    CronogramaApiError,
    loadCronogramaSnapshot,
    scheduleMapFromSnapshot,
  } from "$lib/cronograma/client";
  import { toScheduleSubtasks } from "$lib/cronograma/subtasks";
  import {
    createPersonalTask,
    deletePersonalTask,
    listPersonalTasks,
    updatePersonalTask,
    type PersonalTask,
  } from "$lib/personal-tasks/client";
  import type { ScheduleMap, ScheduleTask } from "$lib/cronograma/types";
  import type { EntityRecord } from "$lib/entities/types";
  import {
    financeEntriesFromSnapshot,
    loadFinancialSnapshot,
  } from "$lib/finance/client";
  import { formatMoney, type FinanceEntry } from "$lib/finance/finance";
  import { currentSettings } from "$lib/settings/client";
  import {
    acceptWorkspaceInvitation,
    GLOBAL_WORKSPACE_ID,
    loadActiveWorkspaceId,
    loadPendingWorkspaceInvitations,
    observeWorkspaces,
    PERSONAL_WORKSPACE_ID,
    type IncomingWorkspaceInvitation,
  } from "$lib/workspaces/workspace-storage";
  import {
    listAllActiveProjects,
    observeProjects,
    ProjectApiError,
    projectToEntityRecord,
  } from "$lib/projects/client";
  import {
    listAllTasks,
    observeTasks,
    TaskApiError,
    taskToEntityRecord,
  } from "$lib/tasks/client";

  type Tone = "danger" | "info" | "success" | "warning" | "neutral";
  type DashboardTab = "hoje" | "pendencias" | "operacao" | "entregas" | "carga";
  type Metric = {
    value: string;
    label: string;
    tone: Tone;
    icon: Component;
    href: string;
  };
  type TodaySignal = {
    title: string;
    description: string;
    tone: Tone;
    href: string;
  };
  type AttentionLevel = "urgent" | "warning" | "next";
  type AttentionCard = {
    level: AttentionLevel;
    label: string;
    title: string;
    client: string;
    tone: Tone;
    icon: Component;
    href: string;
  };
  const PERSONAL_TASK_TITLE_MAX_LENGTH = 80;
  const tabs: { id: DashboardTab; label: string }[] = [
    { id: "entregas", label: "Entregas" },
    { id: "operacao", label: "Operação" },
    { id: "carga", label: "Carga horária" },
    { id: "pendencias", label: "Pendências" },
  ];

  let projects = $state<EntityRecord[]>([]);
  let tasks = $state<EntityRecord[]>([]);
  let scheduleTasks = $state<ScheduleTask[]>([]);
  let schedule = $state<ScheduleMap>({});
  let financeEntries = $state<FinanceEntry[]>([]);
  let activeWorkspaceId = $state(PERSONAL_WORKSPACE_ID);
  let activeTab = $state<DashboardTab>("entregas");
  let personalTasks = $state<PersonalTask[]>([]);
  let personalTaskTitle = $state("");
  let projectsLoading = $state(false);
  let projectsError = $state("");
  let projectsRequest: AbortController | undefined;
  let tasksLoading = $state(false);
  let tasksError = $state("");
  let tasksRequest: AbortController | undefined;
  let pendingInvitations = $state<IncomingWorkspaceInvitation[]>([]);
  let acceptingInvitationId = $state("");
  let invitationMessage = $state("");

  const now = new Date();
  const today = localIso(now);
  const currentMonth = today.slice(0, 7);
  const [weekStart, weekEnd] = weekBounds(now);

  function localIso(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function weekBounds(date: Date): [string, string] {
    const start = new Date(date);
    const weekday = (start.getDay() + 6) % 7;
    start.setDate(start.getDate() - weekday);
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    return [localIso(start), localIso(end)];
  }

  function recordDate(record: EntityRecord, kind: "task" | "project"): string {
    const candidates =
      kind === "task"
        ? [
            record.dataEntrega,
            record.data_entrega,
            record.dueDate,
            record.due_date,
            record.data,
          ]
        : [record.dataFim, record.delivery_date, record.prazo];
    return (
      candidates.find((value) => /^\d{4}-\d{2}-\d{2}$/.test(value ?? "")) ?? ""
    );
  }

  function isComplete(record: EntityRecord): boolean {
    return ["conclusao", "concluido", "concluida", "entregue"].includes(
      (record.status ?? "").toLocaleLowerCase("pt-BR"),
    );
  }

  function isScheduleComplete(task: ScheduleTask): boolean {
    return ["conclusao", "concluido", "concluida", "entregue"].includes(
      (task.status ?? "").toLocaleLowerCase("pt-BR"),
    );
  }

  function inWorkspace(record: EntityRecord): boolean {
    if (activeWorkspaceId === GLOBAL_WORKSPACE_ID) return true;
    return (record.workspaceId ?? PERSONAL_WORKSPACE_ID) === activeWorkspaceId;
  }

  function scheduledIn(
    records: EntityRecord[],
    kind: "task" | "project",
    start: string,
    end = start,
  ): number {
    return records.filter((record) => {
      const date = recordDate(record, kind);
      return !isComplete(record) && date >= start && date <= end;
    }).length;
  }

  async function addPersonalTask(event: SubmitEvent): Promise<void> {
    event.preventDefault();
    const title = personalTaskTitle.trim();
    if (!title) return;
    const task = await createPersonalTask(title);
    personalTasks = [...personalTasks, task];
    personalTaskTitle = "";
  }

  async function togglePersonalTask(id: string): Promise<void> {
    const current = personalTasks.find((task) => task.id === id);
    if (!current) return;
    const updated = await updatePersonalTask(id, !current.done);
    personalTasks = personalTasks.map((task) =>
      task.id === id ? updated : task,
    );
  }

  async function removePersonalTask(id: string): Promise<void> {
    await deletePersonalTask(id);
    personalTasks = personalTasks.filter((task) => task.id !== id);
  }

  function isDashboardTab(value: string | null): value is DashboardTab {
    return tabs.some((tab) => tab.id === value);
  }

  function selectTab(tab: DashboardTab): void {
    activeTab = tab;
    const url = new URL(window.location.href);
    url.searchParams.set("dashboard_control", tab);
    window.history.replaceState({}, "", url);
  }

  function refreshLocalRecords(): void {
    scheduleTasks = toScheduleSubtasks(tasks);
  }

  function refreshPendingInvitations(): void {
    pendingInvitations = loadPendingWorkspaceInvitations();
  }

  async function acceptInvitation(
    invitation: IncomingWorkspaceInvitation,
  ): Promise<void> {
    acceptingInvitationId = invitation.id;
    invitationMessage = "";
    try {
      await acceptWorkspaceInvitation(invitation.id);
      invitationMessage = `Você agora faz parte de ${invitation.workspaceName}.`;
    } catch (cause) {
      invitationMessage =
        cause instanceof Error
          ? cause.message
          : "Não foi possível aceitar o convite.";
    } finally {
      acceptingInvitationId = "";
    }
  }

  async function reloadFinance(): Promise<void> {
    try {
      financeEntries = financeEntriesFromSnapshot(
        await loadFinancialSnapshot(),
      );
    } catch {
      financeEntries = [];
    }
  }

  async function reloadTasks(): Promise<void> {
    tasksRequest?.abort();
    const request = new AbortController();
    tasksRequest = request;
    tasksLoading = true;
    tasksError = "";
    try {
      const [apiTasks, cronograma] = await Promise.all([
        listAllTasks({ signal: request.signal }),
        loadCronogramaSnapshot(),
      ]);
      if (request.signal.aborted) return;
      tasks = apiTasks.map(taskToEntityRecord).filter(inWorkspace);
      schedule = scheduleMapFromSnapshot(cronograma);
      refreshLocalRecords();
    } catch (cause) {
      if (request.signal.aborted) return;
      tasks = [];
      schedule = {};
      tasksError =
        cause instanceof TaskApiError || cause instanceof CronogramaApiError
          ? cause.message
          : "Não foi possível carregar as tarefas e o Cronograma.";
      refreshLocalRecords();
    } finally {
      if (tasksRequest === request) tasksLoading = false;
    }
  }

  async function reloadProjects(): Promise<void> {
    projectsRequest?.abort();
    const request = new AbortController();
    projectsRequest = request;
    projectsLoading = true;
    projectsError = "";
    projects = [];

    try {
      const apiProjects = await listAllActiveProjects({
        signal: request.signal,
      });
      if (request.signal.aborted) return;
      projects = apiProjects.map(projectToEntityRecord);
    } catch (error) {
      if (request.signal.aborted) return;
      projectsError =
        error instanceof ProjectApiError
          ? error.message
          : "Não foi possível carregar os projetos.";
      projects = [];
    } finally {
      if (projectsRequest === request) {
        projectsLoading = false;
        projectsRequest = undefined;
      }
    }
  }

  onMount(() => {
    activeWorkspaceId = loadActiveWorkspaceId();
    refreshPendingInvitations();
    void listPersonalTasks()
      .then((items) => (personalTasks = items))
      .catch(() => undefined);
    const requestedTab = new URLSearchParams(window.location.search).get(
      "dashboard_control",
    );
    if (isDashboardTab(requestedTab)) activeTab = requestedTab;
    refreshLocalRecords();
    void reloadProjects();
    void reloadTasks();
    void reloadFinance();
    const stopTasks = observeTasks(() => void reloadTasks());
    const stopProjects = observeProjects(() => void reloadProjects());
    const stopWorkspaces = observeWorkspaces(() => {
      activeWorkspaceId = loadActiveWorkspaceId();
      refreshPendingInvitations();
      refreshLocalRecords();
      void reloadProjects();
      void reloadTasks();
      void reloadFinance();
    });
    return () => {
      projectsRequest?.abort();
      tasksRequest?.abort();
      stopTasks();
      stopProjects();
      stopWorkspaces();
    };
  });

  const openTasks = $derived(tasks.filter((task) => !isComplete(task)));
  const activeProjects = $derived(
    projects.filter((project) => !isComplete(project)),
  );
  const overdueTasks = $derived(
    openTasks.filter((task) => {
      const date = recordDate(task, "task");
      return date !== "" && date < today;
    }),
  );
  const overdueProjects = $derived(
    activeProjects.filter((project) => {
      const date = recordDate(project, "project");
      return date !== "" && date < today;
    }),
  );
  const scheduledThisWeek = $derived(
    scheduleTasks.flatMap((task) => {
      const entry = schedule[task.id];
      return entry && entry.date >= weekStart && entry.date <= weekEnd
        ? [{ task, entry }]
        : [];
    }),
  );
  const scheduledThisMonth = $derived(
    scheduleTasks.flatMap((task) => {
      const entry = schedule[task.id];
      return entry?.date.startsWith(currentMonth) ? [{ task, entry }] : [];
    }),
  );
  const scheduledTodayAll = $derived(
    scheduleTasks
      .flatMap((task) => {
        const entry = schedule[task.id];
        return entry?.date === today ? [{ task, entry }] : [];
      })
      .sort(
        (left, right) => left.entry.startMinutes - right.entry.startMinutes,
      ),
  );
  const scheduledToday = $derived(
    scheduledTodayAll.filter(({ task }) => !isScheduleComplete(task)),
  );
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const currentScheduledSubtask = $derived(
    scheduledToday.find(({ entry }) => {
      const end = entry.startMinutes + entry.durationSlots * 30;
      return entry.startMinutes <= nowMinutes && end > nowMinutes;
    }),
  );
  const nextScheduledSubtask = $derived(
    scheduledToday.find(({ entry }) => entry.startMinutes >= nowMinutes),
  );
  const todayFocus = $derived(currentScheduledSubtask ?? nextScheduledSubtask);
  const todayDueTasks = $derived(
    openTasks.filter((task) => recordDate(task, "task") === today),
  );
  const todayDueProjects = $derived(
    activeProjects.filter(
      (project) => recordDate(project, "project") === today,
    ),
  );
  const todayTasksWithoutExecution = $derived(
    todayDueTasks.filter(
      (task) =>
        !scheduledToday.some(
          ({ task: scheduled }) => scheduled.taskId === task.id,
        ),
    ),
  );
  const remainingWorkday = $derived.by(() => {
    const shifts = currentSettings().workdayShifts;
    const availableMinutes = shifts.reduce((total, shift) => {
      const [startHour, startMinute] = shift.start.split(":").map(Number);
      const [endHour, endMinute] = shift.end.split(":").map(Number);
      const start = startHour * 60 + startMinute;
      const end = endHour * 60 + endMinute;
      return total + Math.max(0, end - Math.max(start, nowMinutes));
    }, 0);
    const reservedMinutes = scheduledToday.reduce((total, { entry }) => {
      const end = entry.startMinutes + entry.durationSlots * 30;
      return (
        total + Math.max(0, end - Math.max(entry.startMinutes, nowMinutes))
      );
    }, 0);
    return {
      availableMinutes,
      reservedMinutes,
      freeMinutes: Math.max(0, availableMinutes - reservedMinutes),
    };
  });
  const todayScheduledMinutes = $derived(
    scheduledTodayAll.reduce(
      (total, { entry }) => total + entry.durationSlots * 30,
      0,
    ),
  );
  const completedTodayScheduledMinutes = $derived(
    scheduledTodayAll
      .filter(({ task }) => isScheduleComplete(task))
      .reduce((total, { entry }) => total + entry.durationSlots * 30, 0),
  );
  const remainingScheduledMinutes = $derived(
    Math.max(0, todayScheduledMinutes - completedTodayScheduledMinutes),
  );
  const dayProgress = $derived(
    todayScheduledMinutes > 0
      ? Math.round(
          (completedTodayScheduledMinutes / todayScheduledMinutes) * 100,
        )
      : 0,
  );
  const completedTodayTaskCount = $derived(
    scheduledTodayAll.filter(({ task }) => isScheduleComplete(task)).length,
  );
  const todayCapacityUsed = $derived(
    remainingWorkday.availableMinutes > 0
      ? Math.min(
          100,
          Math.round(
            (remainingWorkday.reservedMinutes /
              remainingWorkday.availableMinutes) *
              100,
          ),
        )
      : 0,
  );
  const todayDeliveries = $derived([
    ...todayDueTasks.map((task) => ({
      id: `task-${task.id}`,
      title: task.nome,
      kind: "Tarefa",
      href: "/pauta",
    })),
    ...todayDueProjects.map((project) => ({
      id: `project-${project.id}`,
      title: project.nome,
      kind: "Projeto",
      href: "/clientes/projetos",
    })),
  ]);
  const dashboardDateLabel = new Intl.DateTimeFormat("pt-BR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(now);
  const nextDelivery = $derived.by(() => {
    if (todayFocus) {
      return {
        label: `Próxima entrega às ${timeFromMinutes(todayFocus.entry.startMinutes)}`,
        title: todayFocus.task.nome,
        context: [todayFocus.task.taskNome, todayFocus.task.projeto]
          .filter(Boolean)
          .join(" · "),
        href: "/cronograma",
      };
    }
    const due = todayDeliveries[0];
    if (due) {
      return {
        label: "Entrega prevista para hoje",
        title: due.title,
        context: due.kind,
        href: due.href,
      };
    }
    return {
      label: "Sem entregas hoje",
      title: "",
      context: "",
      href: "/agenda",
    };
  });
  const todaySignals = $derived<TodaySignal[]>([
    ...(todayTasksWithoutExecution.length
      ? [
          {
            title: `${todayTasksWithoutExecution.length} ${todayTasksWithoutExecution.length === 1 ? "entrega sem execução" : "entregas sem execução"}`,
            description:
              "Tarefas com prazo hoje ainda não têm subtarefa reservada no Cronograma.",
            tone: "warning" as Tone,
            href: "/cronograma",
          },
        ]
      : []),
    ...(overdueTasks.length
      ? [
          {
            title: `${overdueTasks.length} ${overdueTasks.length === 1 ? "tarefa atrasada" : "tarefas atrasadas"}`,
            description:
              "Revise prioridade, prazo ou o próximo passo na Pauta.",
            tone: "danger" as Tone,
            href: "/pauta",
          },
        ]
      : []),
    ...(remainingWorkday.availableMinutes > 0 &&
    remainingWorkday.freeMinutes === 0
      ? [
          {
            title: "Sem capacidade livre hoje",
            description:
              "O tempo restante da sua jornada já está reservado no Cronograma.",
            tone: "info" as Tone,
            href: "/cronograma",
          },
        ]
      : []),
  ]);

  function formatDuration(minutes: number): string {
    if (minutes <= 0) return "0 min";
    const hours = Math.floor(minutes / 60);
    const remainder = minutes % 60;
    if (!hours) return `${remainder} min`;
    return remainder ? `${hours}h ${remainder}min` : `${hours}h`;
  }

  function timeFromMinutes(minutes: number): string {
    const hours = Math.floor(minutes / 60);
    const remainder = minutes % 60;
    return `${String(hours).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`;
  }

  const schedulePreview = $derived.by(() => {
    const currentSlotStart = Math.floor(nowMinutes / 30) * 30;
    return Array.from({ length: 5 }, (_, index) => {
      const startMinutes = currentSlotStart + (index - 2) * 30;
      const endMinutes = startMinutes + 30;
      const item = scheduledTodayAll.find(
        ({ entry }) =>
          startMinutes >= entry.startMinutes &&
          startMinutes < entry.startMinutes + entry.durationSlots * 30,
      );
      const complete = item ? isScheduleComplete(item.task) : false;
      const current = index === 2;
      const state = complete
        ? "done"
        : item
          ? current
            ? "current"
            : startMinutes < currentSlotStart
              ? "missed"
              : "planned"
          : "free";

      return {
        id: `${startMinutes}-${item?.task.id ?? "free"}`,
        time: `${timeFromMinutes((startMinutes + 1440) % 1440)}–${timeFromMinutes((endMinutes + 1440) % 1440)}`,
        current,
        state,
        title: item?.task.nome ?? "Livre",
        description: item
          ? [item.task.taskNome, item.task.projeto].filter(Boolean).join(" · ")
          : "",
      };
    });
  });

  const operationMetrics = $derived<Metric[]>([
    {
      value: String(
        scheduledThisWeek.filter(
          ({ task, entry }) =>
            entry.date === today && !isScheduleComplete(task),
        ).length,
      ),
      label: "tarefas do dia",
      tone: scheduledThisWeek.some(
        ({ task, entry }) => entry.date === today && !isScheduleComplete(task),
      )
        ? "warning"
        : "success",
      icon: CalendarCheck2,
      href: "/pauta",
    },
    {
      value: String(
        scheduledThisWeek.filter(({ task }) => !isScheduleComplete(task))
          .length,
      ),
      label: "tarefas da semana",
      tone: "info",
      icon: CalendarRange,
      href: "/pauta",
    },
    {
      value: String(
        scheduledThisMonth.filter(({ task }) => !isScheduleComplete(task))
          .length,
      ),
      label: "tarefas do mês",
      tone: "info",
      icon: CalendarDays,
      href: "/pauta",
    },
    {
      value: String(openTasks.length),
      label: "tarefas em aberto",
      tone: "info",
      icon: ListTodo,
      href: "/pauta",
    },
  ]);

  const deliveryMetrics = $derived<Metric[]>([
    {
      value: String(scheduledIn(projects, "project", today)),
      label: "projetos para hoje",
      tone: scheduledIn(projects, "project", today) > 0 ? "warning" : "success",
      icon: CalendarCheck2,
      href: "/clientes/projetos",
    },
    {
      value: String(scheduledIn(projects, "project", weekStart, weekEnd)),
      label: "projetos para a semana",
      tone:
        scheduledIn(projects, "project", weekStart, weekEnd) > 0
          ? "info"
          : "success",
      icon: CalendarRange,
      href: "/clientes/projetos",
    },
    {
      value: String(
        scheduledIn(
          projects,
          "project",
          `${currentMonth}-01`,
          `${currentMonth}-31`,
        ),
      ),
      label: "projetos para o mês",
      tone:
        scheduledIn(
          projects,
          "project",
          `${currentMonth}-01`,
          `${currentMonth}-31`,
        ) > 0
          ? "info"
          : "success",
      icon: CalendarDays,
      href: "/clientes/projetos",
    },
    {
      value: String(activeProjects.length),
      label: "projetos em aberto",
      tone: "info",
      icon: FolderKanban,
      href: "/clientes/projetos",
    },
  ]);

  function workdayColor(halfHourSteps: number): string {
    const stops = [
      [46, 86, 255],
      [65, 169, 105],
      [234, 179, 8],
      [220, 38, 38],
    ] as const;
    const position = Math.min(48, Math.max(0, halfHourSteps)) / 16;
    const start = stops[Math.min(2, Math.floor(position))]!;
    const end = stops[Math.min(3, Math.ceil(position))]!;
    const progress = position - Math.floor(position);
    const channels = start.map((channel, index) =>
      Math.round(channel + (end[index]! - channel) * progress),
    );
    return `rgb(${channels.join(" ")})`;
  }

  function workdayStyle(hours: number): string {
    const halfHourSteps = Math.min(48, Math.max(0, Math.round(hours * 2)));
    return `--workday-load: ${(halfHourSteps / 48) * 100}%; --workday-color: ${workdayColor(halfHourSteps)}`;
  }

  const weekDays = $derived(
    Array.from({ length: 7 }, (_, index) => {
      const date = new Date(`${weekStart}T12:00:00`);
      date.setDate(date.getDate() + index);
      const iso = localIso(date);
      const scheduled = scheduledThisWeek.filter(
        ({ entry }) => entry.date === iso,
      );
      const hours = scheduled.reduce(
        (sum, { entry }) => sum + entry.durationSlots * 0.5,
        0,
      );
      const tone: Tone =
        hours >= 7
          ? "danger"
          : hours >= 4
            ? "warning"
            : scheduled.length > 0
              ? "info"
              : "neutral";
      return {
        iso,
        label: `${new Intl.DateTimeFormat("pt-BR", { weekday: "short" })
          .format(date)
          .replace(".", "")} ${String(date.getDate()).padStart(2, "0")}`,
        count: scheduled.length,
        hours,
        today: iso === today,
        tone,
      };
    }),
  );
  const monthFinance = $derived(
    financeEntries.filter(
      (entry) => entry.date.startsWith(currentMonth) && !entry.paused,
    ),
  );
  const receivable = $derived(
    monthFinance
      .filter((entry) => entry.type === "receita" && !entry.settled)
      .reduce((sum, entry) => sum + entry.amount, 0),
  );
  const payable = $derived(
    monthFinance
      .filter((entry) => entry.type === "despesa" && !entry.settled)
      .reduce((sum, entry) => sum + entry.amount, 0),
  );
  const currentWallet = $derived(
    financeEntries
      .filter((entry) => entry.settled && !entry.paused)
      .reduce(
        (sum, entry) =>
          sum + (entry.type === "receita" ? entry.amount : -entry.amount),
        0,
      ),
  );
  const financeMetrics = $derived([
    {
      title: "Receitas a receber",
      value: formatMoney(receivable),
      tone: "success" as Tone,
      icon: HandCoins,
    },
    {
      title: "Despesas a pagar",
      value: formatMoney(payable),
      tone: "danger" as Tone,
      icon: ReceiptText,
    },
    {
      title: "Balanço previsto",
      value: formatMoney(receivable - payable),
      tone: "info" as Tone,
      icon: Scale,
    },
    {
      title: "Carteira atual",
      value: formatMoney(currentWallet),
      tone: "success" as Tone,
      icon: Wallet,
      solid: true,
    },
  ]);

  const attentionCards = $derived.by(() => {
    const levelDetails = (
      level: AttentionLevel,
    ): Pick<AttentionCard, "label" | "tone" | "icon"> => {
      if (level === "urgent") {
        return { label: "Urgente", tone: "danger", icon: TriangleAlert };
      }
      if (level === "warning") {
        return { label: "Aviso", tone: "warning", icon: BellRing };
      }
      return { label: "A seguir", tone: "info", icon: ArrowRight };
    };

    const cardFor = (
      record: EntityRecord,
      kind: "task" | "project",
      level: AttentionLevel,
    ): AttentionCard & { date: string } => ({
      ...levelDetails(level),
      level,
      title: record.nome,
      client:
        record.negocio || record.business_name || "Cliente não informado",
      date: recordDate(record, kind),
      href: kind === "task" ? "/pauta" : "/clientes/projetos",
    });

    const byDate = (left: { date: string }, right: { date: string }) =>
      left.date.localeCompare(right.date);
    const urgent = [
      ...overdueTasks.map((task) => cardFor(task, "task", "urgent")),
      ...overdueProjects.map((project) =>
        cardFor(project, "project", "urgent"),
      ),
    ].sort(byDate);
    const warning = [
      ...openTasks
        .filter((task) => {
          const date = recordDate(task, "task");
          return date >= today && date <= weekEnd;
        })
        .map((task) => cardFor(task, "task", "warning")),
      ...activeProjects
        .filter((project) => {
          const date = recordDate(project, "project");
          return date >= today && date <= weekEnd;
        })
        .map((project) => cardFor(project, "project", "warning")),
    ].sort(byDate);
    const next = [
      ...openTasks
        .filter((task) => recordDate(task, "task") > weekEnd)
        .map((task) => cardFor(task, "task", "next")),
      ...activeProjects
        .filter((project) => recordDate(project, "project") > weekEnd)
        .map((project) => cardFor(project, "project", "next")),
    ].sort(byDate);

    const cards = [...urgent, ...warning, ...next].slice(0, 3);
    if (cards.length) return cards;

    return (["urgent", "warning", "next"] as const).map((level) => ({
      ...levelDetails(level),
      level,
      title:
        level === "urgent"
          ? "Nenhuma demanda urgente"
          : level === "warning"
            ? "Nenhum aviso no período"
            : "Nada a seguir",
      client: "Tudo sob controle",
      href: "/pauta",
    }));
  });
</script>

<svelte:head><title>Dashboard · Demanda</title></svelte:head>

<section
  class="dashboard-page"
  aria-label="Dashboard"
  aria-busy={projectsLoading || tasksLoading}
>
  <section class="panel alerts-panel" aria-label="Resumo do dia">
    {#if projectsLoading}
      <p class="projects-state" role="status">Atualizando projetos…</p>
    {:else if projectsError}
      <div class="projects-state projects-state--error" role="alert">
        <span>{projectsError}</span>
        <button type="button" onclick={() => void reloadProjects()}>
          Tentar novamente
        </button>
      </div>
    {/if}
    {#if tasksError}
      <div class="projects-state projects-state--error" role="alert">
        <span>{tasksError}</span>
        <button type="button" onclick={() => void reloadTasks()}>
          Tentar novamente
        </button>
      </div>
    {/if}
    <div class="daily-summary" aria-labelledby="resumo-dia-title">
      <a class="daily-next-delivery" href={nextDelivery.href}>
        <span class="daily-date">{dashboardDateLabel}</span>
        <strong>{nextDelivery.label}</strong>
        <small>{nextDelivery.title}</small>
      </a>

      <section class="daily-progress" aria-labelledby="resumo-dia-title">
        <div class="daily-progress-head">
          <h3 id="resumo-dia-title">Conclusão do dia</h3>
          <strong>{dayProgress}%</strong>
        </div>
        <div
          class="daily-progress-track"
          role="progressbar"
          aria-label="Conclusão das horas reservadas hoje"
          aria-valuemin="0"
          aria-valuemax="100"
          aria-valuenow={dayProgress}
        >
          <span style={`width: ${dayProgress}%`}></span>
        </div>
      </section>

      <a class="daily-total" href="/cronograma">
        <span>Horas</span>
        <strong>{formatDuration(remainingScheduledMinutes)}</strong>
        <small>restantes</small>
      </a>

      <a class="daily-total" href="/pauta">
        <span>Tarefas</span>
        <strong>{scheduledToday.length}</strong>
        <small>restantes</small>
      </a>
    </div>
  </section>

  <section class="main-grid" aria-label="Área principal">
    <section class="panel personal-panel" aria-labelledby="tarefario-title">
      <div class="personal-head">
        <h3 id="tarefario-title">Tarefário Pessoal</h3>
      </div>

      <div class="notebook">
        <form class="personal-form" onsubmit={addPersonalTask}>
          <input
            bind:value={personalTaskTitle}
            maxlength={PERSONAL_TASK_TITLE_MAX_LENGTH}
            placeholder="Nova tarefa"
            aria-label="Título da tarefa"
          />
          <button type="submit" aria-label="Adicionar tarefa">
            <Plus size={16} strokeWidth={2.5} />
          </button>
        </form>

        <div class="notebook-list">
          {#if personalTasks.length > 0}
            <ul>
              {#each personalTasks as task (task.id)}
                <li class:done={task.done}>
                  <button
                    class="check-button"
                    type="button"
                    aria-label={task.done
                      ? "Reabrir tarefa"
                      : "Concluir tarefa"}
                    onclick={() => togglePersonalTask(task.id)}
                  >
                    {#if task.done}<Check size={13} strokeWidth={3} />{/if}
                  </button>
                  <span title={task.title}>{task.title}</span>
                  <button
                    class="delete-button"
                    type="button"
                    aria-label="Excluir tarefa"
                    onclick={() => removePersonalTask(task.id)}
                    ><Trash2 size={16} /></button
                  >
                </li>
              {/each}
            </ul>
          {/if}
        </div>
      </div>
    </section>

    <section class="panel today-panel" aria-labelledby="hoje-title">
      <div class="section-head">
        <div>
          <h3 id="hoje-title">Hoje</h3>
        </div>
        <a href="/cronograma">Abrir <ArrowUpRight size={15} /></a>
      </div>

      <ol class="schedule-preview" aria-label="Prévia do cronograma atual">
        {#each schedulePreview as slot (slot.id)}
          <li class:current={slot.current} class="schedule-slot {slot.state}">
            <span class="schedule-slot-time">{slot.time}</span>
            <span class="schedule-slot-marker" aria-hidden="true"></span>
            <a href="/cronograma">
              <strong>{slot.title}</strong>
              <small>{slot.description}</small>
            </a>
            {#if slot.current}<span class="schedule-slot-now">Agora</span>{/if}
          </li>
        {/each}
      </ol>
    </section>

    <TabSystem
      items={tabs}
      bind:value={activeTab}
      ariaLabel="Abas do dashboard"
      idPrefix="dashboard-control"
      class="dashboard-control-system"
      panelClass="dashboard-control-panel"
      minHeight="0px"
      mobileMinHeight="316px"
      onchange={(value) => selectTab(value as DashboardTab)}
    >
      {#if activeTab === "hoje"}
        <div class="today-dashboard">
          <section class="today-focus" aria-labelledby="today-focus-title">
            <div class="today-section-head">
              <span class="today-eyebrow">Cronograma</span>
              <a href="/cronograma">Abrir <ArrowUpRight size={14} /></a>
            </div>
            {#if todayFocus}
              <div class="today-focus-copy">
                <span class="today-focus-state">
                  {#if currentScheduledSubtask}
                    Em execução agora
                  {:else}
                    Próxima subtarefa
                  {/if}
                </span>
                <strong id="today-focus-title">{todayFocus.task.nome}</strong>
                <p>
                  {todayFocus.task.taskNome}
                  {#if todayFocus.task.projeto}
                    · {todayFocus.task.projeto}
                  {/if}
                </p>
              </div>
              <div class="today-focus-meta">
                <span>
                  {#if currentScheduledSubtask}
                    Até {timeFromMinutes(
                      todayFocus.entry.startMinutes +
                        todayFocus.entry.durationSlots * 30,
                    )}
                  {:else}
                    Às {timeFromMinutes(todayFocus.entry.startMinutes)}
                  {/if}
                </span>
                <span
                  >{formatDuration(todayFocus.entry.durationSlots * 30)}</span
                >
              </div>
            {:else}
              <div class="today-focus-copy today-focus-copy--empty">
                <span class="today-focus-state">Cronograma</span>
                <strong id="today-focus-title"
                  >Sem execução programada agora</strong
                >
                <p>
                  Reserve uma subtarefa para transformar uma demanda em ação.
                </p>
              </div>
              <a class="today-focus-action" href="/cronograma">
                Planejar execução <ArrowUpRight size={15} />
              </a>
            {/if}
          </section>

          <section
            class="today-summary"
            aria-label="Entregas e capacidade de hoje"
          >
            <a class="today-stat tone-warning" href="/agenda">
              <span>Entregas hoje</span>
              <strong>{todayDueTasks.length + todayDueProjects.length}</strong>
              <small
                >{todayDueTasks.length} tarefa{todayDueTasks.length === 1
                  ? ""
                  : "s"} e {todayDueProjects.length} projeto{todayDueProjects.length ===
                1
                  ? ""
                  : "s"}</small
              >
            </a>
            <a class="today-stat tone-info" href="/cronograma">
              <span>Capacidade livre</span>
              <strong>{formatDuration(remainingWorkday.freeMinutes)}</strong>
              <small
                >{formatDuration(remainingWorkday.reservedMinutes)} reservado no restante
                do dia</small
              >
            </a>
          </section>

          <section class="today-signals" aria-labelledby="today-signals-title">
            <div class="today-section-head">
              <div>
                <span class="today-eyebrow">Atenção</span>
                <h2 id="today-signals-title">Decisões para hoje</h2>
              </div>
              <a href="/pauta">Ver pauta <ArrowUpRight size={14} /></a>
            </div>
            {#if todaySignals.length}
              <div class="today-signal-list">
                {#each todaySignals as signal (signal.title)}
                  <a class="today-signal tone-{signal.tone}" href={signal.href}>
                    <span class="today-signal-dot" aria-hidden="true"></span>
                    <span>
                      <strong>{signal.title}</strong>
                      <small>{signal.description}</small>
                    </span>
                    <ArrowUpRight size={15} aria-hidden="true" />
                  </a>
                {/each}
              </div>
            {:else}
              <div class="today-all-clear">
                <Check size={16} aria-hidden="true" />
                <span>Não há riscos operacionais identificados para hoje.</span>
              </div>
            {/if}
          </section>

          <section class="today-route" aria-labelledby="today-route-title">
            <div class="today-section-head">
              <div>
                <span class="today-eyebrow">Roteiro</span>
                <h2 id="today-route-title">Execução prevista</h2>
              </div>
              <span class="today-route-summary"
                >{formatDuration(todayScheduledMinutes)} planejados</span
              >
            </div>
            {#if scheduledToday.length}
              <ol class="today-timeline">
                {#each scheduledToday as item (item.task.id)}
                  {@const end =
                    item.entry.startMinutes + item.entry.durationSlots * 30}
                  <li
                    class:current={currentScheduledSubtask?.task.id ===
                      item.task.id}
                    class:next={!currentScheduledSubtask &&
                      nextScheduledSubtask?.task.id === item.task.id}
                  >
                    <span class="today-timeline-time"
                      >{timeFromMinutes(item.entry.startMinutes)}</span
                    >
                    <a href="/cronograma">
                      <strong>{item.task.nome}</strong>
                      <span>
                        {item.task.taskNome}
                        {#if item.task.projeto}
                          · {item.task.projeto}{/if}
                      </span>
                    </a>
                    <span class="today-timeline-duration"
                      >{formatDuration(item.entry.durationSlots * 30)}
                      <small>até {timeFromMinutes(end)}</small></span
                    >
                  </li>
                {/each}
              </ol>
            {:else}
              <div class="today-route-empty">
                <span>Seu dia ainda não tem blocos reservados.</span>
                <a href="/cronograma"
                  >Montar roteiro <ArrowUpRight size={14} /></a
                >
              </div>
            {/if}
          </section>

          <section
            class="today-deliveries"
            aria-labelledby="today-deliveries-title"
          >
            <div class="today-section-head">
              <div>
                <span class="today-eyebrow">Compromissos</span>
                <h2 id="today-deliveries-title">Entregas do dia</h2>
              </div>
              <a href="/agenda">Ver agenda <ArrowUpRight size={14} /></a>
            </div>
            {#if todayDeliveries.length}
              <ul class="today-delivery-list">
                {#each todayDeliveries as delivery (delivery.id)}
                  <li>
                    <a href={delivery.href}>
                      <span>{delivery.kind}</span>
                      <strong>{delivery.title}</strong>
                      <ArrowUpRight size={14} aria-hidden="true" />
                    </a>
                  </li>
                {/each}
              </ul>
            {:else}
              <p class="today-deliveries-empty">
                Nenhuma tarefa ou projeto vence hoje. Use esse espaço para
                avançar o que vem a seguir.
              </p>
            {/if}
          </section>

          <section
            class="today-capacity"
            aria-labelledby="today-capacity-title"
          >
            <div class="today-section-head">
              <div>
                <span class="today-eyebrow">Disponibilidade</span>
                <h2 id="today-capacity-title">Capacidade restante</h2>
              </div>
              <strong>{todayCapacityUsed}%</strong>
            </div>
            <div
              class="today-capacity-track"
              role="progressbar"
              aria-label="Capacidade planejada da jornada"
              aria-valuemin="0"
              aria-valuemax="100"
              aria-valuenow={todayCapacityUsed}
            >
              <span style={`width: ${todayCapacityUsed}%`}></span>
            </div>
            <div class="today-capacity-notes">
              <span
                >{formatDuration(remainingWorkday.reservedMinutes)} reservados</span
              >
              <span>{formatDuration(remainingWorkday.freeMinutes)} livres</span>
            </div>
            <a class="today-capacity-action" href="/cronograma"
              >Ajustar capacidade <ArrowUpRight size={14} /></a
            >
          </section>

          <nav class="today-actions" aria-label="Ações de planejamento">
            <a href="/cronograma"><CalendarCheck2 size={16} />Cronograma</a>
            <a href="/agenda"><CalendarDays size={16} />Agenda</a>
            <a href="/pauta"><ListTodo size={16} />Pauta</a>
          </nav>
        </div>
      {:else if activeTab === "operacao" || activeTab === "entregas"}
        {@const visibleMetrics =
          activeTab === "operacao" ? operationMetrics : deliveryMetrics}
        <div class="control-metrics">
          {#each visibleMetrics as metric, index (metric.label)}
            {@const MetricIcon = metric.icon}
            <a
              class:featured={index === 0}
              class:operation-featured={activeTab === "operacao" && index === 0}
              class:delivery-featured={activeTab === "entregas" && index === 0}
              class:secondary-control={index > 0}
              class="control-card tone-{metric.tone}"
              href={metric.href}
            >
              <span class="control-icon"
                ><MetricIcon size={21} strokeWidth={1.9} /></span
              >
              <span class="control-copy">
                <strong>{metric.value}</strong>
                <span>{metric.label}</span>
              </span>
            </a>
          {/each}
        </div>
      {:else if activeTab === "carga"}
        <div class="workload">
          <div class="week-grid">
            {#each weekDays as day (day.iso)}
              <a
                class:today={day.today}
                class="workday tone-{day.tone}"
                href="/cronograma"
                style={workdayStyle(day.hours)}
              >
                <span class="workday-top">
                  <span>{day.label}</span>
                  {#if day.today}<i aria-label="Hoje"></i>{/if}
                </span>
                <strong
                  >{new Intl.NumberFormat("pt-BR", {
                    maximumFractionDigits: 1,
                  }).format(day.hours)}h</strong
                >
                <span class="workday-bar" aria-hidden="true"
                  >{#if day.hours >= 0.5}<i></i>{/if}</span
                >
              </a>
            {/each}
          </div>
        </div>
      {:else}
        {#if invitationMessage}
          <p class="invitation-message" role="status">{invitationMessage}</p>
        {/if}
        {#if pendingInvitations.length === 0}
          <div class="pending-empty">
            <span><Inbox size={22} /></span>
            <strong>Nenhuma pendência</strong>
            <p>Convites para colaborar em workspaces aparecem aqui.</p>
          </div>
        {:else}
          <div class="invitation-list">
            {#each pendingInvitations as invitation (invitation.id)}
              <article class="invitation-card">
                <span class="invitation-icon"><UsersRound size={20} /></span>
                <div class="invitation-copy">
                  <small>Convite de workspace</small>
                  <strong>{invitation.workspaceName}</strong>
                  <p>
                    {invitation.invitedBy.name} convidou você como
                    {invitation.role === "admin"
                      ? " administrador"
                      : " membro"}.
                  </p>
                </div>
                <button
                  type="button"
                  disabled={acceptingInvitationId !== ""}
                  onclick={() => acceptInvitation(invitation)}
                >
                  <Check size={15} />
                  {acceptingInvitationId === invitation.id
                    ? "Aceitando…"
                    : "Aceitar"}
                </button>
              </article>
            {/each}
          </div>
        {/if}
      {/if}
    </TabSystem>
  </section>

  <section class="lower-grid" aria-label="Prioridades e finanças">
    <section class="panel attention-panel" aria-labelledby="atencao-title">
      <div class="section-head">
        <div>
          <h3 id="atencao-title">Atenção</h3>
        </div>
        <a href="/pauta">Ver pauta <ArrowUpRight size={15} /></a>
      </div>
      <div class="attention-cards">
        {#each attentionCards as card, index (`${card.title}-${index}`)}
          {@const AttentionIcon = card.icon}
          <a class="attention-card tone-{card.tone}" href={card.href}>
            <span class="attention-card-head">
              <span class="attention-card-icon"
                ><AttentionIcon size={17} strokeWidth={2} /></span
              >
              <span>{card.label}</span>
            </span>
            <span class="attention-card-body">
              <strong>{card.title}</strong>
              <small>{card.client}</small>
            </span>
          </a>
        {/each}
      </div>
    </section>

    <section class="panel finance-panel" aria-labelledby="financas-title">
      <div class="section-head">
        <h3 id="financas-title">Finanças</h3>
        <a href="/financeiro?tab=painel">Abrir <ArrowUpRight size={15} /></a>
      </div>
      <div class="finance-grid">
        {#each financeMetrics as metric (metric.title)}
          {@const MetricIcon = metric.icon}
          <a
            class:solid={metric.solid}
            class="finance-metric tone-{metric.tone}"
            href="/financeiro?tab=painel"
          >
            <span class="finance-card-head">
              <span class="finance-icon"
                ><MetricIcon size={18} strokeWidth={1.9} /></span
              >
              <span class="finance-copy"><span>{metric.title}</span></span>
            </span>
            <span class="finance-card-value">
              <strong>{metric.value}</strong>
            </span>
          </a>
        {/each}
      </div>
    </section>
  </section>
</section>

<style>
  .dashboard-page {
    --dash-gap: 12px;
    --dashboard-panel-padding: 16px;
    --dashboard-section-gap: 12px;
    --dashboard-type-display: 600 32px/1 var(--font-sans);
    --dashboard-type-section: 600 20px/1.15 var(--font-sans);
    --dashboard-type-component: 600 16px/1.2 var(--font-sans);
    --dashboard-type-metric: 600 18px/1.1 var(--font-sans);
    --dashboard-type-ui: 600 12px/1.2 var(--font-sans);
    --dashboard-type-body: 400 12px/1.4 var(--font-sans);
    --dashboard-type-meta: 500 11px/1.25 var(--font-sans);
    --dashboard-type-eyebrow: 600 10px/1.1 var(--font-sans);
    width: 100%;
    min-width: 0;
    min-height: calc(100dvh - var(--topbar-height) - (var(--main-padding) * 2));
    display: grid;
    grid-template-rows: auto minmax(0, 1fr);
    gap: var(--dash-gap);
    color: var(--ink-950);
  }

  .panel {
    min-width: 0;
    overflow: hidden;
    border: 1px solid rgba(15, 23, 42, 0.12);
    border-radius: 14px;
    background: color-mix(in srgb, #ffffff 94%, rgba(15, 23, 42, 0.03));
  }

  h3 {
    color: #081631;
    font-size: 20px;
    font-weight: 600;
    line-height: 1.1;
  }

  .alerts-panel {
    position: relative;
    padding: 14px 20px;
    border-color: rgba(46, 86, 255, 0.22);
    background: linear-gradient(
      135deg,
      #ffffff 0%,
      rgba(255, 255, 255, 0.91) 100%
    );
  }

  .projects-state {
    position: absolute;
    top: 20px;
    right: 20px;
    display: flex;
    max-width: min(55%, 440px);
    align-items: center;
    gap: 8px;
    margin: 0;
    color: var(--ink-500);
    font-size: var(--text-xs);
  }

  .projects-state--error {
    color: var(--danger);
  }

  .projects-state button {
    min-height: 0;
    padding: 2px 7px;
    border: 1px solid currentColor;
    border-radius: var(--radius-pill);
    color: inherit;
    background: transparent;
    font: inherit;
    white-space: nowrap;
  }

  .daily-summary {
    min-width: 0;
    display: grid;
    grid-template-columns:
      minmax(190px, 1.05fr) minmax(280px, 1.45fr) minmax(150px, 0.58fr)
      minmax(150px, 0.58fr);
    align-items: center;
  }

  .daily-summary > * {
    min-width: 0;
    min-height: 58px;
    padding: 4px 20px;
  }

  .daily-summary > * + * {
    border-left: 1px solid rgba(15, 23, 42, 0.16);
  }

  .daily-next-delivery {
    display: grid;
    align-content: center;
    gap: 3px;
  }

  .daily-date {
    color: #64748b;
    font-size: 11px;
    font-weight: 700;
    text-transform: capitalize;
  }

  .daily-next-delivery strong {
    overflow: hidden;
    color: #081631;
    font-size: 15px;
    font-weight: 700;
    line-height: 1.15;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .daily-next-delivery small {
    overflow: hidden;
    color: #64748b;
    font-size: 11px;
    font-weight: 600;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .daily-next-delivery small:empty {
    display: none;
  }

  .daily-progress {
    display: grid;
    align-content: center;
    gap: 8px;
  }

  .daily-progress-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }

  .daily-progress h3 {
    font-size: 16px;
  }

  .daily-progress-head > strong {
    color: #081631;
    font-size: 16px;
  }

  .daily-progress-track {
    width: 100%;
    height: 12px;
    overflow: hidden;
    border-radius: 999px;
    background: #dfe5ff;
  }

  .daily-progress-track > span {
    display: block;
    height: 100%;
    border-radius: inherit;
    background: linear-gradient(90deg, #153bf3, #2e56ff);
    transition: width var(--motion-fast) ease;
  }

  .daily-total {
    display: grid;
    align-content: center;
    gap: 3px;
  }

  .daily-total > span {
    color: #64748b;
    font-size: 10px;
    font-weight: 800;
    letter-spacing: 0.07em;
    text-transform: uppercase;
  }

  .daily-total strong {
    overflow: hidden;
    color: #081631;
    font-size: 18px;
    font-weight: 700;
    line-height: 1.15;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .daily-total small {
    overflow: hidden;
    color: #64748b;
    font-size: 10px;
    font-weight: 600;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .alert-grid {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 10px;
    margin-top: 14px;
  }

  .alert-metric {
    --tone: #2e56ff;
    --tone-ink: #2047e7;
    --tone-bg: rgba(46, 86, 255, 0.08);
    --tone-border: rgba(46, 86, 255, 0.22);
    min-width: 0;
    min-height: 66px;
    padding: 10px;
    display: grid;
    grid-template-columns: 34px minmax(0, 1fr);
    align-items: center;
    gap: 10px;
    border: 1px solid
      color-mix(in srgb, var(--tone-border) 72%, rgba(15, 23, 42, 0.12));
    border-radius: 12px;
    background: linear-gradient(
      180deg,
      color-mix(in srgb, #ffffff 92%, var(--tone-bg)),
      #ffffff
    );
    transition:
      border-color var(--motion-fast) ease,
      transform var(--motion-fast) ease;
  }

  .alert-metric:hover {
    border-color: color-mix(in srgb, var(--tone) 45%, transparent);
    transform: translateY(-1px);
  }

  .tone-danger {
    --tone: #dc2626;
    --tone-ink: #a11b1b;
    --tone-bg: rgba(220, 38, 38, 0.12);
    --tone-border: rgba(220, 38, 38, 0.24);
  }

  .tone-warning {
    --tone: #eab308;
    --tone-ink: #8a5a12;
    --tone-bg: rgba(234, 179, 8, 0.14);
    --tone-border: rgba(234, 179, 8, 0.26);
  }

  .tone-info {
    --tone: #2e56ff;
    --tone-ink: #2947c9;
    --tone-bg: rgba(46, 86, 255, 0.1);
    --tone-border: rgba(46, 86, 255, 0.22);
  }

  .tone-success {
    --tone: #5dac83;
    --tone-ink: #216642;
    --tone-bg: rgba(93, 172, 131, 0.13);
    --tone-border: rgba(93, 172, 131, 0.24);
  }

  .tone-neutral {
    --tone: #64748b;
    --tone-ink: #475569;
    --tone-bg: rgba(148, 163, 184, 0.16);
    --tone-border: rgba(148, 163, 184, 0.24);
  }

  .payment-metric {
    --tone: #0f9f7a;
    --tone-ink: #0f6f57;
    --tone-bg: rgba(15, 159, 122, 0.1);
    --tone-border: rgba(15, 159, 122, 0.24);
  }

  .metric-icon {
    width: 34px;
    height: 34px;
    display: grid;
    place-items: center;
    border: 1px solid var(--tone-border);
    border-radius: 9px;
    color: var(--tone-ink);
    background: var(--tone-bg);
  }

  .metric-copy {
    min-width: 0;
    display: grid;
    gap: 2px;
    line-height: 1.05;
  }

  .metric-copy strong {
    color: #081631;
    font-size: 18px;
    font-weight: 650;
  }

  .metric-copy span {
    color: #081631;
    font-size: 12px;
    font-weight: 500;
  }

  .main-grid {
    min-width: 0;
    min-height: 0;
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: var(--dash-gap);
  }

  .today-panel {
    order: 1;
    min-height: 0;
    padding: var(--dashboard-panel-padding);
    display: grid;
    grid-template-rows: auto minmax(0, 1fr);
    gap: 0;
    background: linear-gradient(145deg, #f4f7ff 0%, #ffffff 55%, #f4fbf7 100%);
  }

  .schedule-preview {
    position: relative;
    min-width: 0;
    margin: 0;
    padding: 0;
    display: grid;
    grid-template-rows: repeat(5, minmax(0, 1fr));
    gap: 0;
    list-style: none;
  }

  .schedule-preview::before {
    position: absolute;
    top: 18px;
    bottom: 18px;
    left: 97px;
    width: 1px;
    background: #e2e8f0;
    content: "";
  }

  .schedule-slot {
    --slot-color: #94a3b8;
    min-width: 0;
    min-height: 0;
    padding: 8px;
    display: grid;
    grid-template-columns: 78px 9px minmax(0, 1fr) auto;
    align-items: center;
    gap: 8px;
    position: relative;
    border: 1px solid transparent;
    border-radius: 8px;
    color: #64748b;
  }

  .schedule-slot-time {
    color: #64748b;
    font-size: 10px;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
  }

  .schedule-slot-marker {
    position: relative;
    z-index: 1;
    width: 8px;
    height: 8px;
    border: 2px solid var(--slot-color);
    border-radius: 50%;
    background: #fff;
  }

  .schedule-slot:not(.current) {
    border-bottom-color: rgba(148, 163, 184, 0.18);
    border-radius: 0;
  }

  .schedule-slot:last-child:not(.current) {
    border-bottom-color: transparent;
  }

  .schedule-slot a {
    min-width: 0;
    display: grid;
    gap: 1px;
  }

  .schedule-slot a strong,
  .schedule-slot a small {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .schedule-slot a strong {
    color: #334155;
    font-size: 11px;
    line-height: 1.15;
  }

  .schedule-slot a small {
    color: #94a3b8;
    font-size: 10px;
  }

  .schedule-slot a small:empty {
    display: none;
  }

  .schedule-slot.done {
    --slot-color: #4e9d74;
    background: rgba(93, 172, 131, 0.07);
  }

  .schedule-slot.done .schedule-slot-marker {
    background: var(--slot-color);
    box-shadow: inset 0 0 0 2px #fff;
  }

  .schedule-slot.planned {
    --slot-color: #2e56ff;
    background: rgba(46, 86, 255, 0.04);
  }

  .schedule-slot.missed {
    --slot-color: #e08a29;
    background: rgba(234, 179, 8, 0.06);
  }

  .schedule-slot.current {
    --slot-color: #244cff;
    border: 0;
    border-radius: 0;
    background: linear-gradient(
      90deg,
      transparent 0%,
      rgba(233, 239, 255, 0.82) 14%,
      #f7f9ff 50%,
      rgba(233, 239, 255, 0.82) 86%,
      transparent 100%
    );
    box-shadow: none;
  }

  .schedule-slot.current::before,
  .schedule-slot.current::after {
    position: absolute;
    right: 0;
    left: 0;
    height: 1px;
    background: linear-gradient(
      90deg,
      transparent,
      rgba(46, 86, 255, 0.32) 14%,
      rgba(46, 86, 255, 0.32) 86%,
      transparent
    );
    content: "";
    pointer-events: none;
  }

  .schedule-slot.current::before {
    top: 0;
  }

  .schedule-slot.current::after {
    bottom: 0;
  }

  .schedule-slot.current .schedule-slot-marker {
    background: var(--slot-color);
    box-shadow: 0 0 0 4px rgba(46, 86, 255, 0.12);
  }

  .schedule-slot.current a strong {
    color: #10245a;
  }

  .schedule-slot-now {
    padding: 3px 6px;
    border-radius: 999px;
    color: #2047e7;
    background: rgba(46, 86, 255, 0.1);
    font-size: 9px;
    font-weight: 800;
    text-transform: uppercase;
  }

  .personal-panel {
    order: 3;
    min-height: 0;
    padding: 0;
    display: grid;
    grid-template-rows: auto minmax(0, 1fr);
  }

  .personal-head {
    padding: var(--dashboard-panel-padding);
    border-bottom: 1px solid rgba(15, 23, 42, 0.13);
  }

  .personal-form {
    position: sticky;
    top: 0;
    z-index: 1;
    display: grid;
    grid-template-columns: 44px minmax(0, 1fr) 30px;
    gap: 6px;
    align-items: center;
    padding: 5px 10px 5px 0;
  }

  .personal-form input {
    grid-column: 2;
    width: 100%;
    min-width: 0;
    min-height: 24px;
    padding: 2px 0;
    border: 0;
    border-radius: 0;
    color: #0f172a;
    background: transparent;
    font-size: 12px;
  }

  .personal-form input:focus {
    outline: 0;
    box-shadow: none;
  }

  .personal-form button {
    grid-column: 3;
    width: 30px;
    height: 30px;
    padding: 0;
    display: grid;
    place-items: center;
    border: 1px solid #2e56ff;
    border-radius: 6px;
    color: #fff;
    background: #2e56ff;
  }

  .notebook {
    min-height: 0;
    height: 100%;
    padding: 0;
    overflow-y: auto;
    overscroll-behavior: contain;
    scrollbar-gutter: stable;
    background:
      linear-gradient(
        90deg,
        transparent 0 43px,
        rgba(46, 86, 255, 0.1) 44px,
        transparent 45px
      ),
      repeating-linear-gradient(
        180deg,
        #fff 0 39px,
        rgba(15, 23, 42, 0.08) 40px
      );
  }

  .notebook-list {
    min-height: calc(100% - 40px);
  }

  .notebook ul {
    display: grid;
    grid-auto-rows: 40px;
  }

  .notebook li {
    min-width: 0;
    height: 40px;
    padding-right: 10px;
    display: grid;
    grid-template-columns: 44px minmax(0, 1fr) 30px;
    align-items: center;
    gap: 6px;
    background: transparent;
  }

  .notebook li > span {
    min-width: 0;
    overflow: hidden;
    color: #17233b;
    font-size: 12px;
    font-weight: 500;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .notebook li.done > span {
    color: #94a3b8;
    text-decoration: line-through;
  }

  .check-button {
    width: 18px;
    height: 18px;
    margin-inline: auto;
    padding: 0;
    display: grid;
    place-items: center;
    border: 1px solid rgba(15, 23, 42, 0.25);
    border-radius: 6px;
    color: #fff;
    background: #fff;
  }

  li.done .check-button {
    border-color: #5dac83;
    background: #5dac83;
  }

  .delete-button {
    width: 30px;
    height: 30px;
    padding: 0;
    display: grid;
    place-items: center;
    border: 0;
    border-radius: 8px;
    color: #94a3b8;
    background: transparent;
  }

  .delete-button:hover {
    color: #dc2626;
    background: rgba(220, 38, 38, 0.08);
  }

  :global(.dashboard-control-system) {
    order: 2;
    min-width: 0;
    min-height: 0;
    height: 100%;
  }

  :global(.dashboard-control-system .tab-list) {
    gap: 4px;
    margin-top: -10px;
    padding: 10px 14px 0;
  }

  :global(.dashboard-control-system .tab-button) {
    min-height: 36px;
    padding: 7px 10px;
    border-radius: 10px 10px 0 0;
    font-size: 12px;
    font-weight: 650;
  }

  :global(.dashboard-control-system .tab-button--inactive) {
    border-color: #dce2eb;
    color: #64748b;
    background: #f3f5f8;
    box-shadow: 1px 0 3px rgba(15, 23, 42, 0.07);
  }

  :global(.dashboard-control-system .tab-button--inactive:hover) {
    color: #334155;
    background: #edf1f6;
  }

  :global(.dashboard-control-system .tab-button--active) {
    color: #10245a;
    background: #fff;
    box-shadow: 0 -1px 5px rgba(15, 23, 42, 0.06);
    font-weight: 750;
  }

  :global(
    .dashboard-control-system
      .tab-list.overlapping
      .tab-button--active:not(:first-child)
  ),
  :global(
    .dashboard-control-system .tab-list.overlapping .tab-button--active + .tab-button
  ) {
    margin-left: calc(-1 * var(--tab-overlap));
  }

  :global(.dashboard-control-panel) {
    flex: 1;
    min-height: 0;
    padding: 16px;
    overflow-y: auto;
    overscroll-behavior: contain;
    scroll-padding: 16px;
    background:
      linear-gradient(
        to bottom,
        #ffffff 0,
        #ffffff 1px,
        rgba(255, 255, 255, 0.92) 10px,
        rgba(255, 255, 255, 0) 38px
      ),
      linear-gradient(
        135deg,
        color-mix(in srgb, #ffffff 88%, rgba(46, 86, 255, 0.1)) 0%,
        #ffffff 48%,
        color-mix(in srgb, #ffffff 90%, rgba(93, 172, 131, 0.16)) 100%
      );
    box-shadow: 0 12px 28px rgba(46, 86, 255, 0.05);
  }

  .today-dashboard {
    min-height: 574px;
    display: grid;
    grid-template-columns: minmax(0, 1.2fr) minmax(190px, 0.8fr);
    grid-template-areas:
      "focus summary"
      "signals signals"
      "route route"
      "deliveries capacity"
      "actions actions";
    align-content: start;
    gap: 10px;
  }

  .today-focus,
  .today-summary,
  .today-signals,
  .today-route,
  .today-deliveries,
  .today-capacity,
  .today-actions {
    min-width: 0;
  }

  .today-focus {
    grid-area: focus;
    min-height: 128px;
    padding: 14px;
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    grid-template-rows: auto 1fr auto;
    gap: 9px;
    border: 1px solid rgba(46, 86, 255, 0.28);
    border-radius: 12px;
    background: linear-gradient(135deg, #edf2ff, #ffffff 68%);
  }

  .today-section-head {
    min-width: 0;
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 10px;
  }

  .today-section-head a,
  .today-focus-action {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    flex: none;
    color: #2047e7;
    font-size: 11px;
    font-weight: 700;
  }

  .today-eyebrow,
  .today-focus-state {
    display: block;
    color: #4861bb;
    font-size: 10px;
    font-weight: 800;
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }

  .today-focus-copy {
    min-width: 0;
    align-self: center;
    grid-column: 1 / -1;
  }

  .today-focus-copy strong {
    display: block;
    margin-top: 4px;
    overflow: hidden;
    color: #081631;
    font-size: 18px;
    font-weight: 700;
    line-height: 1.16;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .today-focus-copy p {
    margin-top: 4px;
    overflow: hidden;
    color: #475569;
    font-size: 12px;
    line-height: 1.3;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .today-focus-copy--empty p {
    max-width: 380px;
    overflow: visible;
    text-overflow: clip;
    white-space: normal;
  }

  .today-focus-meta {
    display: flex;
    grid-column: 1 / -1;
    align-items: center;
    gap: 7px;
    color: #3554ad;
    font-size: 11px;
    font-weight: 700;
  }

  .today-focus-meta span {
    padding: 4px 7px;
    border: 1px solid rgba(46, 86, 255, 0.16);
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.62);
  }

  .today-focus-action {
    grid-column: 1 / -1;
  }

  .today-summary {
    grid-area: summary;
    display: grid;
    gap: 10px;
  }

  .today-stat {
    --tone: #2e56ff;
    --tone-ink: #2047e7;
    --tone-bg: rgba(46, 86, 255, 0.08);
    --tone-border: rgba(46, 86, 255, 0.22);
    min-width: 0;
    padding: 12px;
    display: grid;
    gap: 3px;
    border: 1px solid var(--tone-border);
    border-radius: 12px;
    background: color-mix(in srgb, var(--tone-bg) 56%, #fff);
  }

  .today-stat > span {
    color: var(--tone-ink);
    font-size: 11px;
    font-weight: 700;
  }

  .today-stat strong {
    overflow: hidden;
    color: #081631;
    font-size: 22px;
    font-weight: 700;
    line-height: 1.08;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .today-stat small {
    color: #64748b;
    font-size: 10px;
    line-height: 1.3;
  }

  .today-signals {
    grid-area: signals;
    grid-column: 1 / -1;
    min-height: 0;
    padding: 12px;
    border: 1px solid rgba(15, 23, 42, 0.1);
    border-radius: 12px;
    background: rgba(255, 255, 255, 0.76);
  }

  .today-signals h2 {
    margin: 2px 0 0;
    color: #17233b;
    font-size: 14px;
    line-height: 1.15;
  }

  .today-signal-list {
    display: grid;
    gap: 6px;
    margin-top: 9px;
  }

  .today-signal {
    --tone: #2e56ff;
    --tone-ink: #2047e7;
    --tone-bg: rgba(46, 86, 255, 0.08);
    --tone-border: rgba(46, 86, 255, 0.22);
    min-width: 0;
    padding: 8px 9px;
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: center;
    gap: 8px;
    border: 1px solid var(--tone-border);
    border-radius: 9px;
    color: var(--tone-ink);
    background: color-mix(in srgb, var(--tone-bg) 54%, #fff);
  }

  .today-signal-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--tone);
  }

  .today-signal > span:nth-child(2) {
    min-width: 0;
  }

  .today-signal strong,
  .today-signal small {
    display: block;
  }

  .today-signal strong {
    overflow: hidden;
    color: #17233b;
    font-size: 11px;
    line-height: 1.25;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .today-signal small {
    margin-top: 2px;
    overflow: hidden;
    color: #64748b;
    font-size: 10px;
    line-height: 1.25;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .today-all-clear {
    display: flex;
    align-items: center;
    gap: 7px;
    margin-top: 10px;
    padding: 9px;
    border-radius: 8px;
    color: #216642;
    background: rgba(93, 172, 131, 0.1);
    font-size: 11px;
    font-weight: 650;
  }

  .today-route,
  .today-deliveries,
  .today-capacity {
    min-width: 0;
    padding: 14px;
    border: 1px solid rgba(15, 23, 42, 0.1);
    border-radius: 12px;
    background: rgba(255, 255, 255, 0.82);
  }

  .today-route {
    grid-area: route;
  }

  .today-route h2,
  .today-deliveries h2,
  .today-capacity h2 {
    margin: 2px 0 0;
    color: #17233b;
    font-size: 14px;
    line-height: 1.15;
  }

  .today-route-summary {
    padding: 4px 7px;
    border: 1px solid rgba(46, 86, 255, 0.17);
    border-radius: 999px;
    color: #3554ad;
    background: rgba(46, 86, 255, 0.06);
    font-size: 10px;
    font-weight: 750;
    white-space: nowrap;
  }

  .today-timeline {
    display: grid;
    gap: 7px;
    margin-top: 12px;
  }

  .today-timeline li {
    position: relative;
    min-width: 0;
    display: grid;
    grid-template-columns: 43px minmax(0, 1fr) auto;
    align-items: center;
    gap: 10px;
    padding: 9px 0;
    border-top: 1px solid rgba(15, 23, 42, 0.07);
  }

  .today-timeline li:first-child {
    border-top: 0;
  }

  .today-timeline li.current::before,
  .today-timeline li.next::before {
    position: absolute;
    top: 50%;
    left: -14px;
    width: 3px;
    height: 30px;
    border-radius: 0 4px 4px 0;
    background: #2e56ff;
    content: "";
    transform: translateY(-50%);
  }

  .today-timeline li.next::before {
    background: #eab308;
  }

  .today-timeline-time {
    color: #4861bb;
    font-size: 11px;
    font-weight: 800;
  }

  .today-timeline a {
    min-width: 0;
  }

  .today-timeline a strong,
  .today-timeline a span {
    display: block;
  }

  .today-timeline a strong {
    overflow: hidden;
    color: #17233b;
    font-size: 12px;
    line-height: 1.25;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .today-timeline a span {
    margin-top: 2px;
    overflow: hidden;
    color: #64748b;
    font-size: 10px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .today-timeline-duration {
    display: grid;
    justify-items: end;
    gap: 2px;
    color: #334155;
    font-size: 10px;
    font-weight: 700;
    white-space: nowrap;
  }

  .today-timeline-duration small {
    color: #94a3b8;
    font-size: 9px;
    font-weight: 600;
  }

  .today-route-empty {
    min-height: 62px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    margin-top: 12px;
    padding: 10px;
    border-radius: 9px;
    color: #64748b;
    background: rgba(46, 86, 255, 0.045);
    font-size: 11px;
  }

  .today-route-empty a,
  .today-capacity-action {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    flex: none;
    color: #2047e7;
    font-size: 11px;
    font-weight: 750;
  }

  .today-deliveries {
    grid-area: deliveries;
  }

  .today-delivery-list {
    display: grid;
    gap: 7px;
    margin-top: 12px;
  }

  .today-delivery-list a {
    min-width: 0;
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: center;
    gap: 8px;
    padding: 8px;
    border: 1px solid rgba(234, 179, 8, 0.25);
    border-radius: 9px;
    background: rgba(254, 249, 195, 0.32);
  }

  .today-delivery-list a > span {
    padding: 3px 5px;
    border-radius: 5px;
    color: #8a5a12;
    background: rgba(234, 179, 8, 0.12);
    font-size: 9px;
    font-weight: 750;
  }

  .today-delivery-list strong {
    min-width: 0;
    overflow: hidden;
    color: #17233b;
    font-size: 11px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .today-deliveries-empty {
    margin-top: 12px;
    color: #64748b;
    font-size: 11px;
    line-height: 1.45;
  }

  .today-capacity {
    grid-area: capacity;
    background: linear-gradient(135deg, rgba(237, 242, 255, 0.72), #fff 78%);
  }

  .today-capacity > .today-section-head > strong {
    color: #2047e7;
    font-size: 18px;
    line-height: 1;
  }

  .today-capacity-track {
    width: 100%;
    height: 9px;
    margin-top: 16px;
    overflow: hidden;
    border-radius: 999px;
    background: rgba(46, 86, 255, 0.12);
  }

  .today-capacity-track span {
    display: block;
    height: 100%;
    min-width: 4px;
    border-radius: inherit;
    background: linear-gradient(90deg, #2e56ff, #7390ff);
    transition: width var(--motion-base) ease;
  }

  .today-capacity-notes {
    display: flex;
    flex-wrap: wrap;
    justify-content: space-between;
    gap: 6px;
    margin-top: 8px;
    color: #64748b;
    font-size: 10px;
  }

  .today-capacity-notes span:last-child {
    color: #216642;
    font-weight: 750;
  }

  .today-capacity-action {
    margin-top: 14px;
  }

  .today-actions {
    grid-area: actions;
    grid-column: 1 / -1;
    display: flex;
    flex-wrap: wrap;
    gap: 7px;
  }

  .today-actions a {
    display: inline-flex;
    min-height: 30px;
    align-items: center;
    gap: 5px;
    padding: 0 9px;
    border: 1px solid rgba(15, 23, 42, 0.13);
    border-radius: 8px;
    color: #334155;
    background: #fff;
    font-size: 11px;
    font-weight: 700;
  }

  .today-actions a:hover,
  .today-signal:hover,
  .today-stat:hover {
    border-color: color-mix(in srgb, var(--tone, #2e56ff) 48%, transparent);
  }

  .control-metrics {
    height: 100%;
    min-height: 0;
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    grid-template-rows: minmax(135px, 0.86fr) minmax(150px, 1fr);
    gap: 12px;
  }

  .control-card {
    --tone: #2e56ff;
    --tone-ink: #2047e7;
    --tone-bg: rgba(46, 86, 255, 0.07);
    --tone-border: rgba(46, 86, 255, 0.23);
    position: relative;
    min-width: 0;
    min-height: 0;
    padding: 16px;
    overflow: hidden;
    border: 1px solid var(--tone-border);
    border-radius: 12px;
    background: linear-gradient(
      160deg,
      color-mix(in srgb, #ffffff 74%, var(--tone-bg)) 0%,
      #ffffff 56%,
      rgba(248, 250, 252, 0.92) 100%
    );
    box-shadow: 0 10px 24px color-mix(in srgb, var(--tone) 9%, transparent);
    isolation: isolate;
  }

  .control-card::before {
    position: absolute;
    inset: 0;
    z-index: -1;
    background: linear-gradient(
      180deg,
      rgba(255, 255, 255, 0.58),
      transparent 42%
    );
    content: "";
    opacity: 0.74;
  }

  .control-card.featured {
    grid-column: 1 / -1;
    padding: 22px 24px;
    border-color: color-mix(in srgb, var(--tone) 36%, var(--tone-border));
    background: linear-gradient(
      135deg,
      color-mix(in srgb, var(--tone) 16%, #ffffff) 0%,
      #ffffff 52%,
      color-mix(in srgb, #ffffff 80%, var(--tone-bg)) 100%
    );
    box-shadow:
      0 16px 34px color-mix(in srgb, var(--tone) 14%, transparent),
      inset 0 1px 0 rgba(255, 255, 255, 0.82);
  }

  .control-card:not(.featured) {
    box-shadow:
      0 10px 24px color-mix(in srgb, var(--tone) 10%, transparent),
      inset 0 1px 0 rgba(255, 255, 255, 0.74);
  }

  .control-card.operation-featured {
    --tone: #eab308;
    --tone-ink: #9a5d00;
    --tone-bg: rgba(250, 204, 21, 0.16);
    --tone-border: rgba(234, 179, 8, 0.52);
  }

  .control-card.delivery-featured {
    --tone: #5dac83;
    --tone-ink: #176640;
    --tone-bg: rgba(93, 172, 131, 0.16);
    --tone-border: rgba(93, 172, 131, 0.5);
  }

  .control-card.secondary-control {
    --tone: #2e56ff;
    --tone-ink: #2047e7;
    --tone-bg: rgba(46, 86, 255, 0.07);
    --tone-border: rgba(46, 86, 255, 0.23);
  }

  .control-card:hover,
  .control-card:focus-visible {
    border-color: color-mix(in srgb, var(--tone) 62%, rgba(15, 23, 42, 0.12));
    transform: translateY(-1px);
  }

  .control-icon {
    position: absolute;
    top: 16px;
    right: 16px;
    width: 42px;
    height: 42px;
    display: grid;
    place-items: center;
    border: 1px solid var(--tone-border);
    border-radius: 12px;
    color: var(--tone-ink);
    background: color-mix(in srgb, var(--tone-bg) 76%, #fff);
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.7),
      0 8px 18px color-mix(in srgb, var(--tone) 12%, transparent);
  }

  .featured .control-icon {
    top: 22px;
    right: 24px;
    width: 54px;
    height: 54px;
  }

  .control-copy {
    position: absolute;
    right: 16px;
    bottom: 16px;
    left: 16px;
    display: grid;
    gap: 5px;
  }

  .featured .control-copy {
    right: 24px;
    bottom: 22px;
    left: 24px;
  }

  .control-copy strong {
    color: #06152e;
    font-size: 30px;
    font-weight: 600;
    line-height: 1;
  }

  .featured .control-copy strong {
    font-size: 38px;
  }

  .control-copy span {
    color: var(--tone-ink);
    font-size: 12px;
    font-weight: 600;
  }

  .pending-empty {
    height: 100%;
    min-height: 274px;
    display: grid;
    place-content: center;
    justify-items: center;
    padding: 18px;
    border: 1px dashed rgba(15, 23, 42, 0.13);
    border-radius: 12px;
    background: rgba(15, 23, 42, 0.025);
    gap: 8px;
    text-align: center;
  }

  .pending-empty > span {
    width: 42px;
    height: 42px;
    margin-bottom: 0;
    display: grid;
    place-items: center;
    border: 1px solid rgba(46, 86, 255, 0.22);
    border-radius: 12px;
    color: #2e56ff;
    background: rgba(46, 86, 255, 0.08);
  }

  .pending-empty strong {
    color: #17233b;
    font-size: 16px;
  }

  .pending-empty p {
    max-width: 330px;
    margin-top: 0;
    color: #64748b;
    font-size: 12px;
    line-height: 1.45;
  }

  .invitation-message {
    margin-bottom: 10px;
    padding: 9px 11px;
    border: 1px solid color-mix(in srgb, var(--green-500) 25%, var(--border));
    border-radius: 9px;
    color: #347457;
    background: color-mix(in srgb, var(--green-500) 7%, white);
    font-size: 11px;
  }

  .invitation-list {
    display: grid;
    max-height: 274px;
    gap: 9px;
    overflow-y: auto;
  }

  .invitation-card {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: center;
    gap: 11px;
    padding: 12px;
    border: 1px solid rgba(46, 86, 255, 0.2);
    border-radius: 12px;
    background: rgba(255, 255, 255, 0.85);
  }

  .invitation-icon {
    display: grid;
    width: 42px;
    height: 42px;
    place-items: center;
    border-radius: 11px;
    color: var(--brand-600);
    background: var(--brand-50);
  }

  .invitation-copy {
    min-width: 0;
  }

  .invitation-copy small,
  .invitation-copy strong {
    display: block;
  }

  .invitation-copy small {
    color: var(--ink-400);
    font-size: 9px;
    font-weight: 700;
    text-transform: uppercase;
  }

  .invitation-copy strong {
    margin-top: 2px;
    color: var(--ink-800);
    font-size: var(--text-sm);
  }

  .invitation-copy p {
    margin-top: 3px;
    color: var(--ink-500);
    font-size: 11px;
  }

  .invitation-card button {
    display: inline-flex;
    min-height: 36px;
    align-items: center;
    justify-content: center;
    gap: 6px;
    padding: 0 12px;
    border: 0;
    border-radius: 9px;
    color: white;
    background: var(--brand-600);
    font: inherit;
    font-size: 11px;
    font-weight: 700;
  }

  .invitation-card button:disabled {
    opacity: 0.62;
  }

  .workload {
    min-height: 210px;
    height: 100%;
  }

  .week-grid {
    min-width: 0;
    min-height: 0;
    height: 100%;
    display: grid;
    grid-template-columns: repeat(7, minmax(0, 1fr));
    gap: 6px;
  }

  .workday {
    position: relative;
    min-width: 0;
    min-height: 190px;
    padding: 8px;
    display: grid;
    grid-template-rows: auto auto minmax(76px, 1fr);
    gap: 6px;
    border: 1px solid
      color-mix(in srgb, var(--tone-border) 72%, rgba(15, 23, 42, 0.12));
    border-radius: 12px;
    background: linear-gradient(
      180deg,
      color-mix(in srgb, #fff 92%, var(--tone-bg)),
      #fff
    );
  }

  .workday.today {
    box-shadow: inset 0 0 0 1px rgba(46, 86, 255, 0.26);
  }

  .workday-top {
    min-width: 0;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 6px;
  }

  .workday-top > span {
    min-width: 0;
    overflow: hidden;
    color: #64748b;
    font-size: 11px;
    font-weight: 600;
    line-height: 1;
    text-overflow: ellipsis;
    text-transform: capitalize;
    white-space: nowrap;
  }

  .workday-top i {
    width: 8px;
    height: 8px;
    flex: 0 0 auto;
    border-radius: 999px;
    background: #2e56ff;
  }

  .workday > strong {
    color: #081631;
    font-size: 18px;
    line-height: 1;
  }

  .workday-bar {
    width: 100%;
    min-height: 76px;
    overflow: hidden;
    align-self: stretch;
    display: flex;
    align-items: flex-end;
    justify-content: center;
    border-radius: 12px;
    background: #eef0f4;
  }

  .workday-bar > i {
    display: block;
    width: 100%;
    height: var(--workday-load, 0%);
    background: linear-gradient(
      to top,
      var(--workday-color),
      color-mix(in srgb, var(--workday-color) 68%, #ffffff)
    );
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.22);
    transition:
      height var(--motion-base) ease,
      background var(--motion-base) ease;
  }

  .lower-grid {
    --dashboard-summary-card-height: 106px;
    min-width: 0;
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    align-items: stretch;
    gap: var(--dash-gap);
  }

  .attention-panel,
  .finance-panel {
    box-sizing: border-box;
    height: 100%;
    padding: var(--dashboard-panel-padding);
    display: grid;
    grid-template-rows:
      32px
      var(--dashboard-section-gap)
      var(--dashboard-summary-card-height);
    align-content: start;
  }

  .finance-panel {
    grid-column: span 2;
  }

  .attention-cards {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    grid-auto-rows: var(--dashboard-summary-card-height);
    gap: 8px;
  }

  .attention-card,
  .finance-metric {
    --tone: #2e56ff;
    --tone-ink: #2047e7;
    --tone-bg: rgba(46, 86, 255, 0.1);
    --tone-border: rgba(46, 86, 255, 0.22);
    box-sizing: border-box;
    height: 100%;
    min-height: 0;
    padding: 12px;
    display: grid;
    grid-template-columns: 36px minmax(0, 1fr);
    align-items: center;
    gap: 10px;
    border: 1px solid var(--tone-border);
    border-radius: 10px;
  }

  .attention-card {
    min-width: 0;
    padding: 10px;
    grid-template-columns: 1fr;
    grid-template-rows: auto minmax(0, 1fr);
    align-items: stretch;
    gap: 9px;
    background: linear-gradient(
      135deg,
      color-mix(in srgb, #fff 88%, var(--tone-bg)),
      #fff
    );
  }

  .attention-card:hover {
    border-color: color-mix(in srgb, var(--tone) 52%, var(--tone-border));
    transform: translateY(-1px);
  }

  .attention-card-head {
    display: flex;
    min-width: 0;
    align-items: center;
    gap: 7px;
    color: var(--tone-ink);
  }

  .attention-card-icon {
    width: 30px;
    height: 30px;
    flex: 0 0 auto;
    display: grid;
    place-items: center;
    border: 1px solid var(--tone-border);
    border-radius: 10px;
    color: var(--tone-ink);
    background: var(--tone-bg);
  }

  .attention-card-body {
    min-width: 0;
    display: grid;
    align-content: end;
    gap: 3px;
    padding-top: 8px;
    border-top: 1px solid color-mix(in srgb, var(--tone-border) 58%, transparent);
  }

  .attention-card-body strong {
    display: -webkit-box;
    overflow: hidden;
    color: #0c1c39;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    text-overflow: ellipsis;
  }

  .attention-card-body small {
    min-width: 0;
    overflow: hidden;
    color: #64748b;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .attention-card.tone-danger {
    --tone: #dc2626;
    --tone-ink: #a11b1b;
    --tone-bg: rgba(220, 38, 38, 0.11);
    --tone-border: rgba(220, 38, 38, 0.26);
  }

  .attention-card.tone-warning {
    --tone: #eab308;
    --tone-ink: #87570a;
    --tone-bg: rgba(234, 179, 8, 0.13);
    --tone-border: rgba(234, 179, 8, 0.28);
  }

  .attention-card.tone-success {
    --tone: #5dac83;
    --tone-ink: #216642;
    --tone-bg: rgba(93, 172, 131, 0.12);
    --tone-border: rgba(93, 172, 131, 0.25);
  }

  .section-head {
    min-height: 32px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    margin: 0;
  }

  .section-head h3 {
    margin: 0;
  }

  .section-head a {
    min-height: 32px;
    padding: 6px 10px;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    border: 1px solid rgba(39, 132, 98, 0.3);
    border-radius: 8px;
    color: #207153;
    background: #fff;
    font-size: 12px;
    font-weight: 600;
  }

  .finance-grid {
    min-width: 0;
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    grid-auto-rows: var(--dashboard-summary-card-height);
    gap: 8px;
  }

  .attention-cards,
  .finance-grid {
    grid-row: 3;
  }

  .finance-metric {
    position: relative;
    min-width: 0;
    padding: 10px;
    grid-template-columns: 1fr;
    grid-template-rows: auto minmax(0, 1fr);
    align-items: stretch;
    gap: 8px;
    overflow: hidden;
    border-color: color-mix(
      in srgb,
      var(--tone-border) 70%,
      rgba(15, 23, 42, 0.12)
    );
    background: linear-gradient(
      180deg,
      color-mix(in srgb, #ffffff 90%, var(--tone-bg)),
      #ffffff
    );
  }

  .finance-metric.tone-success:not(.solid) {
    --tone: #55b58a;
    --tone-ink: #176b48;
    --tone-bg: rgba(85, 181, 138, 0.14);
    --tone-border: rgba(85, 181, 138, 0.36);
    background: linear-gradient(135deg, #f2faf6 0%, #ffffff 72%);
  }

  .finance-metric.tone-danger {
    --tone: #e5222a;
    --tone-ink: #b2141b;
    --tone-bg: rgba(229, 34, 42, 0.12);
    --tone-border: rgba(229, 34, 42, 0.34);
    background: linear-gradient(135deg, #fff4f4 0%, #ffffff 72%);
  }

  .finance-metric.tone-info {
    --tone: #3158ff;
    --tone-ink: #2449df;
    --tone-bg: rgba(49, 88, 255, 0.11);
    --tone-border: rgba(49, 88, 255, 0.32);
    background: linear-gradient(135deg, #f3f6ff 0%, #ffffff 72%);
  }

  .finance-icon {
    width: 30px;
    height: 30px;
    display: grid;
    place-items: center;
    border: 1px solid var(--tone-border);
    border-radius: 10px;
    color: var(--tone-ink);
    background: var(--tone-bg);
  }

  .finance-copy {
    min-width: 0;
    display: grid;
  }

  .finance-copy > span {
    overflow: hidden;
    color: #64748b;
    font-size: 10px;
    font-weight: 700;
    text-overflow: ellipsis;
    text-transform: uppercase;
    white-space: nowrap;
  }

  .finance-copy strong {
    overflow: hidden;
    color: #081631;
    font-size: 18px;
    font-weight: 700;
    line-height: 1;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .finance-card-head {
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 7px;
  }

  .finance-card-value {
    min-width: 0;
    display: flex;
    align-items: end;
    padding-top: 8px;
    border-top: 1px solid color-mix(in srgb, var(--tone-border) 58%, transparent);
  }

  .finance-card-value strong {
    overflow: hidden;
    color: #081631;
    font-size: 18px;
    font-weight: 700;
    line-height: 1;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .finance-metric.solid {
    --tone: #fff;
    --tone-ink: #fff;
    --tone-bg: rgba(255, 255, 255, 0.14);
    --tone-border: rgba(255, 255, 255, 0.3);
    border-color: rgba(39, 132, 98, 0.78);
    background: linear-gradient(135deg, #3c8f68, #256b49);
    box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.18);
  }

  .finance-metric.solid .finance-copy > span,
  .finance-metric.solid .finance-card-value strong {
    color: #fff;
  }

  @media (min-width: 1121px) {
    .dashboard-page {
      height: calc(100dvh - var(--topbar-height) - (var(--main-padding) * 2));
      min-height: 0;
    }
  }

  @media (max-width: 1120px) {
    .daily-summary {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .daily-summary > *:nth-child(3) {
      border-left: 0;
    }

    .daily-summary > *:nth-child(n + 3) {
      border-top: 1px solid rgba(15, 23, 42, 0.16);
    }

    .main-grid {
      grid-template-columns: 1fr;
    }

    .lower-grid {
      grid-template-columns: 1fr;
    }

    .finance-panel {
      grid-column: auto;
    }

    .personal-panel,
    :global(.dashboard-control-panel) {
      min-height: 360px;
    }

    .finance-grid,
    .alert-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .week-grid {
      grid-template-columns: repeat(4, minmax(0, 1fr));
    }
  }

  @media (max-width: 760px) {
    .dashboard-page {
      --dash-gap: 10px;
      --dashboard-panel-padding: 14px;
      min-height: auto;
      grid-template-rows: auto;
    }

    .alerts-panel,
    :global(.dashboard-control-panel),
    .attention-panel,
    .finance-panel {
      padding: var(--dashboard-panel-padding);
    }

    .daily-summary {
      grid-template-columns: 1fr;
    }

    .daily-summary > * {
      min-height: 0;
      padding: 13px 0;
      border: 0;
    }

    .daily-summary > * + * {
      border-top: 1px solid rgba(15, 23, 42, 0.12);
      border-left: 0;
    }

    .personal-panel {
      padding: 0;
    }

    .projects-state {
      position: static;
      max-width: none;
      flex-wrap: wrap;
      margin-bottom: 10px;
    }

    .alert-grid,
    .finance-grid,
    .control-metrics {
      grid-template-columns: 1fr;
    }

    .personal-form {
      grid-template-columns: 1fr;
    }

    .control-metrics {
      height: auto;
      grid-template-rows: auto;
    }

    .today-dashboard {
      min-height: 0;
      grid-template-columns: 1fr;
      grid-template-rows: auto;
      grid-template-areas:
        "focus"
        "summary"
        "signals"
        "route"
        "deliveries"
        "capacity"
        "actions";
    }

    .today-focus,
    .today-signals,
    .today-route,
    .today-deliveries,
    .today-capacity,
    .today-actions {
      grid-column: auto;
    }

    .today-summary {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .attention-card {
      grid-template-columns: 36px minmax(0, 1fr);
    }

    .control-card {
      grid-column: auto;
      min-height: 132px;
    }

    .week-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }

  @media (max-width: 430px) {
    .today-summary {
      grid-template-columns: 1fr;
    }

    .week-grid {
      grid-template-columns: 1fr;
    }
  }

  /* Typography hierarchy: components choose a role instead of bespoke text values. */
  .dashboard-page strong {
    font-weight: 600;
  }

  .dashboard-page h3 {
    font: var(--dashboard-type-section);
  }

  .daily-progress h3,
  .today-signals h2,
  .today-route h2,
  .today-deliveries h2,
  .today-capacity h2,
  .pending-empty strong {
    font: var(--dashboard-type-component);
  }

  .control-copy strong,
  .featured .control-copy strong {
    font: var(--dashboard-type-display);
  }

  .daily-next-delivery strong,
  .daily-progress-head > strong,
  .daily-total strong,
  .metric-copy strong,
  .today-focus-copy strong,
  .today-stat strong,
  .today-capacity > .today-section-head > strong,
  .workday > strong,
  .finance-copy strong {
    font: var(--dashboard-type-metric);
  }

  :global(.dashboard-control-system .tab-button),
  .section-head a,
  .metric-copy span,
  .control-copy span,
  .today-section-head a,
  .today-focus-action,
  .today-stat > span,
  .today-all-clear,
  .today-signal strong,
  .today-timeline a strong,
  .today-route-empty a,
  .today-capacity-action,
  .today-delivery-list strong,
  .today-actions a,
  .attention-card-head > span:last-child,
  .attention-card-body strong,
  .invitation-copy strong,
  .invitation-card button {
    font: var(--dashboard-type-ui);
  }

  .personal-form input,
  .notebook li > span,
  .today-focus-copy p,
  .today-signal small,
  .today-deliveries-empty,
  .pending-empty p,
  .invitation-copy p {
    font: var(--dashboard-type-body);
  }

  .daily-date,
  .daily-next-delivery small,
  .daily-total small,
  .schedule-slot a strong,
  .schedule-slot a small,
  .today-focus-meta,
  .today-route-summary,
  .today-timeline a span,
  .today-timeline-duration,
  .today-timeline-duration small,
  .today-route-empty,
  .today-capacity-notes,
  .attention-card-body small,
  .workday-top > span,
  .invitation-message {
    font: var(--dashboard-type-meta);
  }

  .daily-total > span,
  .today-eyebrow,
  .today-focus-state,
  .schedule-slot-now,
  .today-delivery-list a > span,
  .invitation-copy small,
  .finance-copy > span {
    font: var(--dashboard-type-eyebrow);
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }

  .schedule-slot-time,
  .today-timeline-time {
    font: var(--dashboard-type-meta);
    font-variant-numeric: tabular-nums;
  }

  .daily-date,
  .workday-top > span {
    text-transform: none;
  }
</style>
