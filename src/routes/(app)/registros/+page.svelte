<script lang="ts">
  import { goto } from "$app/navigation";
  import { page } from "$app/state";
  import {
    recordsTabConfigs as tabConfigs,
    recordsTabFromPath as tabFromPath,
    recordsTabRoutes as tabRoutes,
    recordsTabs as tabs,
  } from "$lib/records/config";
  import { businessRecordsDomain } from "$lib/records/domains/businesses";
  import { contactRecordsDomain } from "$lib/records/domains/contacts";
  import { projectRecordsDomain } from "$lib/records/domains/projects";
  import { taskRecordsDomain } from "$lib/records/domains/tasks";
  import {
    createInitialPaginatedRecordsState,
    createPaginatedRecordsController,
  } from "$lib/records/pagination";
  import type { RecordsOrderBy, RecordsTab } from "$lib/records/types";
  import type { EntityRecord } from "$lib/entities/types";
  import {
    currentSettings,
    loadSettingsFromServer,
  } from "$lib/settings/client";
  import EntityCardList from "$lib/ui/EntityCardList.svelte";
  import FilterBar, { type FilterOption } from "$lib/ui/FilterBar.svelte";
  import TabSystem from "$lib/ui/TabSystem.svelte";
  import {
    loadWorkspaceUsers,
    observeWorkspaces,
    type WorkspaceUser,
  } from "$lib/workspaces/workspace-storage";
  import { onMount } from "svelte";

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
  const recordsPageSize = 10;
  let contactsState = $state(
    createInitialPaginatedRecordsState({
      ...contactRecordsDomain.initialFacets,
    }),
  );
  let contactsPage = $state(1);
  const contactsController = createPaginatedRecordsController({
    pageSize: recordsPageSize,
    initialFacets: { ...contactRecordsDomain.initialFacets },
    load: contactRecordsDomain.list,
    errorMessage: contactRecordsDomain.errorMessage,
    onChange: (state) => {
      contactsState = state;
      contactsPage = state.page;
    },
  });
  let contactsInitialized = $state(false);
  let lastContactFilterKey = "";
  let businessesPage = $state(1);
  let businessesTotal = $state(0);
  let businessesTotalPages = $state(1);
  let businessesLoading = $state(false);
  let businessesError = $state("");
  let businessesFacets = $state({ ...businessRecordsDomain.initialFacets });
  let businessesInitialized = $state(false);
  let lastBusinessFilterKey = "";
  let businessesAbortController: AbortController | undefined;
  let projectsPage = $state(1);
  let projectsTotal = $state(0);
  let projectsTotalPages = $state(1);
  let projectsLoading = $state(false);
  let projectsError = $state("");
  let projectsFacets = $state({ ...projectRecordsDomain.initialFacets });
  let projectsInitialized = $state(false);
  let lastProjectFilterKey = "";
  let projectsAbortController: AbortController | undefined;
  let tasksPage = $state(1);
  let tasksTotal = $state(0);
  let tasksTotalPages = $state(1);
  let tasksLoading = $state(false);
  let tasksError = $state("");
  let tasksFacets = $state({ ...taskRecordsDomain.initialFacets });
  let tasksInitialized = $state(false);
  let lastTaskFilterKey = "";
  let tasksAbortController: AbortController | undefined;
  let loadMoreSentinel = $state<HTMLDivElement>();

  let activeConfig = $derived(tabConfigs[activeTab]);
  let scopedRecords = $derived(
    activeTab === "pessoas" ? contactsState.items : records[activeTab],
  );
  let filterOptions = $derived.by((): FilterOption[] => {
    if (activeTab === "pessoas")
      return contactRecordsDomain.filterOptions(
        activeConfig,
        contactsState.facets,
      );
    if (activeTab === "negocios")
      return businessRecordsDomain.filterOptions(
        activeConfig,
        businessesFacets,
      );
    if (activeTab === "projetos")
      return projectRecordsDomain.filterOptions(activeConfig, projectsFacets);
    return taskRecordsDomain.filterOptions(activeConfig, tasksFacets);
  });
  let visibleRecords = $derived(scopedRecords);
  let cards = $derived(
    visibleRecords.map((record) =>
      activeTab === "pessoas"
        ? contactRecordsDomain.toCard(activeConfig, record, workspaceUsers)
        : activeTab === "negocios"
          ? businessRecordsDomain.toCard(activeConfig, record, workspaceUsers)
          : activeTab === "projetos"
            ? projectRecordsDomain.toCard(activeConfig, record, workspaceUsers)
            : taskRecordsDomain.toCard(activeConfig, record, workspaceUsers),
    ),
  );
  let activeLoading = $derived(
    activeTab === "pessoas"
      ? contactsState.loading
      : activeTab === "negocios"
        ? businessesLoading
        : activeTab === "projetos"
          ? projectsLoading
          : tasksLoading,
  );
  let activeError = $derived(
    activeTab === "pessoas"
      ? contactsState.error
      : activeTab === "negocios"
        ? businessesError
        : activeTab === "projetos"
          ? projectsError
          : tasksError,
  );
  let activeHasMore = $derived(
    activeTab === "pessoas"
      ? contactsState.page < contactsState.totalPages
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
      contactsController.advancePage();
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

  async function reloadContacts(): Promise<void> {
    await contactsController.reload({
      query: queries.pessoas,
      filter: filters.pessoas,
      orderBy: recordsOrderBy,
      showArchived: recordsShowArchived,
    });
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
      const result = await businessRecordsDomain.list({
        page: requestedPage,
        pageSize: recordsPageSize,
        query: queries.negocios,
        filter: filters.negocios,
        orderBy: recordsOrderBy,
        showArchived: recordsShowArchived,
        signal: controller.signal,
      });
      if (controller.signal.aborted) return;

      if (result.totalPages > 0 && requestedPage > result.totalPages) {
        businessesPage = result.totalPages;
        return;
      }
      const incoming = result.items;
      records.negocios =
        requestedPage === 1
          ? incoming
          : mergeRecords(records.negocios, incoming);
      businessesTotal = result.total;
      businessesTotalPages = Math.max(1, result.totalPages);
      businessesFacets = result.facets;
    } catch (cause) {
      if (controller.signal.aborted) return;
      businessesError = businessRecordsDomain.errorMessage(cause);
      if (requestedPage === 1) records.negocios = [];
    } finally {
      if (businessesAbortController === controller) businessesLoading = false;
    }
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
      const result = await projectRecordsDomain.list({
        page: requestedPage,
        pageSize: recordsPageSize,
        query: queries.projetos,
        filter: filters.projetos,
        orderBy: recordsOrderBy,
        showArchived: recordsShowArchived,
        signal: controller.signal,
      });
      if (controller.signal.aborted) return;

      if (result.totalPages > 0 && requestedPage > result.totalPages) {
        projectsPage = result.totalPages;
        return;
      }
      const incoming = result.items;
      records.projetos =
        requestedPage === 1
          ? incoming
          : mergeRecords(records.projetos, incoming);
      projectsTotal = result.total;
      projectsTotalPages = Math.max(1, result.totalPages);
      projectsFacets = result.facets;
    } catch (cause) {
      if (controller.signal.aborted) return;
      projectsError = projectRecordsDomain.errorMessage(cause);
      if (requestedPage === 1) records.projetos = [];
    } finally {
      if (projectsAbortController === controller) projectsLoading = false;
    }
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
      const result = await taskRecordsDomain.list({
        page: requestedPage,
        pageSize: recordsPageSize,
        query: queries.tarefas,
        filter: filters.tarefas,
        orderBy: recordsOrderBy,
        showArchived: recordsShowArchived,
        signal: controller.signal,
      });
      if (controller.signal.aborted) return;
      if (result.totalPages > 0 && requestedPage > result.totalPages) {
        tasksPage = result.totalPages;
        return;
      }
      const incoming = result.items;
      records.tarefas =
        requestedPage === 1
          ? incoming
          : mergeRecords(records.tarefas, incoming);
      tasksTotal = result.total;
      tasksTotalPages = Math.max(1, result.totalPages);
      tasksFacets = result.facets;
    } catch (cause) {
      if (controller.signal.aborted) return;
      tasksError = taskRecordsDomain.errorMessage(cause);
      if (requestedPage === 1) records.tarefas = [];
    } finally {
      if (tasksAbortController === controller) tasksLoading = false;
    }
  }

  function applyRecordSettings(
    settings: ReturnType<typeof currentSettings>,
  ): void {
    activeTab =
      tabFromPath(page.url.pathname) ?? settings.recordsDefaultTab ?? activeTab;
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
    const stopContacts = contactRecordsDomain.observe(
      () => void reloadContacts(),
    );
    const stopBusinesses = businessRecordsDomain.observe(
      () => void reloadBusinesses(),
    );
    const stopProjects = projectRecordsDomain.observe(
      () => void reloadProjects(),
    );
    const stopTasks = taskRecordsDomain.observe(() => void reloadTasks());
    const stopWorkspaces = observeWorkspaces(refreshWorkspace);
    contactsInitialized = true;
    businessesInitialized = true;
    projectsInitialized = true;
    tasksInitialized = true;
    return () => {
      contactsController.dispose();
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
      if (contactsController.resetPage()) return;
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

  {#if activeTab === "pessoas" && contactsState.error && !cards.length}
    <div class="empty-state" role="alert">
      <strong>Não foi possível carregar os contatos</strong>
      <p>{contactsState.error}</p>
      <button type="button" onclick={() => void reloadContacts()}
        >Tentar novamente</button
      >
    </div>
  {:else if activeTab === "pessoas" && contactsState.loading && !cards.length}
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
