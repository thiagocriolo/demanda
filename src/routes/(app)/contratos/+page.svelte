<script lang="ts">
  import { getContext, onMount } from "svelte";
  import {
    FileText,
    Plus,
    RefreshCw,
    Repeat,
    Sparkles,
    Wallet,
  } from "@lucide/svelte";
  import {
    ContractApiError,
    listContracts,
    observeContracts,
    type Contract,
  } from "$lib/contracts/client";
  import ContractLedgerRow from "$lib/contracts/ContractLedgerRow.svelte";
  import {
    filterAndSortContracts,
    formatContractMoney,
    summarizeContractPortfolio,
    type ContractFilter,
    type ContractSort,
  } from "$lib/contracts/presentation";
  import {
    ENTITY_CREATE_CONTEXT,
    type EntityCreateContext,
  } from "$lib/entities/create-context";
  import type { EntityCardAction, EntityCardItem } from "$lib/ui/entity-card";
  import FilterBar, { type FilterOption } from "$lib/ui/FilterBar.svelte";
  import PageHeader from "$lib/ui/PageHeader.svelte";
  import {
    loadWorkspaces,
    observeWorkspaces,
    refreshWorkspaceSnapshot,
    type Workspace,
  } from "$lib/workspaces/workspace-storage";

  const entityCreate = getContext<EntityCreateContext | undefined>(
    ENTITY_CREATE_CONTEXT,
  );

  let contracts = $state<Contract[]>([]);
  let workspaces = $state<Workspace[]>([]);
  let loading = $state(true);
  let errorMessage = $state("");
  let filter = $state<ContractFilter>("active");
  let workspaceFilter = $state("all");
  let query = $state("");
  let sort = $state<ContractSort>("updated");
  let expandedIds = $state<Record<string, boolean>>({});
  let abortController: AbortController | undefined;

  const workspaceNames = $derived(
    new Map(workspaces.map((workspace) => [workspace.id, workspace.name])),
  );
  const portfolioScope = $derived(
    workspaceFilter === "all"
      ? contracts
      : contracts.filter(
          (contract) => contract.workspaceId === workspaceFilter,
        ),
  );
  const summary = $derived(summarizeContractPortfolio(portfolioScope));
  const visibleContracts = $derived(
    filterAndSortContracts(contracts, {
      filter,
      workspaceId: workspaceFilter,
      query,
      sort,
    }),
  );
  const visibleTotalCents = $derived(
    visibleContracts.reduce((sum, contract) => sum + contract.amountCents, 0),
  );
  const filterOptions = $derived<FilterOption[]>([
    { value: "active", label: "Todos", count: summary.activeCount },
    { value: "one_off", label: "Pontuais", count: summary.oneOffCount },
    { value: "recurring", label: "Recorrentes", count: summary.recurringCount },
    { value: "archived", label: "Arquivados", count: summary.archivedCount },
  ]);

  async function loadAllContracts(): Promise<void> {
    abortController?.abort();
    const controller = new AbortController();
    abortController = controller;
    loading = true;
    errorMessage = "";
    try {
      const first = await listContracts({
        page: 1,
        pageSize: 100,
        query: "",
        orderBy: "updated",
        archived: "include",
        signal: controller.signal,
      });
      const collected = [...first.items];
      for (let page = 2; page <= first.totalPages; page += 1) {
        const next = await listContracts({
          page,
          pageSize: 100,
          query: "",
          orderBy: "updated",
          archived: "include",
          signal: controller.signal,
        });
        collected.push(...next.items);
      }
      if (controller.signal.aborted) return;
      contracts = collected;
    } catch (cause) {
      if (controller.signal.aborted) return;
      errorMessage =
        cause instanceof ContractApiError
          ? cause.message
          : "Não foi possível carregar os contratos.";
    } finally {
      if (abortController === controller) loading = false;
    }
  }

  function contractCardHandle(contract: Contract): EntityCardItem {
    return {
      id: contract.id,
      kind: "contrato",
      title: contract.name,
      status: contract.archivedAt
        ? "Arquivado"
        : contract.contractType === "recurring"
          ? "Recorrente"
          : "Pontual",
      statusColor:
        contract.contractType === "recurring" ? "#5DAC83" : "#2E56FF",
    };
  }

  function actOnContract(action: EntityCardAction, contract: Contract): void {
    entityCreate?.actOnCard(action, contractCardHandle(contract));
  }

  function toggleExpanded(id: string): void {
    expandedIds = { ...expandedIds, [id]: !expandedIds[id] };
  }

  onMount(() => {
    workspaces = loadWorkspaces();
    void refreshWorkspaceSnapshot()
      .then((items) => {
        workspaces = items;
      })
      .catch(() => undefined);
    void loadAllContracts();

    const stopContracts = observeContracts(() => {
      void loadAllContracts();
    });
    const stopWorkspaces = observeWorkspaces(() => {
      workspaces = loadWorkspaces();
      void loadAllContracts();
    });

    return () => {
      abortController?.abort();
      stopContracts();
      stopWorkspaces();
    };
  });
