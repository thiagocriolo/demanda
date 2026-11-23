<script lang="ts">
  import {
    ArrowUpRight,
    BriefcaseBusiness,
    ChevronDown,
    FileText,
    FolderKanban,
    Layers,
    Pencil,
    Repeat,
    Trash2,
  } from "@lucide/svelte";
  import { recordPageHref } from "$lib/records/record-page";
  import type { Contract } from "./client";
  import {
    formatContractDate,
    formatContractMoney,
    formatContractDuration,
  } from "./presentation";

  let {
    contract,
    workspaceName = "",
    expanded = false,
    ontoggle,
    onview,
    onedit,
    ondelete,
  }: {
    contract: Contract;
    workspaceName?: string;
    expanded?: boolean;
    ontoggle: () => void;
    onview: () => void;
    onedit: () => void;
    ondelete: () => void;
  } = $props();

  const isRecurring = $derived(contract.contractType === "recurring");
  const isArchived = $derived(Boolean(contract.archivedAt));
  const hasDrawerDetails = $derived(
    contract.installments.length > 0 || Boolean(contract.paymentTerms.trim()),
  );
  const projectLabel = $derived(
    contract.projectCount === 1
      ? "1 projeto"
      : `${contract.projectCount} projetos`,
  );
  const periodStart = $derived(formatContractDate(contract.startDate));
  const periodEnd = $derived(formatContractDate(contract.endDate));
  const hasContractPeriod = $derived(Boolean(periodStart || periodEnd));
  const installmentSummary = $derived.by(() => {
    if (isRecurring) return "Faturamento mensal";
    if (contract.installments.length > 1) {
      return `${contract.installments.length}× de ${formatContractMoney(
        contract.installments[0]?.amountCents ?? 0,
      )}`;
    }
    if (contract.installments.length === 1) return "Parcela única";
    return contract.paymentTerms.trim() ? "Ver condições" : "Sem parcelamento";
  });
</script>

