<script lang="ts">
  import { replaceState } from "$app/navigation";
  import { page } from "$app/state";
  import { onMount } from "svelte";
  import {
    BadgeDollarSign,
    Check,
    Minus,
    Pause,
    Pencil,
    Play,
    Plus,
    Search,
    Trash2,
  } from "@lucide/svelte";
  import FinanceEntryModal from "$lib/finance/FinanceEntryModal.svelte";
  import {
    FinanceApiError,
    changeFinanceEntryState,
    createFinanceEntry,
    deleteFinanceEntry,
    financeEntriesFromSnapshot,
    loadFinancialSnapshot,
    updateFinanceEntry,
  } from "$lib/finance/client";
  import {
    currentSettings,
    loadSettingsFromServer,
  } from "$lib/settings/client";
  import TabSystem from "$lib/ui/TabSystem.svelte";
  import PageHeader from "$lib/ui/PageHeader.svelte";
  import type { TabItem } from "$lib/ui/Tabs.svelte";
  import {
    GLOBAL_WORKSPACE_ID,
    loadActiveWorkspaceId,
    observeWorkspaces,
    PERSONAL_WORKSPACE_ID,
  } from "$lib/workspaces/workspace-storage";
  import {
    formatFinanceDate,
    formatMoney,
    formatMonth,
    normalizeSearch,
    type FinanceEntry,
    type FinanceEntryDraft,
    type FinanceEntryMode,
    type FinanceEntryType,
  } from "$lib/finance/finance";

  type FinanceTab = "painel" | "receitas" | "despesas";
  type FinanceFilter = "todas" | FinanceEntryMode;
  type DashboardMetric = {
    label: string;
    value: string;
    helper: string;
    variant: "soft" | "solid";
    tone?: "success" | "danger" | "warning" | "info";
  };

  const financeTabs: TabItem[] = [
    { id: "painel", label: "Painel" },
    { id: "receitas", label: "Receitas" },
    { id: "despesas", label: "Despesas" },
  ];
  function shiftMonth(value: string, offset: number): string {
    const [year, month] = value.split("-").map(Number);
    const date = new Date(Date.UTC(year, month - 1 + offset, 1));
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
  }

  function currentMonth(): string {
    const today = new Date();
    return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;
  }

  function isFinanceTab(value: string): value is FinanceTab {
    return value === "painel" || value === "receitas" || value === "despesas";
  }

  function configuredPlanningMonths(value: string): 3 | 6 | 12 {
    if (value === "6") return 6;
    if (value === "12") return 12;
    return 3;
  }

  let entries = $state<FinanceEntry[]>([]);
  let activeTab = $state<FinanceTab>("painel");
  let selectedMonth = $state(currentMonth());
  let planningStartMonth = $state(currentMonth());
  let planningMonths = $state<3 | 6 | 12>(3);
  let showSettled = $state(true);
  let showPaused = $state(true);
  let showDashboardValues = $state(true);
  let initialized = $state(false);
  let search = $state("");
  let modeFilter = $state<FinanceFilter>("todas");
  let modalType = $state<FinanceEntryType | null>(null);
  let editingEntry = $state<FinanceEntry | null>(null);
  let message = $state("");
  let financeLoading = $state(false);
  let activeWorkspaceId = $state(PERSONAL_WORKSPACE_ID);

  const editingInstallmentEntries = $derived.by(() => {
    if (!editingEntry?.installmentGroupId) return [];
    return entries.filter(
      (entry) =>
        entry.workspaceId === editingEntry?.workspaceId &&
        entry.installmentGroupId === editingEntry?.installmentGroupId,
    );
  });

  function applyFinanceSettings(
    settings: ReturnType<typeof currentSettings>,
  ): void {
    const thisMonth = currentMonth();
    const requestedMonth = page.url.searchParams.get("month");
    const initialMonth =
      settings.financeInitialPeriod === "last" &&
      requestedMonth &&
      /^\d{4}-\d{2}$/.test(requestedMonth)
        ? requestedMonth
        : thisMonth;
    activeWorkspaceId = loadActiveWorkspaceId();
    selectedMonth = initialMonth;
    planningStartMonth = initialMonth;
    planningMonths = configuredPlanningMonths(settings.financePlanningMonths);
    showSettled = settings.financeShowSettled;
    showPaused = settings.financeShowPaused;
    showDashboardValues = settings.financeShowDashboardValues;
    activeTab = isFinanceTab(settings.financeDefaultTab)
      ? settings.financeDefaultTab
      : "painel";
  }

  onMount(() => {
    applyFinanceSettings(currentSettings());
    void loadSettingsFromServer()
      .then(applyFinanceSettings)
      .catch(() => undefined);
    activeWorkspaceId = loadActiveWorkspaceId();
    void reloadFinance();
    const requestedTab = page.url.searchParams.get("tab");
    if (requestedTab && isFinanceTab(requestedTab)) {
      activeTab = requestedTab;
    }
    initialized = true;
    return observeWorkspaces(() => {
      activeWorkspaceId = loadActiveWorkspaceId();
      message = "";
      editingEntry = null;
      modalType = null;
      void reloadFinance();
    });
  });

  async function reloadFinance(): Promise<void> {
    financeLoading = true;
    try {
      entries = financeEntriesFromSnapshot(await loadFinancialSnapshot());
      message = "";
    } catch (cause) {
      entries = [];
      message =
        cause instanceof FinanceApiError
          ? cause.message
          : "Não foi possível carregar o Financeiro.";
    } finally {
      financeLoading = false;
    }
  }

  $effect(() => {
    if (!initialized) return;
    const url = new URL(page.url);
    url.searchParams.set("month", selectedMonth);
    replaceState(url, page.state);
  });

  const workspaceEntries = $derived(
    entries.filter(
      (entry) =>
        activeWorkspaceId === GLOBAL_WORKSPACE_ID ||
        entry.workspaceId === activeWorkspaceId,
    ),
  );

  const monthEntries = $derived(
    workspaceEntries
      .filter((entry) => entry.date.startsWith(selectedMonth))
      .toSorted((a, b) => a.date.localeCompare(b.date)),
  );
  const visibleMonthEntries = $derived(monthEntries.filter(isEntryVisible));
  const receipts = $derived(
    monthEntries.filter((entry) => entry.type === "receita"),
  );
  const expenses = $derived(
    monthEntries.filter((entry) => entry.type === "despesa"),
  );
  const received = $derived(receipts.filter((entry) => entry.settled));
  const paid = $derived(expenses.filter((entry) => entry.settled));
  const openReceipts = $derived(
    receipts.filter((entry) => !entry.settled && !entry.paused),
  );
  const openExpenses = $derived(
    expenses.filter((entry) => !entry.settled && !entry.paused),
  );
  const receiptTotal = $derived(
    receipts.reduce((sum, entry) => sum + entry.amount, 0),
  );
  const expenseTotal = $derived(
    expenses.reduce((sum, entry) => sum + entry.amount, 0),
  );
  const receivedTotal = $derived(
    received.reduce((sum, entry) => sum + entry.amount, 0),
  );
  const paidTotal = $derived(
    paid.reduce((sum, entry) => sum + entry.amount, 0),
  );
  const expectedReceiptTotal = $derived(receiptTotal);
  const expectedExpenseTotal = $derived(expenseTotal);

  const previousMonthLabel = $derived.by(() => {
    const [year, month] = selectedMonth.split("-").map(Number);
    const previous = new Date(Date.UTC(year, month - 2, 1));
    const label = new Intl.DateTimeFormat("pt-BR", {
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    }).format(previous);
    return label.charAt(0).toUpperCase() + label.slice(1);
  });

  const dashboardMetrics = $derived.by<DashboardMetric[]>(() => {
    const currentBalance = receivedTotal - paidTotal;
    const expectedBalance = expectedReceiptTotal - expectedExpenseTotal;
    return [
      {
        label: "Receitas a receber",
        value: dashboardMoney(
          Math.max(0, expectedReceiptTotal - receivedTotal),
        ),
        helper: `${openReceipts.length} itens em aberto`,
        variant: "soft",
      },
      {
        label: "Despesas a pagar",
        value: dashboardMoney(Math.max(0, expectedExpenseTotal - paidTotal)),
        helper: `${openExpenses.length} itens em aberto`,
        variant: "soft",
      },
      {
        label: "Balanço anterior",
        value: dashboardMoney(0),
        helper: `receitas - despesas de ${previousMonthLabel}`,
        variant: "soft",
      },
      {
        label: "Saldo anterior",
        value: dashboardMoney(0),
        helper: `resultado de ${previousMonthLabel}`,
        variant: "soft",
      },
      {
        label: "Receitas recebidas",
        value: dashboardMoney(receivedTotal),
        helper: `${received.length} itens recebidos`,
        variant: "solid",
        tone: "success",
      },
      {
        label: "Despesas pagas",
        value: dashboardMoney(paidTotal),
        helper: `${paid.length} itens pagos`,
        variant: "solid",
        tone: "danger",
      },
      {
        label: "Balanço atual",
        value: dashboardMoney(currentBalance),
        helper: "recebidas - pagas",
        variant: "solid",
        tone: "warning",
      },
      {
        label: "Caixa atual",
        value: dashboardMoney(currentBalance),
        helper: "saldo anterior + balanço atual",
        variant: "solid",
        tone: "info",
      },
      {
        label: "Receitas totais",
        value: dashboardMoney(expectedReceiptTotal),
        helper: "recebidas + a receber",
        variant: "soft",
      },
      {
        label: "Despesas totais",
        value: dashboardMoney(expectedExpenseTotal),
        helper: "pagas + a pagar",
        variant: "soft",
      },
      {
        label: "Balanço previsto",
        value: dashboardMoney(expectedBalance),
        helper: "receitas totais - despesas totais",
        variant: "soft",
      },
      {
        label: "Saldo previsto",
        value: dashboardMoney(expectedBalance),
        helper: "saldo anterior + balanço previsto",
        variant: "soft",
      },
    ];
  });

  const planning = $derived.by(() =>
    Array.from({ length: planningMonths }, (_, index) => {
      const month = shiftMonth(planningStartMonth, index);
      const scopedEntries = workspaceEntries.filter((entry) =>
        entry.date.startsWith(month),
      );
      const receita = scopedEntries
        .filter((entry) => entry.type === "receita")
        .reduce((sum, entry) => sum + entry.amount, 0);
      const despesa = scopedEntries
        .filter((entry) => entry.type === "despesa")
        .reduce((sum, entry) => sum + entry.amount, 0);
      return {
        month,
        receita,
        despesa,
      };
    }),
  );

  const activeType = $derived<FinanceEntryType>(
    activeTab === "despesas" ? "despesa" : "receita",
  );
  const activeTypeEntries = $derived(
    activeType === "receita" ? receipts : expenses,
  );
  const filteredEntries = $derived.by(() => {
    const query = normalizeSearch(search.trim());
    return activeTypeEntries.filter((entry) => {
      const matchesMode = modeFilter === "todas" || entry.mode === modeFilter;
      const haystack = normalizeSearch(
        [entry.title, entry.category, entry.businessName, entry.notes]
          .filter(Boolean)
          .join(" "),
      );
      return (
        isEntryVisible(entry) &&
        matchesMode &&
        (!query || haystack.includes(query))
      );
    });
  });

  function isEntryVisible(entry: FinanceEntry): boolean {
    return (showSettled || !entry.settled) && (showPaused || !entry.paused);
  }

  function dashboardMoney(value: number): string {
    return showDashboardValues ? formatMoney(value) : "••••••";
  }

  const activeSummary = $derived.by(() => {
    if (activeType === "receita") {
      return [
        ["Receitas totais", expectedReceiptTotal],
        ["Receitas recebidas", receivedTotal],
        [
          "Receitas restantes",
          Math.max(0, expectedReceiptTotal - receivedTotal),
        ],
      ] as const;
    }
    return [
      ["Despesas totais", expectedExpenseTotal],
      ["Despesas pagas", paidTotal],
      ["Despesas restantes", Math.max(0, expectedExpenseTotal - paidTotal)],
    ] as const;
  });

  function openCreate(type: FinanceEntryType): void {
    editingEntry = null;
    modalType = type;
  }

  function openEdit(entry: FinanceEntry): void {
    if (entry.source === "projeto") {
      message = "Edite este lançamento no projeto de origem.";
      return;
    }
    editingEntry = entry;
    modalType = entry.type;
  }

  function closeModal(): void {
    modalType = null;
    editingEntry = null;
  }

  async function runMutation(
    operation: () => ReturnType<typeof loadFinancialSnapshot>,
    successMessage: string,
  ): Promise<boolean> {
    financeLoading = true;
    try {
      entries = financeEntriesFromSnapshot(await operation());
      message = successMessage;
      return true;
    } catch (cause) {
      const failureMessage =
        cause instanceof FinanceApiError
          ? cause.message
          : "Não foi possível concluir a operação financeira.";
      await reloadFinance();
      message = failureMessage;
      return false;
    } finally {
      financeLoading = false;
    }
  }

  async function saveEntry(draft: FinanceEntryDraft): Promise<void> {
    const current = editingEntry;
    const saved = await runMutation(
      () =>
        current
          ? updateFinanceEntry(current.id, current.version, draft)
          : createFinanceEntry(draft),
      `${draft.type === "receita" ? "Receita" : "Despesa"} salva com sucesso.`,
    );
    if (!saved) return;
    selectedMonth = (draft.installments?.[0]?.dueDate ?? draft.date).slice(
      0,
      7,
    );
    activeTab = draft.type === "receita" ? "receitas" : "despesas";
    syncTabUrl(activeTab);
    closeModal();
  }

  async function settle(entry: FinanceEntry): Promise<void> {
    await runMutation(
      () => changeFinanceEntryState(entry.id, entry.version, "settle"),
      entry.type === "receita"
        ? "Receita marcada como recebida."
        : "Despesa marcada como paga.",
    );
  }

  async function togglePause(entry: FinanceEntry): Promise<void> {
    await runMutation(
      () =>
        changeFinanceEntryState(
          entry.id,
          entry.version,
          entry.paused ? "resume" : "pause",
        ),
      entry.paused ? "Lançamento retomado." : "Lançamento pausado.",
    );
  }

  async function removeEntry(entry: FinanceEntry): Promise<void> {
    await runMutation(
      () => deleteFinanceEntry(entry.id, entry.version),
      "Lançamento excluído.",
    );
  }

  function selectTab(tab: FinanceTab): void {
    activeTab = tab;
    search = "";
    modeFilter = "todas";
    message = "";
    syncTabUrl(tab);
  }

  function syncTabUrl(tab: FinanceTab): void {
    const url = new URL(page.url);
    if (tab === "painel") url.searchParams.delete("tab");
    else url.searchParams.set("tab", tab);
    replaceState(url, page.state);
  }