</script>

<svelte:head><title>Contratos · Demanda</title></svelte:head>

<section class="contracts-page" aria-label="Carteira de contratos">
  <PageHeader eyebrow="Meu negócio" title="Contratos" icon={FileText}>
    <div class="header-metrics" aria-label="Resumo da carteira">
      <div class="header-metric">
        <div class="metric-head">
          <span class="metric-icon" aria-hidden="true">
            <Wallet size={13.5} strokeWidth={2} />
          </span>
          <span class="metric-label">Carteira ativa</span>
        </div>
        <strong class="metric-value">
          {formatContractMoney(summary.activeAmountCents)}
        </strong>
        <span class="metric-helper">
          {summary.activeCount}
          {summary.activeCount === 1 ? "acordo vigente" : "acordos vigentes"}
        </span>
      </div>

      <div class="header-metric">
        <div class="metric-head">
          <span class="metric-icon metric-icon--blue" aria-hidden="true">
            <Sparkles size={13.5} strokeWidth={2} />
          </span>
          <span class="metric-label">Pontuais</span>
        </div>
        <strong class="metric-value">
          {formatContractMoney(summary.oneOffAmountCents)}
        </strong>
        <span class="metric-helper">
          {summary.oneOffCount}
          {summary.oneOffCount === 1
            ? "contrato fechado"
            : "contratos fechados"}
        </span>
      </div>

      <div class="header-metric">
        <div class="metric-head">
          <span class="metric-icon metric-icon--green" aria-hidden="true">
            <Repeat size={13.5} strokeWidth={2} />
          </span>
          <span class="metric-label">Recorrentes</span>
        </div>
        <strong class="metric-value">
          {formatContractMoney(summary.recurringAmountCents)}<small>/mês</small>
        </strong>
        <span class="metric-helper">
          {summary.recurringCount}
          {summary.recurringCount === 1
            ? "assinatura ativa"
            : "assinaturas ativas"}
        </span>
      </div>
    </div>

    {#snippet actions()}
      <button
        type="button"
        class="create-contract-btn"
        onclick={() => entityCreate?.open("contratos")}
      >
        <Plus size={17} strokeWidth={2.2} />
        <span>Novo contrato</span>
      </button>
    {/snippet}
  </PageHeader>

  <div class="ledger-shell" aria-busy={loading}>
    <div class="contracts-filters">
      <FilterBar
        options={filterOptions}
        bind:selected={filter}
        bind:query
        placeholder="Buscar contratos"
        showTitle={false}
      >
        {#snippet extras()}
          {#if workspaces.length > 1}
            <select
              class="filter-select"
              bind:value={workspaceFilter}
              aria-label="Filtrar por workspace"
            >
              <option value="all">Todos os workspaces</option>
              {#each workspaces as workspace (workspace.id)}
                <option value={workspace.id}>{workspace.name}</option>
              {/each}
            </select>
          {/if}

          <select
            class="filter-select"
            bind:value={sort}
            aria-label="Ordenar contratos"
          >
            <option value="updated">Mais recentes</option>
            <option value="amount_desc">Maior valor</option>
            <option value="amount_asc">Menor valor</option>
            <option value="name_asc">Nome (A–Z)</option>
            <option value="name_desc">Nome (Z–A)</option>
          </select>
        {/snippet}
      </FilterBar>
    </div>

    {#if errorMessage}
      <div class="ledger-state ledger-state--error" role="alert">
        <div>
          <strong>Não foi possível carregar os contratos</strong>
          <p>{errorMessage}</p>
        </div>
        <button
          type="button"
          class="retry-btn"
          onclick={() => void loadAllContracts()}
        >
          <RefreshCw size={15} strokeWidth={2} />
          <span>Tentar novamente</span>
        </button>
      </div>
    {:else if loading && contracts.length === 0}
      <div class="ledger-state" role="status">
        <strong>Carregando carteira de contratos…</strong>
        <p>Buscando acordos comerciais e cronogramas de pagamento.</p>
      </div>
    {:else if visibleContracts.length === 0}
      <div class="ledger-state">
        <strong>
          {contracts.length === 0
            ? "Nenhum contrato cadastrado ainda"
            : "Nenhum contrato encontrado para este filtro"}
        </strong>
        <p>
          {contracts.length === 0
            ? "Registre seu primeiro acordo comercial para acompanhar valores, vigência e parcelas."
            : "Ajuste a busca ou altere a modalidade selecionada acima."}
        </p>
        {#if contracts.length === 0}
          <button
            type="button"
            class="empty-cta"
            onclick={() => entityCreate?.open("contratos")}
          >
            <Plus size={16} strokeWidth={2.2} />
            <span>Criar primeiro contrato</span>
          </button>
        {/if}
      </div>
    {:else}
      <div class="ledger-columns" aria-hidden="true">
        <span class="col-agreement-head">Contrato</span>
        <span class="col-workspace-head">Workspace</span>
        <span>Modalidade</span>
        <span>Início</span>
        <span>Término</span>
        <span class="col-duration-head">Duração</span>
        <span class="col-projects-head">Projetos</span>
        <span class="align-right">Valor</span>
        <span class="col-actions-head">Ações</span>
      </div>

      <div class="ledger-rows">
        {#each visibleContracts as contract (contract.id)}
          <ContractLedgerRow
            {contract}
            workspaceName={workspaceNames.get(contract.workspaceId) ?? ""}
            expanded={Boolean(expandedIds[contract.id])}
            ontoggle={() => toggleExpanded(contract.id)}
            onview={() => actOnContract("view", contract)}
            onedit={() => actOnContract("edit", contract)}
            ondelete={() => actOnContract("delete", contract)}
          />
        {/each}
      </div>

      <footer class="ledger-footer">
        <span>
          Exibindo <strong>{visibleContracts.length}</strong>
          {visibleContracts.length === 1 ? "contrato" : "contratos"}
        </span>
        <span class="footer-total">
          Subtotal da visualização:
          <strong>{formatContractMoney(visibleTotalCents)}</strong>
        </span>
      </footer>
    {/if}
  </div>
</section>

<style>
  .contracts-page {
    display: grid;
    gap: 16px;
    width: 100%;
    max-width: var(--content-width);
  }

  .contracts-page :global(.page-header) {
    margin-bottom: 0;
  }

  .create-contract-btn {
    display: inline-flex;
    min-height: 40px;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 0 16px;
    border: 1px solid var(--primary);
    border-radius: var(--radius-md);
    color: #ffffff;
    background: var(--primary);
    box-shadow: 0 8px 18px rgba(46, 86, 255, 0.22);
    font: inherit;
    font-size: var(--text-md);
    font-weight: 600;
    cursor: pointer;
    transition:
      background var(--motion-fast) ease,
      border-color var(--motion-fast) ease,
      transform var(--motion-fast) ease;
  }

  .create-contract-btn:hover {
    border-color: var(--brand-700);
    background: var(--brand-700);
  }

  .header-metrics {
    display: grid;
    width: min(100%, 640px);
    grid-template-columns: repeat(3, minmax(0, 1fr));
    align-items: center;
    padding: 3px 0;
  }

  .header-metric {
    position: relative;
    display: grid;
    gap: 2px;
    padding: 5px 18px 5px 20px;
    border-left: 1px solid rgba(46, 86, 255, 0.14);
  }

  .header-metric::before {
    position: absolute;
    top: 50%;
    left: -1px;
    width: 2px;
    height: 26px;
    border-radius: var(--radius-pill);
    background: var(--ink-400);
    content: "";
    transform: translateY(-50%);
  }

  .header-metric:first-child {
    border-left: 0;
  }

  .header-metric:first-child::before {
    display: none;
  }

  .header-metric:nth-child(2)::before {
    background: var(--brand-500);
  }

  .header-metric:nth-child(3)::before {
    background: var(--system-green);
  }

  .metric-head {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .metric-label {
    color: var(--ink-500);
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.05em;
    text-transform: uppercase;
    white-space: nowrap;
  }

  .metric-icon {
    display: inline-flex;
    width: 19px;
    height: 19px;
    flex: 0 0 auto;
    align-items: center;
    justify-content: center;
    border-radius: 6px;
    color: var(--ink-500);
    background: rgba(100, 116, 139, 0.08);
  }

  .metric-icon--blue {
    color: var(--brand-600);
    background: rgba(46, 86, 255, 0.1);
  }

  .metric-icon--green {
    color: #266b49;
    background: rgba(93, 172, 131, 0.15);
  }

  .metric-value {
    color: var(--ink-950);
    font-size: clamp(16px, 1.25vw, 18px);
    font-weight: 700;
    font-variant-numeric: tabular-nums;
    letter-spacing: -0.025em;
    line-height: 1.2;
    white-space: nowrap;
  }

  .metric-value small {
    margin-left: 2px;
    color: var(--muted);
    font-size: 11px;
    font-weight: 500;
  }

  .metric-helper {
    color: var(--muted);
    font-size: 11px;
    white-space: nowrap;
  }

  .ledger-shell {
    overflow: hidden;
    border: 1px solid var(--border);
    border-radius: var(--radius-xl);
    background: var(--panel);
  }

  .contracts-filters {
    padding: 16px 18px;
    border-bottom: 1px solid var(--border);
    background: var(--panel);
  }

  .filter-select {
    min-height: 36px;
    padding: 0 10px;
    border: 1px solid var(--border);
    border-radius: 9px;
    color: var(--ink-700);
    background: var(--canvas);
    font: inherit;
    font-size: var(--text-sm);
    cursor: pointer;
  }

  .filter-select:focus {
    outline: 0;
    border-color: var(--brand-500);
  }

  .ledger-columns {
    display: grid;
    grid-template-columns:
      minmax(210px, 1.9fr)
      minmax(115px, 0.85fr)
      minmax(114px, 0.8fr)
      minmax(92px, 0.66fr)
      minmax(92px, 0.66fr)
      minmax(84px, 0.58fr)
      minmax(98px, 0.72fr)
      minmax(168px, 1.1fr)
      128px;
    align-items: center;
    gap: 16px;
    padding: 11px 20px;
    border-bottom: 1px solid rgba(46, 86, 255, 0.1);
    background: linear-gradient(
      90deg,
      rgba(46, 86, 255, 0.045),
      rgba(124, 92, 229, 0.025)
    );
    color: var(--ink-500);
    font-size: var(--text-xs);
    font-weight: 600;
    letter-spacing: 0.05em;
    text-transform: uppercase;
  }

  .col-agreement-head {
    padding-left: 50px;
  }

  .col-actions-head {
    padding-left: 16px;
    text-align: right;
  }

  .align-right {
    text-align: right;
  }

  .ledger-rows {
    display: grid;
  }

  .ledger-footer {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 13px 18px;
    border-top: 1px solid rgba(46, 86, 255, 0.1);
    background: linear-gradient(
      90deg,
      rgba(46, 86, 255, 0.028),
      rgba(124, 92, 229, 0.016)
    );
    color: var(--ink-500);
    font-size: 13px;
    font-variant-numeric: tabular-nums;
  }

  .ledger-footer strong {
    color: var(--ink-950);
  }

  .footer-total strong {
    margin-left: 6px;
    font-size: 14px;
  }

  .ledger-state {
    display: grid;
    justify-items: center;
    gap: 8px;
    padding: 48px 24px;
    text-align: center;
  }

  .ledger-state strong {
    color: var(--ink-950);
    font-size: var(--text-lg);
  }

  .ledger-state p {
    max-width: 460px;
    margin: 0;
    color: var(--muted);
    font-size: var(--text-md);
  }

  .ledger-state--error strong {
    color: var(--danger);
  }

  .empty-cta,
  .retry-btn {
    display: inline-flex;
    min-height: 40px;
    align-items: center;
    gap: 8px;
    margin-top: 8px;
    padding: 0 16px;
    border: 1px solid var(--border-strong);
    border-radius: var(--radius-md);
    color: var(--ink-950);
    background: var(--panel);
    font: inherit;
    font-size: 13.5px;
    font-weight: 600;
    cursor: pointer;
  }

  .empty-cta {
    border-color: var(--primary);
    color: #ffffff;
    background: var(--primary);
  }

  @media (max-width: 1220px) {
    .ledger-columns {
      grid-template-columns:
        minmax(200px, 1.8fr)
        minmax(106px, 0.78fr)
        minmax(92px, 0.7fr)
        minmax(92px, 0.7fr)
        minmax(156px, 1fr)
        124px;
    }

    .col-workspace-head,
    .col-projects-head,
    .col-duration-head {
      display: none;
    }
  }

  @media (max-width: 1180px) {
    .header-metrics {
      width: 100%;
    }
  }

  @media (max-width: 820px) {
    .ledger-columns {
      display: none;
    }

    .filter-select {
      flex: 1 1 140px;
    }
  }

  @media (max-width: 640px) {
    .header-metrics {
      grid-template-columns: minmax(0, 1fr);
      padding: 0;
    }

    .header-metric {
      padding: 12px 14px;
      border-left: 0;
      border-bottom: 1px solid rgba(46, 86, 255, 0.12);
    }

    .header-metric:last-child {
      border-bottom: 0;
    }

    .header-metric::before {
      display: none;
    }
  }
</style>
