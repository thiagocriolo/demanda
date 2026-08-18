<script lang="ts">
  import { goto } from "$app/navigation";
  import { page } from "$app/state";
  import {
    businessConfig,
    deliveryConfig,
    peopleConfig,
    projectConfig,
  } from "$lib/entities/catalog";
  import {
    ContactApiError,
    contactToEntityRecord,
    listContacts,
    observeContacts,
  } from "$lib/contacts/client";
  import {
    BusinessApiError,
    businessToEntityRecord,
    listBusinesses,
    observeBusinesses,
  } from "$lib/businesses/client";
  import type { BusinessList } from "$lib/businesses/types";
  import {
    ProjectApiError,
    listProjects,
    observeProjects,
    projectToEntityRecord,
  } from "$lib/projects/client";
  import type { ProjectList } from "$lib/projects/types";
  import {
    listTasks,
    observeTasks,
    TaskApiError,
    taskToEntityRecord,
  } from "$lib/tasks/client";
  import type { TaskList } from "$lib/tasks/types";
  import type { ContactList, ContactStatus } from "$lib/contacts/types";
  import type {
    EntityConfig,
    EntityFieldOption,
    EntityRecord,
  } from "$lib/entities/types";
  import {
    currentSettings,
    loadSettingsFromServer,
  } from "$lib/settings/client";
  import EntityCardList from "$lib/ui/EntityCardList.svelte";
  import type { EntityCardItem, EntityCardKind } from "$lib/ui/entity-card";
  import FilterBar, { type FilterOption } from "$lib/ui/FilterBar.svelte";
  import TabSystem from "$lib/ui/TabSystem.svelte";
  import type { TabItem } from "$lib/ui/Tabs.svelte";
  import {
    loadWorkspaceUsers,
    observeWorkspaces,
    type WorkspaceUser,
  } from "$lib/workspaces/workspace-storage";
  import { resolveResponsibleUser } from "$lib/workspaces/responsible-user";
  import { onMount } from "svelte";

  type RecordsTab = "pessoas" | "negocios" | "projetos" | "tarefas";
  type RecordsOrderBy = "updated" | "name_asc" | "name_desc";

  const tabRoutes: Record<RecordsTab, string> = {
    pessoas: "/registros/contatos",
    negocios: "/registros/negócios",
    projetos: "/registros/projetos",
    tarefas: "/registros/tarefas",
  };

  function tabFromPath(pathname: string): RecordsTab | undefined {
    const segment = decodeURIComponent(pathname)
      .replace(/\/$/, "")
      .split("/")
      .at(-1)
      ?.toLocaleLowerCase("pt-BR");

    if (segment === "contatos") return "pessoas";
    if (segment === "negócios") return "negocios";
    if (segment === "projetos") return "projetos";
    if (segment === "tarefas") return "tarefas";
    return undefined;
  }

  type TabConfig = {
    config: EntityConfig;
    kind: EntityCardKind;
    statusField: string;
    placeholder: string;
    emptyLabel: string;
    createLabel: string;
  };

  const tabs: TabItem[] = [
    { id: "pessoas", label: "Contatos" },
    { id: "negocios", label: "Negócios" },
    { id: "projetos", label: "Projetos" },
    { id: "tarefas", label: "Tarefas" },
  ];

  const tabConfigs: Record<RecordsTab, TabConfig> = {
    pessoas: {
      config: peopleConfig,
      kind: "pessoa",
      statusField: "tipo",
      placeholder: "Buscar contatos",
      emptyLabel: "contato",
      createLabel: "contato",
    },
    negocios: {
      config: businessConfig,
      kind: "negocio",
      statusField: "etapa",
      placeholder: "Buscar negócios",
      emptyLabel: "negócio",
      createLabel: "negócio",
    },
    projetos: {
      config: projectConfig,
      kind: "projeto",
      statusField: "status",
      placeholder: "Buscar projetos",
      emptyLabel: "projeto",
      createLabel: "projeto",
    },
    tarefas: {
      config: deliveryConfig,
      kind: "tarefa",
      statusField: "status",
      placeholder: "Buscar tarefas",
      emptyLabel: "tarefa",
      createLabel: "tarefa",
    },
  };

  const toneColors: Record<NonNullable<EntityFieldOption["tone"]>, string> = {
    blue: "#2e56ff",
    green: "#5dac83",
    amber: "#f59e0b",
    red: "#dc2626",
    violet: "#7c5ce5",
    gray: "#64748b",
  };

  let activeTab = $state<RecordsTab>(
    tabFromPath(page.url.pathname) ?? "pessoas",
  );
  let filters = $state<Record<RecordsTab, string>>({
    pessoas: "todos",
    negocios: "todos",
    projetos: "todos",
    tarefas: "todos",
  });
  let queries = $state<Record<RecordsTab, string>>({
    pessoas: "",
    negocios: "",
    projetos: "",
    tarefas: "",
  });
  let records = $state<Record<RecordsTab, EntityRecord[]>>({
    pessoas: [],
    negocios: [],
    projetos: [],
    tarefas: [],
  });
  let recordsOrderBy = $state<RecordsOrderBy>("updated");
  let recordsShowArchived = $state(false);
  let workspaceUsers = $state<WorkspaceUser[]>([]);
  let contactsPage = $state(1);
  const recordsPageSize = 10;
  let contactsTotal = $state(0);
  let contactsTotalPages = $state(1);
  let contactsLoading = $state(false);
  let contactsError = $state("");
  let contactsFacets = $state<ContactList["facets"]>({
    all: 0,
    lead: 0,
    prospect: 0,
    active: 0,
    inactive: 0,
    archived: 0,
  });
  let contactsInitialized = $state(false);
  let lastContactFilterKey = "";
  let contactsAbortController: AbortController | undefined;
  let businessesPage = $state(1);
  let businessesTotal = $state(0);
  let businessesTotalPages = $state(1);
  let businessesLoading = $state(false);
  let businessesError = $state("");
  let businessesFacets = $state<BusinessList["facets"]>({
    all: 0,
    archived: 0,
    stages: {},
    categories: {},
  });
  let businessesInitialized = $state(false);
  let lastBusinessFilterKey = "";
  let businessesAbortController: AbortController | undefined;
  let projectsPage = $state(1);
  let projectsTotal = $state(0);
  let projectsTotalPages = $state(1);
  let projectsLoading = $state(false);
  let projectsError = $state("");
  let projectsFacets = $state<ProjectList["facets"]>({
    all: 0,
    archived: 0,
    statuses: {},
    services: {},
  });
  let projectsInitialized = $state(false);
  let lastProjectFilterKey = "";
  let projectsAbortController: AbortController | undefined;
  let tasksPage = $state(1);
  let tasksTotal = $state(0);
  let tasksTotalPages = $state(1);
  let tasksLoading = $state(false);
  let tasksError = $state("");
  let tasksFacets = $state<TaskList["facets"]>({
    all: 0,
    archived: 0,
    statuses: {},
    priorities: {},
    categories: {},
    projects: {},
  });
  let tasksInitialized = $state(false);
  let lastTaskFilterKey = "";
  let tasksAbortController: AbortController | undefined;
  let loadMoreSentinel = $state<HTMLDivElement>();

  let activeConfig = $derived(tabConfigs[activeTab]);
  let scopedRecords = $derived(records[activeTab]);
  let filterOptions = $derived.by((): FilterOption[] => {
    const statusOptions =
      activeConfig.config.fields.find(
        (field) => field.name === activeConfig.statusField,
      )?.options ?? [];
    if (activeTab === "pessoas") {
      const countByLegacyStatus: Record<string, number> = {
        lead: contactsFacets.lead,
        prospecto: contactsFacets.prospect,
        ativo: contactsFacets.active,
        desativado: contactsFacets.inactive,
        arquivado: contactsFacets.archived,
      };
      return [
        { value: "todos", label: "Todos", count: contactsFacets.all },
        ...statusOptions.map((option) => ({
          value: option.value,
          label: option.label,
          count: countByLegacyStatus[option.value] ?? 0,
        })),
      ];
    }
    if (activeTab === "negocios") {
      const configuredValues = new Set(statusOptions.map(({ value }) => value));
      const dynamicStageOptions = Object.keys(businessesFacets.stages)
        .filter((stage) => !configuredValues.has(stage))
        .sort((left, right) => left.localeCompare(right, "pt-BR"))
        .map((stage) => ({ value: stage, label: stage }));
      const archivedOption =
        businessesFacets.archived > 0 && !configuredValues.has("arquivado")
          ? [{ value: "arquivado", label: "Arquivado" }]
          : [];
      return [
        { value: "todos", label: "Todos", count: businessesFacets.all },
        ...[...statusOptions, ...dynamicStageOptions, ...archivedOption].map(
          (option) => ({
            value: option.value,
            label: option.label,
            count:
              option.value === "arquivado"
                ? businessesFacets.archived
                : (businessesFacets.stages[option.value] ?? 0),
          }),
        ),
      ];
    }
    if (activeTab === "projetos") {
      const configuredValues = new Set(statusOptions.map(({ value }) => value));
      const dynamicStatusOptions = Object.keys(projectsFacets.statuses)
        .filter((status) => !configuredValues.has(status))
        .sort((left, right) => left.localeCompare(right, "pt-BR"))
        .map((status) => ({ value: status, label: status }));
      const archivedOption =
        projectsFacets.archived > 0 && !configuredValues.has("arquivado")
          ? [{ value: "arquivado", label: "Arquivados" }]
          : [];
      return [
        { value: "todos", label: "Todos", count: projectsFacets.all },
        ...[...statusOptions, ...dynamicStatusOptions, ...archivedOption].map(
          (option) => ({
            value: option.value,
            label: option.label,
            count:
              option.value === "arquivado"
                ? projectsFacets.archived
                : (projectsFacets.statuses[option.value] ?? 0),
          }),
        ),
      ];
    }
    const configuredValues = new Set(statusOptions.map(({ value }) => value));
    const dynamicStatusOptions = Object.keys(tasksFacets.statuses)
      .filter((status) => !configuredValues.has(status))
      .sort((left, right) => left.localeCompare(right, "pt-BR"))
      .map((status) => ({ value: status, label: status }));
    const archivedOption =
      tasksFacets.archived > 0 && !configuredValues.has("arquivado")
        ? [{ value: "arquivado", label: "Arquivadas" }]
        : [];
    return [
      { value: "todos", label: "Todos", count: tasksFacets.all },
      ...[...statusOptions, ...dynamicStatusOptions, ...archivedOption].map(
        (option) => ({
          value: option.value,
          label: option.label,
          count:
            option.value === "arquivado"
              ? tasksFacets.archived
              : (tasksFacets.statuses[option.value] ?? 0),
        }),
      ),
    ];
  });
  let visibleRecords = $derived(scopedRecords);
  let cards = $derived(
    visibleRecords.map((record) => toCardItem(activeTab, activeConfig, record)),
  );
  let activeLoading = $derived(
    activeTab === "pessoas"
      ? contactsLoading
      : activeTab === "negocios"
        ? businessesLoading
        : activeTab === "projetos"
          ? projectsLoading
          : tasksLoading,
  );
  let activeError = $derived(
    activeTab === "pessoas"
      ? contactsError
      : activeTab === "negocios"
        ? businessesError
        : activeTab === "projetos"
          ? projectsError
          : tasksError,
  );
  let activeHasMore = $derived(
    activeTab === "pessoas"
      ? contactsPage < contactsTotalPages
      : activeTab === "negocios"
        ? businessesPage < businessesTotalPages
        : activeTab === "projetos"
          ? projectsPage < projectsTotalPages
          : tasksPage < tasksTotalPages,
  );
  function mergeRecords(
    current: EntityRecord[],
    incoming: EntityRecord[],
  ): EntityRecord[] {
    const merged = new Map(current.map((record) => [record.id, record]));
    for (const record of incoming) merged.set(record.id, record);
    return [...merged.values()];
  }

  function loadNextPage(): void {
    if (activeLoading || activeError || !activeHasMore) return;

    if (activeTab === "pessoas") {
      contactsLoading = true;
      contactsPage += 1;
    } else if (activeTab === "negocios") {
      businessesLoading = true;
      businessesPage += 1;
    } else if (activeTab === "projetos") {
      projectsLoading = true;
      projectsPage += 1;
    } else {
      tasksLoading = true;
      tasksPage += 1;
    }
  }

  function selectedContactStatus(): ContactStatus | undefined {
    return (
      {
        lead: "lead",
        prospecto: "prospect",
        ativo: "active",
        desativado: "inactive",
      } as const
    )[filters.pessoas as "lead" | "prospecto" | "ativo" | "desativado"];
  }

  async function reloadContacts(): Promise<void> {
    contactsAbortController?.abort();
    const controller = new AbortController();
    const requestedPage = contactsPage;
    contactsAbortController = controller;
    contactsLoading = true;
    contactsError = "";
    if (requestedPage === 1) records.pessoas = [];

    try {
      const result = await listContacts({
        page: requestedPage,
        pageSize: recordsPageSize,
        query: queries.pessoas,
        status: selectedContactStatus(),
        orderBy: recordsOrderBy,
        archived:
          filters.pessoas === "arquivado"
            ? "only"
            : recordsShowArchived
              ? "include"
              : "exclude",
        signal: controller.signal,
      });
      if (controller.signal.aborted) return;

      if (result.totalPages > 0 && requestedPage > result.totalPages) {
        contactsPage = result.totalPages;
        return;
      }
      const incoming = result.items.map(contactToEntityRecord);
      records.pessoas =
        requestedPage === 1
          ? incoming
          : mergeRecords(records.pessoas, incoming);
      contactsTotal = result.total;
      contactsTotalPages = Math.max(1, result.totalPages);
      contactsFacets = result.facets;
    } catch (cause) {
      if (controller.signal.aborted) return;
      contactsError =
        cause instanceof ContactApiError
          ? cause.message
          : "Não foi possível carregar os contatos.";
      if (requestedPage === 1) records.pessoas = [];
    } finally {
      if (contactsAbortController === controller) contactsLoading = false;
    }
  }

  function selectedBusinessStage(): string | undefined {
    const selected = filters.negocios;
    return selected !== "todos" && selected !== "arquivado"
      ? selected
      : undefined;
  }

  async function reloadBusinesses(): Promise<void> {
    businessesAbortController?.abort();
    const controller = new AbortController();
    const requestedPage = businessesPage;
    businessesAbortController = controller;
    businessesLoading = true;
    businessesError = "";
    if (requestedPage === 1) records.negocios = [];

    try {
      const result = await listBusinesses({
        page: requestedPage,
        pageSize: recordsPageSize,
        query: queries.negocios,
        stage: selectedBusinessStage(),
        orderBy: recordsOrderBy,
        archived:
          filters.negocios === "arquivado"
            ? "only"
            : recordsShowArchived
              ? "include"
              : "exclude",
        signal: controller.signal,
      });
      if (controller.signal.aborted) return;

      if (result.totalPages > 0 && requestedPage > result.totalPages) {
        businessesPage = result.totalPages;
        return;
      }
      const incoming = result.items.map(businessToEntityRecord);
      records.negocios =
        requestedPage === 1
          ? incoming
          : mergeRecords(records.negocios, incoming);
      businessesTotal = result.total;
      businessesTotalPages = Math.max(1, result.totalPages);
      businessesFacets = result.facets;
    } catch (cause) {
      if (controller.signal.aborted) return;
      businessesError =
        cause instanceof BusinessApiError
          ? cause.message
          : "Não foi possível carregar os negócios.";
      if (requestedPage === 1) records.negocios = [];
    } finally {
      if (businessesAbortController === controller) businessesLoading = false;
    }
  }

  function selectedProjectStatus(): string | undefined {
    const selected = filters.projetos;
    return selected !== "todos" && selected !== "arquivado"
      ? selected
      : undefined;
  }

  async function reloadProjects(): Promise<void> {
    projectsAbortController?.abort();
    const controller = new AbortController();
    const requestedPage = projectsPage;
    projectsAbortController = controller;
    projectsLoading = true;
    projectsError = "";
    if (requestedPage === 1) records.projetos = [];

    try {
      const result = await listProjects({
        page: requestedPage,
        pageSize: recordsPageSize,
        query: queries.projetos,
        status: selectedProjectStatus(),
        orderBy: recordsOrderBy,
        archived:
          filters.projetos === "arquivado"
            ? "only"
            : recordsShowArchived
              ? "include"
              : "exclude",
        signal: controller.signal,
      });
      if (controller.signal.aborted) return;

      if (result.totalPages > 0 && requestedPage > result.totalPages) {
        projectsPage = result.totalPages;
        return;
      }
      const incoming = result.items.map(projectToEntityRecord);
      records.projetos =
        requestedPage === 1
          ? incoming
          : mergeRecords(records.projetos, incoming);
      projectsTotal = result.total;
      projectsTotalPages = Math.max(1, result.totalPages);
      projectsFacets = result.facets;
    } catch (cause) {
      if (controller.signal.aborted) return;
      projectsError =
        cause instanceof ProjectApiError
          ? cause.message
          : "Não foi possível carregar os projetos.";
      if (requestedPage === 1) records.projetos = [];
    } finally {
      if (projectsAbortController === controller) projectsLoading = false;
    }
  }

  function selectedTaskStatus(): string | undefined {
    const selected = filters.tarefas;
    return selected !== "todos" && selected !== "arquivado"
      ? selected
      : undefined;
  }

  async function reloadTasks(): Promise<void> {
    tasksAbortController?.abort();
    const controller = new AbortController();
    const requestedPage = tasksPage;
    tasksAbortController = controller;
    tasksLoading = true;
    tasksError = "";
    if (requestedPage === 1) records.tarefas = [];

    try {
      const result = await listTasks({
        page: requestedPage,
        pageSize: recordsPageSize,
        query: queries.tarefas,
        status: selectedTaskStatus(),
        orderBy: recordsOrderBy,
        archived:
          filters.tarefas === "arquivado"
            ? "only"
            : recordsShowArchived
              ? "include"
              : "exclude",
        signal: controller.signal,
      });
      if (controller.signal.aborted) return;
      if (result.totalPages > 0 && requestedPage > result.totalPages) {
        tasksPage = result.totalPages;
        return;
      }
      const incoming = result.items.map(taskToEntityRecord);
      records.tarefas =
        requestedPage === 1
          ? incoming
          : mergeRecords(records.tarefas, incoming);
      tasksTotal = result.total;
      tasksTotalPages = Math.max(1, result.totalPages);
      tasksFacets = result.facets;
    } catch (cause) {
      if (controller.signal.aborted) return;
      tasksError =
        cause instanceof TaskApiError
          ? cause.message
          : "Não foi possível carregar as tarefas.";
      if (requestedPage === 1) records.tarefas = [];
    } finally {
      if (tasksAbortController === controller) tasksLoading = false;
    }
  }

  function statusMeta(
    tabConfig: TabConfig,
    record: EntityRecord,
  ): { label: string; color: string } {
    const statusValue = record[tabConfig.statusField] ?? "";
    const option = tabConfig.config.fields
      .find((field) => field.name === tabConfig.statusField)
      ?.options?.find((candidate) => candidate.value === statusValue);
    return {
      label: option?.label ?? (statusValue || "Sem status"),
      color: option?.tone ? toneColors[option.tone] : toneColors.gray,
    };
  }

  function formatDate(value: string): string {
    if (!value) return "Sem prazo";
    const date = new Date(`${value}T12:00:00`);
    if (Number.isNaN(date.getTime())) return value;
    return new Intl.DateTimeFormat("pt-BR").format(date);
  }

  function taskSteps(record: EntityRecord): string {
    try {
      const subtasks = JSON.parse(record.subtarefas || "[]") as Array<{
        status?: unknown;
      }>;
      if (!Array.isArray(subtasks)) return "0/0";
      const completed = subtasks.filter(({ status }) =>
        ["concluida", "concluido", "conclusao", "done", "completed"].includes(
          String(status ?? "").toLocaleLowerCase("pt-BR"),
        ),
      ).length;
      return `${completed}/${subtasks.length}`;
    } catch {
      return "0/0";
    }
  }

  function toCardItem(
    tab: RecordsTab,
    tabConfig: TabConfig,
    record: EntityRecord,
  ): EntityCardItem {
    const status = statusMeta(tabConfig, record);
    const base = {
      id: record.id,
      kind: tabConfig.kind,
      title: record.nome || `${tabConfig.emptyLabel} sem nome`,
      status: status.label,
      statusColor: status.color,
    } satisfies EntityCardItem;

    if (tab === "pessoas") {
      return {
        ...base,
        primary: record.telefone || "Telefone não informado",
        secondary: record.email || "E-mail não informado",
        relation: record.cargo || "Contato cadastrado",
      };
    }
    if (tab === "negocios") {
      const responsibles = (record.responsaveis ?? "")
        .split(",")
        .map((name) => name.trim())
        .filter(Boolean);
      const category = tabConfig.config.fields
        .find((field) => field.name === "categoria")
        ?.options?.find((option) => option.value === record.categoria);
      return {
        ...base,
        primary: responsibles[0] || "Responsável não informado",
        primaryMore:
          responsibles.length > 1 ? `+${responsibles.length - 1}` : undefined,
        secondary:
          category?.label || record.categoria || "Categoria não informada",
        relation: record.observacoes || "Sem resumo do cliente",
      };
    }
    if (tab === "projetos") {
      return {
        ...base,
        secondary: record.negocio || record.cliente || "Negócio não informado",
        relation:
          record.responsavel || record.servicos || "Responsável não informado",
        completion: formatDate(record.dataFim || record.prazo),
      };
    }

    const responsibleUser = resolveResponsibleUser(record, workspaceUsers);
    return {
      ...base,
      primary: record.negocio || "Negócio não informado",
      secondary: record.projeto || "Projeto não informado",
      relation: record.categoria || record.descricao || "Tarefa planejada",
      responsible: record.responsavel || "Sem responsável",
      responsibleAvatarUrl: responsibleUser?.avatarUrl,
      steps: taskSteps(record),
    };
  }

  function applyRecordSettings(
    settings: ReturnType<typeof currentSettings>,
  ): void {
    activeTab =
      tabFromPath(page.url.pathname) ??
      settings.recordsDefaultTab ??
      activeTab;
    recordsOrderBy = settings.recordsOrderBy ?? recordsOrderBy;
    recordsShowArchived = settings.recordsShowArchived ?? recordsShowArchived;
  }

  function navigateToTab(tab: string): void {
    const href = tabRoutes[tab as RecordsTab];
    if (!href || page.url.pathname === href) return;
    void goto(href, { keepFocus: true, noScroll: true });
  }

  onMount(() => {
    applyRecordSettings(currentSettings());
    void loadSettingsFromServer()
      .then(applyRecordSettings)
      .catch(() => undefined);
    const refreshWorkspace = () => {
      workspaceUsers = loadWorkspaceUsers();
      if (contactsInitialized) void reloadContacts();
      if (businessesInitialized) void reloadBusinesses();
      if (projectsInitialized) void reloadProjects();
      if (tasksInitialized) void reloadTasks();
    };
    refreshWorkspace();
    const stopContacts = observeContacts(() => void reloadContacts());
    const stopBusinesses = observeBusinesses(() => void reloadBusinesses());
    const stopProjects = observeProjects(() => void reloadProjects());
    const stopTasks = observeTasks(() => void reloadTasks());
    const stopWorkspaces = observeWorkspaces(refreshWorkspace);
    contactsInitialized = true;
    businessesInitialized = true;
    projectsInitialized = true;
    tasksInitialized = true;
    return () => {
      contactsAbortController?.abort();
      businessesAbortController?.abort();
      projectsAbortController?.abort();
      tasksAbortController?.abort();
      stopContacts();
      stopBusinesses();
      stopProjects();
      stopTasks();
      stopWorkspaces();
    };
  });

  $effect(() => {
    const routedTab = tabFromPath(page.url.pathname);
    if (routedTab && activeTab !== routedTab) activeTab = routedTab;
  });

  $effect(() => {
    const filterKey = JSON.stringify({
      query: queries.pessoas.trim(),
      filter: filters.pessoas,
      orderBy: recordsOrderBy,
      showArchived: recordsShowArchived,
    });
    const page = contactsPage;
    if (!contactsInitialized || activeTab !== "pessoas") return;
    if (lastContactFilterKey && lastContactFilterKey !== filterKey) {
      lastContactFilterKey = filterKey;
      if (contactsPage !== 1) {
        contactsPage = 1;
        return;
      }
    } else {
      lastContactFilterKey = filterKey;
    }
    const timeout = window.setTimeout(
      () => void reloadContacts(),
      queries.pessoas.trim() ? 250 : 0,
    );
    return () => window.clearTimeout(timeout);
  });

  $effect(() => {
    const filterKey = JSON.stringify({
      query: queries.tarefas.trim(),
      filter: filters.tarefas,
      orderBy: recordsOrderBy,
      showArchived: recordsShowArchived,
    });
    const page = tasksPage;
    if (!tasksInitialized || activeTab !== "tarefas") return;
    if (lastTaskFilterKey && lastTaskFilterKey !== filterKey) {
      lastTaskFilterKey = filterKey;
      if (tasksPage !== 1) {
        tasksPage = 1;
        return;
      }
    } else {
      lastTaskFilterKey = filterKey;
    }
    const timeout = window.setTimeout(
      () => void reloadTasks(),
      queries.tarefas.trim() ? 250 : 0,
    );
    return () => window.clearTimeout(timeout);
  });

  $effect(() => {
    const filterKey = JSON.stringify({
      query: queries.negocios.trim(),
      filter: filters.negocios,
      orderBy: recordsOrderBy,
      showArchived: recordsShowArchived,
    });
    const page = businessesPage;
    if (!businessesInitialized || activeTab !== "negocios") return;
    if (lastBusinessFilterKey && lastBusinessFilterKey !== filterKey) {
      lastBusinessFilterKey = filterKey;
      if (businessesPage !== 1) {
        businessesPage = 1;
        return;
      }
    } else {
      lastBusinessFilterKey = filterKey;
    }
    const timeout = window.setTimeout(
      () => void reloadBusinesses(),
      queries.negocios.trim() ? 250 : 0,
    );
    return () => window.clearTimeout(timeout);
  });

  $effect(() => {
    const filterKey = JSON.stringify({
      query: queries.projetos.trim(),
      filter: filters.projetos,
      orderBy: recordsOrderBy,
      showArchived: recordsShowArchived,
    });
    const page = projectsPage;
    if (!projectsInitialized || activeTab !== "projetos") return;
    if (lastProjectFilterKey && lastProjectFilterKey !== filterKey) {
      lastProjectFilterKey = filterKey;
      if (projectsPage !== 1) {
        projectsPage = 1;
        return;
      }
    } else {
      lastProjectFilterKey = filterKey;
    }
    const timeout = window.setTimeout(
      () => void reloadProjects(),
      queries.projetos.trim() ? 250 : 0,
    );
    return () => window.clearTimeout(timeout);
  });

  $effect(() => {
    const sentinel = loadMoreSentinel;
    if (!sentinel || !activeHasMore || activeLoading || activeError) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) loadNextPage();
      },
      { rootMargin: "240px 0px" },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  });