</script>

<svelte:head><title>Financeiro · Demanda</title></svelte:head>

<PageHeader
  eyebrow="Financeiro"
  title={formatMonth(selectedMonth)}
  icon={BadgeDollarSign}
>
  {#snippet actions()}
    <div class="hero-actions" aria-label="Ações rápidas do financeiro">
      <button
        class="action-button revenue"
        type="button"
        onclick={() => openCreate("receita")}
        ><Plus size={17} />Nova receita</button
      >
      <button
        class="action-button expense"
        type="button"
        onclick={() => openCreate("despesa")}
        ><Minus size={17} />Nova despesa</button
      >
    </div>
  {/snippet}
</PageHeader>

<section class="finance-page" aria-label="Finanças" aria-busy={financeLoading}>
  {#if message}
    <div class="finance-alert" role="status">{message}</div>
  {/if}

  <TabSystem
    items={financeTabs}
    bind:value={activeTab}
    ariaLabel="Menus de finanças"
    idPrefix="finance"
    class="finance-shell finance-tab-system"
    tabListClass="finance-tabs"
    tabClass="finance-tab"
    panelClass="finance-panel"
    onchange={(value) => selectTab(value as FinanceTab)}
  >
    {#if activeTab === "painel"}
      <section class="dashboard-matrix" aria-label="Resumo financeiro do mês">
        {#each dashboardMetrics as metric}
          <article
            class:solid={metric.variant === "solid"}
            class:success={metric.tone === "success"}
            class:danger={metric.tone === "danger"}
            class:warning={metric.tone === "warning"}
            class:info={metric.tone === "info"}
            class="dashboard-card"
          >
            <span>{metric.label}</span>
            <strong>{metric.value}</strong>
            <small>{metric.helper}</small>
          </article>
        {/each}
      </section>

      <article class="content-card planning-card">
        <header class="card-header">
          <div>
            <p>Planejamento</p>
            <h2>Horizonte de {planningMonths} meses</h2>
          </div>
        </header>
        <div class="planning-grid">
          {#each planning as item}
            <button
              class:active={selectedMonth === item.month}
              class="plan"
              type="button"
              onclick={() => (selectedMonth = item.month)}
            >
              <strong class="plan-title">{formatMonth(item.month)}</strong>
              <span
                ><span>Receitas:</span><strong
                  >{dashboardMoney(item.receita)}</strong
                ></span
              >
              <span
                ><span>Despesas:</span><strong
                  >{dashboardMoney(item.despesa)}</strong
                ></span
              >
              <span class="balance"
                ><span>Balanço:</span><strong
                  >{dashboardMoney(item.receita - item.despesa)}</strong
                ></span
              >
            </button>
          {/each}
        </div>
      </article>

      <article class="content-card upcoming-card">
        <header class="card-header"><h2>Próximos lançamentos</h2></header>
        {#if visibleMonthEntries.length}
          <div class="upcoming-list">
            {#each visibleMonthEntries.slice(0, 4) as entry}
              <article class="upcoming-row">
                <strong>{entry.title}</strong>
                <span
                  >{entry.paused
                    ? "Pausada"
                    : entry.settled
                      ? entry.type === "receita"
                        ? "Recebida"
                        : "Paga"
                      : entry.type === "receita"
                        ? "Receita"
                        : "Despesa"}</span
                >
                <strong>{dashboardMoney(entry.amount)}</strong>
                <span>{formatFinanceDate(entry.date)}</span>
              </article>
            {/each}
          </div>
        {:else}
          <p class="empty">
            Nenhum lançamento em aberto encontrado nos próximos meses.
          </p>
        {/if}
      </article>
    {:else}
      <section class="list-toolbar" aria-label={`Filtros de ${activeTab}`}>
        <label class="search-field">
          <Search size={18} aria-hidden="true" />
          <input
            type="search"
            placeholder={`Buscar ${activeTab}`}
            aria-label={`Buscar ${activeTab}`}
            bind:value={search}
          />
        </label>
        <div
          class="status-filters"
          role="group"
          aria-label={`Selecionar tipo de ${activeType === "receita" ? "receita" : "despesa"}`}
        >
          {#each [{ key: "todas", label: "Todas" }, { key: "pontual", label: "Pontuais" }, { key: "fixa", label: "Fixas" }] as filter}
            <button
              class:active={modeFilter === filter.key}
              type="button"
              aria-pressed={modeFilter === filter.key}
              onclick={() => (modeFilter = filter.key as FinanceFilter)}
              >{filter.label}</button
            >
          {/each}
        </div>
      </section>

      <section class="mini-summary">
        {#each activeSummary as item}
          <article>
            <span>{item[0]}</span><strong>{formatMoney(item[1])}</strong>
          </article>
        {/each}
      </section>

      <article class="content-card month-card">
        <header class="card-header month-heading">
          <h2>{activeType === "receita" ? "Receitas" : "Despesas"} do mês</h2>
          <p>
            {filteredEntries.length} lançamento(s) · {formatMoney(
              activeType === "receita"
                ? expectedReceiptTotal
                : expectedExpenseTotal,
            )}
          </p>
        </header>

        {#if filteredEntries.length}
          <div class="month-list">
            {#each filteredEntries as entry (entry.id)}
              <article
                class:revenue={entry.type === "receita"}
                class:expense={entry.type === "despesa"}
                class:paused={entry.paused}
                class="month-item"
              >
                <div class="entry-content">
                  <div class="entry-top">
                    <strong>{entry.title}</strong>
                    <span
                      class:settled={entry.settled}
                      class:paused={entry.paused}
                      class="payment-status"
                    >
                      {entry.paused
                        ? "Pausada"
                        : entry.settled
                          ? entry.type === "receita"
                            ? "Recebida"
                            : "Paga"
                          : entry.type === "receita"
                            ? "A receber"
                            : "A pagar"}
                    </span>
                  </div>
                  <p class="entry-meta">
                    <span>{formatFinanceDate(entry.date)}</span>
                    <span>{entry.mode === "pontual" ? "Pontual" : "Fixa"}</span>
                    {#if entry.installmentsCount && entry.installmentNumber}
                      <span
                        >Parcela {entry.installmentNumber}/{entry.installmentsCount}</span
                      >
                    {/if}
                    {#if entry.detail}<span>{entry.detail}</span>{/if}
                    {#if entry.businessName}<span>{entry.businessName}</span
                      >{/if}
                    {#if entry.source === "projeto"}<a href="/registros"
                        >abrir projeto</a
                      >{/if}
                  </p>
                </div>

                <strong class="entry-amount">{formatMoney(entry.amount)}</strong
                >

                <div class="entry-actions">
                  {#if !entry.settled && !entry.paused}
                    <button
                      class="mini-button"
                      type="button"
                      onclick={() => settle(entry)}
                      ><Check size={15} />{entry.type === "receita"
                        ? "Receber"
                        : "Pagar"}</button
                    >
                  {/if}
                  {#if entry.source === "manual" && entry.mode === "pontual" && !entry.settled}
                    <button
                      class="mini-button"
                      type="button"
                      onclick={() => togglePause(entry)}
                    >
                      {#if entry.paused}<Play size={15} />Retomar{:else}<Pause
                          size={15}
                        />Pausar{/if}
                    </button>
                  {/if}
                  {#if entry.source === "manual"}
                    <button
                      class="mini-button"
                      type="button"
                      onclick={() => openEdit(entry)}
                      ><Pencil size={15} />Editar</button
                    >
                    <button
                      class="mini-button delete"
                      type="button"
                      onclick={() => removeEntry(entry)}
                      ><Trash2 size={15} />Excluir</button
                    >
                  {/if}
                </div>
              </article>
            {/each}
          </div>
        {:else}
          <p class="empty">
            Nenhuma {activeType === "receita"
              ? "receita encontrada"
              : "despesa encontrada"} neste mês.
          </p>
        {/if}
      </article>

      <article class="content-card upcoming-card">
        <header class="card-header"><h2>Lançamentos exibidos</h2></header>
        {#if filteredEntries.length}
          <div class="upcoming-list">
            {#each filteredEntries.slice(0, 6) as entry}
              <article class="upcoming-row">
                <strong>{entry.title}</strong>
                <span>{entry.mode === "pontual" ? "Pontual" : "Fixa"}</span>
                <strong>{formatMoney(entry.amount)}</strong>
                <span>{formatFinanceDate(entry.date)}</span>
              </article>
            {/each}
          </div>
        {:else}
          <p class="empty">
            Nenhuma {activeType === "receita" ? "receita" : "despesa"}
            corresponde à visualização configurada.
          </p>
        {/if}
      </article>
    {/if}
  </TabSystem>
</section>

{#if modalType}
  <FinanceEntryModal
    type={modalType}
    entry={editingEntry}
    installmentEntries={editingInstallmentEntries}
    onclose={closeModal}
    onsave={saveEntry}
  />
{/if}

<style>
  .finance-page {
    display: grid;
    gap: 14px;
  }
  .hero-actions {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .action-button {
    display: inline-flex;
    min-height: 40px;
    align-items: center;
    justify-content: center;
    gap: 8px;
    border: 1px solid transparent;
    border-radius: 10px;
    padding: 0 16px;
    color: #fff;
    font-size: var(--text-xs);
    font-weight: 700;
    transition:
      filter var(--motion-fast),
      transform var(--motion-fast);
  }
  .action-button:hover {
    filter: brightness(0.94);
    transform: translateY(-1px);
  }
  .action-button.revenue {
    background: var(--accent);
    box-shadow: 0 8px 18px rgba(34, 139, 94, 0.18);
  }
  .action-button.expense {
    background: var(--danger);
    box-shadow: 0 8px 18px rgba(220, 38, 38, 0.16);
  }
  .finance-alert {
    padding: 11px 14px;
    border: 1px solid rgba(93, 172, 131, 0.35);
    border-radius: 12px;
    color: #276749;
    background: rgba(93, 172, 131, 0.12);
    font-size: var(--text-sm);
  }
  :global(.finance-panel) {
    display: grid;
    gap: 12px;
  }
  .dashboard-matrix {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 12px;
  }
  .dashboard-card {
    display: grid;
    min-width: 0;
    min-height: 124px;
    align-content: start;
    gap: 7px;
    padding: 20px;
    border: 1px solid var(--border);
    border-radius: 14px;
    background: linear-gradient(180deg, var(--panel), var(--surface-soft));
  }
  .dashboard-card span {
    color: var(--ink-500);
    font-size: var(--text-xs);
    font-weight: 600;
    letter-spacing: 0.025em;
    text-transform: uppercase;
  }
  .dashboard-card strong {
    color: var(--ink-950);
    font-size: var(--text-2xl);
    line-height: 1.08;
    overflow-wrap: anywhere;
  }
  .dashboard-card small {
    color: var(--ink-500);
    font-size: var(--text-sm);
    line-height: 1.35;
  }
  .dashboard-card.solid {
    border-color: transparent;
    color: #fff;
  }
  .dashboard-card.solid span,
  .dashboard-card.solid strong,
  .dashboard-card.solid small {
    color: #fff;
  }
  .dashboard-card.success {
    background: linear-gradient(135deg, #45bb78, #37b96f);
  }
  .dashboard-card.danger {
    background: linear-gradient(135deg, #f5262d, #ff2929);
  }
  .dashboard-card.warning {
    background: linear-gradient(135deg, #efc000, #e9bd00);
  }
  .dashboard-card.info {
    background: linear-gradient(135deg, #315fee, #4a7fe5);
  }
  .content-card {
    display: grid;
    gap: 14px;
    padding: 20px;
    border: 1px solid var(--border);
    border-radius: 14px;
    background: var(--panel);
  }
  .card-header {
    display: flex;
    align-items: start;
    justify-content: space-between;
    gap: 14px;
    flex-wrap: wrap;
  }
  .card-header p:first-child:not(:last-child) {
    margin-bottom: 6px;
    color: var(--ink-500);
    font-size: var(--text-xs);
    font-weight: 600;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }
  .card-header h2 {
    color: var(--ink-950);
    font-size: var(--text-2xl);
  }
  .planning-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
    gap: 12px;
  }
  .plan {
    display: grid;
    gap: 13px;
    border: 1px solid var(--border);
    border-radius: 14px;
    padding: 16px;
    color: inherit;
    background: var(--surface-soft);
    text-align: left;
    transition:
      border-color var(--motion-fast),
      background var(--motion-fast),
      transform var(--motion-fast);
  }
  .plan:hover {
    background: var(--surface-hover);
    transform: translateY(-1px);
  }
  .plan.active {
    border-color: rgba(46, 86, 255, 0.35);
    background: rgba(46, 86, 255, 0.09);
  }
  .plan-title {
    color: var(--ink-950);
    font-size: var(--text-lg);
  }
  .plan > span {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    color: var(--ink-500);
    font-size: var(--text-md);
  }
  .plan > span strong {
    color: var(--ink-950);
    text-align: right;
  }
  .plan .balance {
    margin-top: 1px;
    padding-top: 13px;
    border-top: 1px solid var(--border);
    color: var(--ink-950);
  }
  .plan .balance strong {
    font-size: var(--text-lg);
  }
  .upcoming-list {
    display: grid;
    border-top: 1px solid var(--border);
  }
  .upcoming-row {
    display: grid;
    grid-template-columns:
      minmax(0, 1.4fr) minmax(80px, 0.55fr) minmax(110px, auto)
      minmax(84px, auto);
    align-items: center;
    gap: 12px;
    padding: 9px 0;
    border-bottom: 1px solid var(--border);
    font-size: var(--text-sm);
  }
  .upcoming-row > strong {
    color: var(--ink-950);
    font-weight: 500;
    overflow-wrap: anywhere;
  }
  .upcoming-row > span {
    color: var(--ink-500);
  }
  .upcoming-row > :nth-child(3),
  .upcoming-row > :nth-child(4) {
    text-align: right;
    white-space: nowrap;
  }
  .list-toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
  }
  .search-field {
    display: flex;
    width: min(100%, 226px);
    min-height: 44px;
    align-items: center;
    gap: 9px;
    border: 1px solid var(--border);
    border-radius: var(--radius-pill);
    padding: 0 13px;
    color: var(--ink-500);
    background: var(--panel);
  }
  .search-field:focus-within {
    border-color: var(--primary);
    box-shadow: var(--focus-ring);
  }
  .search-field input {
    min-width: 0;
    flex: 1;
    border: 0;
    outline: 0;
    color: var(--ink-700);
    background: transparent;
    font: inherit;
  }
  .search-field input::placeholder {
    color: var(--ink-500);
  }
  .status-filters {
    display: inline-flex;
    min-height: 41px;
    align-items: center;
    gap: 2px;
    padding: 3px;
    border: 1px solid var(--border-strong);
    border-radius: var(--radius-pill);
    background: #e3ebf3;
  }
  .status-filters button {
    min-height: 33px;
    border: 0;
    border-radius: var(--radius-pill);
    padding: 0 15px;
    color: var(--ink-500);
    background: transparent;
    font-size: var(--text-sm);
    font-weight: 600;
  }
  .status-filters button.active {
    color: #315c73;
    background: var(--panel);
    box-shadow: 0 1px 4px rgba(15, 23, 42, 0.1);
  }
  .mini-summary {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 12px;
  }
  .mini-summary article {
    display: grid;
    gap: 9px;
    padding: 17px;
    border-radius: 14px;
    background: var(--surface-soft);
  }
  .mini-summary span {
    color: var(--ink-950);
    font-size: var(--text-md);
  }
  .mini-summary strong {
    color: var(--ink-950);
    font-size: var(--text-lg);
  }
  .month-heading {
    align-items: center;
  }
  .month-heading p {
    color: var(--ink-500);
    font-size: var(--text-sm);
  }
  .month-list {
    display: grid;
    gap: 10px;
  }
  .month-item {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto minmax(140px, auto);
    align-items: center;
    gap: 14px;
    padding: 14px 15px;
    border: 1px solid var(--border);
    border-left-width: 3px;
    border-radius: 12px;
    background: var(--panel);
  }
  .month-item.revenue {
    border-left-color: var(--accent);
  }
  .month-item.expense {
    border-left-color: var(--danger);
  }
  .month-item.paused {
    background: var(--surface-soft);
  }
  .entry-content {
    min-width: 0;
  }
  .entry-top {
    display: flex;
    align-items: center;
    gap: 9px;
    flex-wrap: wrap;
    margin-bottom: 7px;
  }
  .entry-top > strong {
    color: var(--ink-950);
    font-size: var(--text-md);
  }
  .revenue .entry-top > strong,
  .revenue .entry-amount {
    color: #177245;
  }
  .expense .entry-top > strong,
  .expense .entry-amount {
    color: var(--danger);
  }
  .payment-status {
    display: inline-flex;
    min-width: 88px;
    min-height: 29px;
    align-items: center;
    justify-content: center;
    border-radius: var(--radius-pill);
    padding: 0 11px;
    color: #216849;
    background: rgba(93, 172, 131, 0.14);
    font-size: var(--text-xs);
  }
  .expense .payment-status {
    color: #a31f27;
    background: rgba(220, 38, 38, 0.1);
  }
  .payment-status.settled {
    color: #216849;
    background: rgba(93, 172, 131, 0.14);
  }
  .payment-status.paused {
    color: var(--ink-500);
    background: var(--surface-hover);
  }
  .entry-meta {
    display: flex;
    align-items: center;
    gap: 6px 9px;
    flex-wrap: wrap;
    color: var(--ink-500);
    font-size: var(--text-sm);
  }
  .entry-meta a {
    color: var(--primary);
  }
  .entry-amount {
    justify-self: end;
    white-space: nowrap;
    font-size: var(--text-md);
  }
  .entry-actions {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 7px;
    flex-wrap: wrap;
  }
  .mini-button {
    display: inline-flex;
    min-height: 36px;
    align-items: center;
    justify-content: center;
    gap: 7px;
    border: 1px solid var(--border);
    border-radius: 9px;
    padding: 0 11px;
    color: var(--ink-950);
    background: var(--surface-soft);
    font-size: var(--text-sm);
    font-weight: 600;
  }
  .mini-button:hover {
    background: var(--surface-hover);
  }
  .mini-button.delete {
    border-color: rgba(220, 38, 38, 0.2);
    color: var(--danger);
    background: rgba(220, 38, 38, 0.07);
  }
  .empty {
    padding: 2px 0;
    color: var(--ink-500);
    font-size: var(--text-sm);
  }
  @media (max-width: 1180px) {
    .dashboard-matrix {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
    .planning-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
    .month-item {
      grid-template-columns: minmax(0, 1fr) auto;
    }
    .entry-actions {
      grid-column: 1 / -1;
      padding-top: 8px;
      border-top: 1px solid var(--border);
    }
  }
  @media (max-width: 760px) {
    .hero-actions {
      width: 100%;
    }
    .hero-actions button {
      flex: 1;
    }
    .dashboard-matrix,
    .planning-grid,
    .mini-summary {
      grid-template-columns: 1fr;
    }
    .list-toolbar {
      align-items: stretch;
      flex-direction: column;
    }
    .search-field {
      width: 100%;
    }
    .status-filters {
      align-self: flex-start;
    }
    .month-item,
    .upcoming-row {
      grid-template-columns: 1fr;
    }
    .entry-amount {
      justify-self: start;
    }
    .upcoming-row {
      gap: 4px;
    }
    .upcoming-row > :nth-child(3),
    .upcoming-row > :nth-child(4) {
      text-align: left;
    }
  }
  @media (max-width: 470px) {
    .hero-actions {
      flex-direction: column;
    }
    .hero-actions button {
      width: 100%;
    }
    .status-filters {
      width: 100%;
    }
    .status-filters button {
      flex: 1;
      padding-inline: 8px;
    }
    .entry-actions {
      align-items: stretch;
      flex-direction: column;
    }
    .mini-button {
      width: 100%;
    }
  }
</style>