<div class="ledger-item" class:expanded class:archived={isArchived}>
  <div class="ledger-row">
    <div class="col-agreement">
      <span
        class="agreement-emblem"
        class:agreement-emblem--recurring={isRecurring && !isArchived}
        class:agreement-emblem--archived={isArchived}
        aria-hidden="true"
      >
        {#if isRecurring}
          <Repeat size={16} strokeWidth={2} />
        {:else}
          <FileText size={16} strokeWidth={2} />
        {/if}
      </span>

      <div class="agreement-copy">
        <div class="agreement-title-line">
          <button type="button" class="agreement-name" onclick={onview}>
            {contract.name}
          </button>
          {#if isArchived}
            <span class="state-chip">Arquivado</span>
          {/if}
        </div>
        <span class="business-meta">
          <BriefcaseBusiness size={12.5} strokeWidth={1.85} />
          <span>{contract.business.name}</span>
        </span>
      </div>
    </div>

    <div class="col-workspace">
      <span class="workspace-pill">
        <Layers size={12} strokeWidth={1.9} />
        <span>{workspaceName || "Pessoal"}</span>
      </span>
    </div>

    <div class="col-modality">
      <span
        class="modality-badge"
        class:modality-badge--recurring={isRecurring}
        class:modality-badge--one-off={!isRecurring}
      >
        <span class="modality-dot" aria-hidden="true"></span>
        <span>{isRecurring ? "Recorrente" : "Pontual"}</span>
      </span>
    </div>

    <div class="col-period col-period--start">
      {#if hasContractPeriod}
        <strong class="period-value">{periodStart || "A definir"}</strong>
      {:else}
        <span class="period-open">Período em aberto</span>
      {/if}
    </div>

    <div class="col-period col-period--end">
      {#if hasContractPeriod}
        <strong class="period-value">{periodEnd || "Em aberto"}</strong>
      {/if}
    </div>

    <div class="col-duration">
      <span class="duration-metric"
        ><span class="duration-value">{formatContractDuration(contract)}</span
        ><span class="duration-label">duração</span></span
      >
    </div>

    <div class="col-projects">
      <span class="projects-metric" class:empty={contract.projectCount === 0}>
        <FolderKanban size={13.5} strokeWidth={1.85} />
        <span>{projectLabel}</span>
      </span>
    </div>

    <div class="col-amount">
      <strong class="amount-value">
        {formatContractMoney(contract.amountCents)}
        {#if isRecurring}
          <span class="amount-unit">/mês</span>
        {/if}
      </strong>

      {#if hasDrawerDetails}
        <button
          type="button"
          class="installments-trigger"
          class:open={expanded}
          aria-expanded={expanded}
          onclick={ontoggle}
        >
          <span>{installmentSummary}</span>
          <ChevronDown size={13} strokeWidth={2.2} />
        </button>
      {:else}
        <span class="amount-sub">{installmentSummary}</span>
      {/if}
    </div>

    <div class="col-actions">
      <div class="actions-tray">
        <a
          class="row-action"
          href={recordPageHref("contrato", contract.id)}
          title="Abrir página do contrato"
          aria-label={`Abrir detalhes de ${contract.name}`}
        >
          <ArrowUpRight size={15} strokeWidth={2} />
        </a>
        <button
          type="button"
          class="row-action"
          title="Editar contrato"
          aria-label={`Editar ${contract.name}`}
          onclick={onedit}
        >
          <Pencil size={14} strokeWidth={2} />
        </button>
        <button
          type="button"
          class="row-action row-action--danger"
          title="Excluir contrato"
          aria-label={`Excluir ${contract.name}`}
          onclick={ondelete}
        >
          <Trash2 size={14} strokeWidth={2} />
        </button>
      </div>
    </div>
  </div>

  {#if expanded && hasDrawerDetails}
    <div class="ledger-drawer">
      {#if contract.installments.length > 0}
        <div class="drawer-block">
          <div class="drawer-head">
            <span class="drawer-label">Cronograma de parcelas</span>
            <span class="drawer-count">
              {contract.installments.length}
              {contract.installments.length === 1 ? "parcela" : "parcelas"}
            </span>
          </div>
          <div class="installment-grid">
            {#each contract.installments as installment (installment.id)}
              <div class="installment-chip">
                <span class="chip-index">
                  #{String(installment.number).padStart(2, "0")}
                </span>
                <span class="chip-date">
                  {formatContractDate(installment.dueDate)}
                </span>
                <strong class="chip-amount">
                  {formatContractMoney(installment.amountCents)}
                </strong>
              </div>
            {/each}
          </div>
        </div>
      {/if}

      {#if contract.paymentTerms.trim()}
        <div class="drawer-block">
          <span class="drawer-label">Condições financeiras</span>
          <p class="drawer-notes">{contract.paymentTerms}</p>
        </div>
      {/if}
    </div>
  {/if}
</div>

<style>
  .ledger-item {
    border-bottom: 1px solid var(--border);
    background: var(--panel);
    transition:
      background var(--motion-fast) ease,
      box-shadow var(--motion-fast) ease;
  }

  .ledger-item:last-child {
    border-bottom: 0;
  }

  .ledger-item:hover {
    background: #f9fbff;
    box-shadow: inset 3px 0 0 rgba(46, 86, 255, 0.35);
  }

  .ledger-item.expanded {
    background: #f7f9ff;
    box-shadow: inset 3px 0 0 var(--primary);
  }

  .ledger-item.archived .agreement-name,
  .ledger-item.archived .amount-value {
    color: var(--ink-500);
  }

  .ledger-row {
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
    padding: 10px 20px;
  }

  .ledger-row > div {
    justify-self: stretch;
    text-align: center;
  }

  .col-agreement {
    display: flex;
    min-width: 0;
    align-items: center;
    gap: 12px;
    justify-self: stretch !important;
  }

  .agreement-emblem {
    display: inline-flex;
    width: 34px;
    height: 34px;
    flex: 0 0 auto;
    align-items: center;
    justify-content: center;
    border: 1px solid rgba(46, 86, 255, 0.16);
    border-radius: 11px;
    color: var(--brand-600);
    background: rgba(46, 86, 255, 0.07);
  }

  .agreement-emblem--recurring {
    border-color: rgba(93, 172, 131, 0.28);
    color: #266b49;
    background: rgba(93, 172, 131, 0.12);
  }

  .agreement-emblem--archived {
    border-color: var(--border);
    color: var(--ink-400);
    background: var(--surface-soft);
  }

  .agreement-copy {
    display: grid;
    min-width: 0;
    gap: 3px;
  }

  .agreement-title-line {
    display: flex;
    min-width: 0;
    align-items: center;
    gap: 8px;
  }

  .agreement-name {
    min-width: 0;
    overflow: hidden;
    padding: 0;
    border: 0;
    color: var(--ink-950);
    background: transparent;
    font: inherit;
    font-size: 14.5px;
    font-weight: 600;
    line-height: 1.3;
    text-align: left;
    text-overflow: ellipsis;
    white-space: nowrap;
    cursor: pointer;
  }

  .agreement-name:hover {
    color: var(--primary);
  }

  .state-chip {
    display: inline-flex;
    align-items: center;
    padding: 2px 7px;
    border-radius: var(--radius-pill);
    color: var(--ink-500);
    background: rgba(100, 116, 139, 0.12);
    font-size: 11px;
    font-weight: 600;
    white-space: nowrap;
  }

  .business-meta {
    display: inline-flex;
    min-width: 0;
    align-items: center;
    gap: 5px;
    color: var(--muted);
    font-size: 12.5px;
  }

  .business-meta :global(svg) {
    flex: 0 0 auto;
    color: var(--ink-400);
  }

  .business-meta span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .col-workspace {
    min-width: 0;
  }

  .workspace-pill {
    display: inline-flex;
    max-width: 100%;
    align-items: center;
    gap: 5px;
    padding: 4px 10px;
    border: 1px solid var(--border);
    border-radius: var(--radius-pill);
    color: var(--ink-700);
    background: var(--canvas);
    font-size: 12px;
    font-weight: 500;
  }

  .workspace-pill :global(svg) {
    flex: 0 0 auto;
    color: var(--ink-400);
  }

  .workspace-pill span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .modality-badge {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 4px 10px;
    border-radius: var(--radius-pill);
    font-size: 12px;
    font-weight: 600;
    white-space: nowrap;
  }

  .modality-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: currentColor;
  }

  .modality-badge--one-off {
    color: var(--brand-700);
    background: rgba(46, 86, 255, 0.08);
  }

  .modality-badge--recurring {
    color: #266b49;
    background: rgba(93, 172, 131, 0.14);
  }

  .col-period {
    display: flex;
    min-width: 0;
    align-items: center;
    justify-content: center;
    text-align: center;
  }

  .period-value {
    color: var(--ink-800);
    font-size: 12.5px;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
    line-height: 1.1;
    white-space: nowrap;
  }

  .duration-label {
    color: var(--ink-400);
    font-size: 9.5px;
    font-weight: 700;
    letter-spacing: 0.055em;
    line-height: 1.1;
    text-transform: uppercase;
  }

  .period-open {
    color: var(--ink-500);
    font-size: 12.5px;
  }
  .col-duration {
    min-width: 0;
  }
  .duration-metric {
    display: inline-grid;
    gap: 2px;
    min-width: 68px;
    padding: 5px 8px;
    border: 1px solid rgba(46, 86, 255, 0.12);
    border-radius: 9px;
    background: linear-gradient(
      135deg,
      rgba(46, 86, 255, 0.08),
      rgba(46, 86, 255, 0.025)
    );
    font-variant-numeric: tabular-nums;
  }
  .duration-value {
    overflow: hidden;
    color: var(--brand-700);
    font-size: 12.5px;
    font-weight: 700;
    line-height: 1.15;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .projects-metric {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    color: var(--ink-800);
    font-size: 13px;
    font-weight: 500;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }

  .projects-metric :global(svg) {
    color: var(--ink-500);
  }

  .projects-metric.empty {
    color: var(--ink-400);
    font-weight: 400;
  }

  .projects-metric.empty :global(svg) {
    color: var(--ink-400);
  }

  .col-amount {
    display: grid;
    justify-self: stretch !important;
    justify-items: end;
    gap: 4px;
    text-align: right !important;
  }

  .amount-value {
    color: var(--ink-950);
    font-size: 15.5px;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
    letter-spacing: -0.015em;
    white-space: nowrap;
  }

  .amount-unit {
    color: var(--muted);
    font-size: var(--text-xs);
    font-weight: 500;
  }

  .amount-sub {
    color: var(--muted);
    font-size: 12px;
    white-space: nowrap;
  }

  .installments-trigger {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 2px 7px;
    border: 1px solid transparent;
    border-radius: var(--radius-pill);
    color: var(--ink-500);
    background: var(--surface-soft);
    font: inherit;
    font-size: 11.5px;
    font-weight: 500;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
    cursor: pointer;
    transition:
      color var(--motion-fast) ease,
      background var(--motion-fast) ease,
      border-color var(--motion-fast) ease;
  }

  .installments-trigger:hover,
  .installments-trigger.open {
    border-color: rgba(46, 86, 255, 0.2);
    color: var(--brand-600);
    background: rgba(46, 86, 255, 0.08);
  }

  .installments-trigger :global(svg) {
    transition: transform var(--motion-fast) ease;
  }

  .installments-trigger.open :global(svg) {
    transform: rotate(180deg);
  }

  .col-actions {
    display: flex;
    justify-content: center;
    padding-left: 0;
    border-left: 1px solid var(--border);
  }

  .actions-tray {
    display: inline-flex;
    align-items: center;
    gap: 2px;
    padding: 3px;
    border: 1px solid var(--border);
    border-radius: 10px;
    background: var(--canvas);
  }

  .row-action {
    display: inline-flex;
    width: 28px;
    height: 28px;
    align-items: center;
    justify-content: center;
    padding: 0;
    border: 0;
    border-radius: 7px;
    color: var(--ink-500);
    background: transparent;
    text-decoration: none;
    cursor: pointer;
    transition:
      color var(--motion-fast) ease,
      background var(--motion-fast) ease;
  }

  .row-action:hover {
    color: var(--ink-950);
    background: var(--panel);
  }

  .row-action--danger:hover {
    color: var(--danger);
    background: rgba(220, 38, 38, 0.09);
  }

  .ledger-drawer {
    display: grid;
    gap: 14px;
    padding: 16px 20px 18px 70px;
    border-top: 1px solid rgba(46, 86, 255, 0.12);
    background: linear-gradient(180deg, #f5f7ff 0%, #f8f9fc 100%);
  }

  .drawer-block {
    display: grid;
    gap: 10px;
  }

  .drawer-head {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .drawer-label {
    color: var(--ink-500);
    font-size: var(--text-xs);
    font-weight: 700;
    letter-spacing: 0.05em;
    text-transform: uppercase;
  }

  .drawer-count {
    padding: 2px 7px;
    border-radius: var(--radius-pill);
    color: var(--brand-600);
    background: rgba(46, 86, 255, 0.09);
    font-size: 11px;
    font-weight: 600;
  }

  .installment-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(210px, 1fr));
    gap: 8px;
  }

  .installment-chip {
    display: grid;
    grid-template-columns: auto 1fr auto;
    align-items: center;
    gap: 10px;
    padding: 9px 12px;
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    background: var(--panel);
    font-variant-numeric: tabular-nums;
  }

  .chip-index {
    color: var(--brand-600);
    font-size: 11.5px;
    font-weight: 700;
  }

  .chip-date {
    color: var(--ink-700);
    font-size: 12.5px;
  }

  .chip-amount {
    color: var(--ink-950);
    font-size: 13px;
    font-weight: 600;
  }

  .drawer-notes {
    margin: 0;
    padding: 10px 12px;
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    color: var(--ink-700);
    background: var(--panel);
    font-size: 13px;
    line-height: 1.5;
    white-space: pre-wrap;
  }

  @media (max-width: 1220px) {
    .ledger-row {
      grid-template-columns:
        minmax(200px, 1.8fr)
        minmax(106px, 0.78fr)
        minmax(92px, 0.7fr)
        minmax(92px, 0.7fr)
        minmax(156px, 1fr)
        124px;
    }

    .col-workspace,
    .col-projects,
    .col-duration {
      display: none;
    }
  }

  @media (max-width: 820px) {
    .ledger-row {
      grid-template-columns: minmax(0, 1fr) auto;
      gap: 12px;
      padding: 14px 16px;
    }

    .col-agreement {
      grid-column: 1 / -1;
    }

    .col-modality {
      justify-self: start;
    }

    .col-amount {
      justify-self: end;
    }

    .col-period--start {
      grid-column: 1 / 2;
    }

    .col-period--end {
      grid-column: 2 / 3;
    }

    .col-actions {
      grid-column: 2 / 3;
      justify-self: end;
      padding-left: 0;
      border-left: 0;
    }

    .ledger-drawer {
      padding: 14px 16px;
    }
  }
</style>