</script>

<svelte:head><title>Registros · Demanda</title></svelte:head>

<TabSystem
  items={tabs}
  bind:value={activeTab}
  onchange={navigateToTab}
  ariaLabel="Tipos de registros"
  idPrefix="records"
  class="records-page records-tab-system"
  tabListClass="records-tabs"
  tabClass="records-tab"
  panelClass="records-panel"
>
  <div class="records-filters">
    <FilterBar
      options={filterOptions}
      bind:selected={filters[activeTab]}
      bind:query={queries[activeTab]}
      placeholder={activeConfig.placeholder}
      showTitle={false}
    />
  </div>

  {#if activeTab === "pessoas" && contactsError && !cards.length}
    <div class="empty-state" role="alert">
      <strong>Não foi possível carregar os contatos</strong>
      <p>{contactsError}</p>
      <button type="button" onclick={() => void reloadContacts()}
        >Tentar novamente</button
      >
    </div>
  {:else if activeTab === "pessoas" && contactsLoading && !cards.length}
    <div class="empty-state" aria-live="polite">
      <strong>Carregando contatos…</strong>
    </div>
  {:else if activeTab === "negocios" && businessesError && !cards.length}
    <div class="empty-state" role="alert">
      <strong>Não foi possível carregar os negócios</strong>
      <p>{businessesError}</p>
      <button type="button" onclick={() => void reloadBusinesses()}
        >Tentar novamente</button
      >
    </div>
  {:else if activeTab === "negocios" && businessesLoading && !cards.length}
    <div class="empty-state" aria-live="polite">
      <strong>Carregando negócios…</strong>
    </div>
  {:else if activeTab === "projetos" && projectsError && !cards.length}
    <div class="empty-state" role="alert">
      <strong>Não foi possível carregar os projetos</strong>
      <p>{projectsError}</p>
      <button type="button" onclick={() => void reloadProjects()}
        >Tentar novamente</button
      >
    </div>
  {:else if activeTab === "projetos" && projectsLoading && !cards.length}
    <div class="empty-state" aria-live="polite">
      <strong>Carregando projetos…</strong>
    </div>
  {:else if activeTab === "tarefas" && tasksError && !cards.length}
    <div class="empty-state" role="alert">
      <strong>Não foi possível carregar as tarefas</strong>
      <p>{tasksError}</p>
      <button type="button" onclick={() => void reloadTasks()}
        >Tentar novamente</button
      >
    </div>
  {:else if activeTab === "tarefas" && tasksLoading && !cards.length}
    <div class="empty-state" aria-live="polite">
      <strong>Carregando tarefas…</strong>
    </div>
  {:else}
    <EntityCardList
      items={cards}
      ariaLabel={`Cards de ${tabs.find((tab) => tab.id === activeTab)?.label ?? "registros"}`}
      createKey={activeConfig.config.key}
      createLabel={activeConfig.createLabel}
    />
    {#if !cards.length}
      <div class="empty-state empty-state--with-create">
        <strong>Nenhum {activeConfig.emptyLabel} encontrado</strong>
        <p>Ajuste o filtro ou limpe a busca para ver outros registros.</p>
      </div>
    {/if}
  {/if}

  {#if cards.length && activeHasMore && !activeLoading && !activeError}
    <div
      class="load-more-sentinel"
      bind:this={loadMoreSentinel}
      aria-hidden="true"
    ></div>
  {/if}
</TabSystem>

<style>
  .records-filters {
    margin-bottom: 16px;
  }
  .empty-state {
    display: grid;
    min-height: 250px;
    place-content: center;
    justify-items: center;
    padding: 32px;
    color: var(--ink-500);
    text-align: center;
  }
  .empty-state strong {
    color: var(--ink-800);
    font-size: var(--text-md);
  }
  .empty-state p {
    margin-top: 5px;
    font-size: var(--text-sm);
  }
  .empty-state--with-create {
    min-height: 160px;
  }
  .empty-state button {
    min-height: 36px;
    padding: 0 12px;
    border: 1px solid var(--border);
    border-radius: 9px;
    color: var(--ink-700);
    background: var(--surface);
    font-weight: 600;
  }
  .empty-state button {
    margin-top: 14px;
  }
  .load-more-sentinel {
    width: 100%;
    height: 1px;
  }
</style>
