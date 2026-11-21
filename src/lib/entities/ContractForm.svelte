<script lang="ts">
  import {
    BriefcaseBusiness,
    CalendarDays,
    CircleDollarSign,
    CreditCard,
    FileText,
    Pencil,
    Save,
    Trash2,
    X,
  } from "@lucide/svelte";
  import { onMount } from "svelte";
  import { listAllActiveBusinesses } from "$lib/businesses/client";
  import type { Business } from "$lib/businesses/types";
  import { addMonthsToFinanceDate } from "$lib/finance/installments";
  import { centsToMoney, moneyToCents, splitCents } from "$lib/finance/money";
  import type { EntityRecord } from "./types";
  import {
    loadActiveWorkspaceId,
    loadWorkspaces,
    refreshWorkspaceSnapshot,
    type Workspace,
  } from "$lib/workspaces/workspace-storage";

  type FormMode = "create" | "view" | "edit";
  type InstallmentDraft = {
    number: number;
    dueDate: string;
    amount: string;
    status: string;
  };

  let {
    record,
    mode = "create",
    oncancel,
    onsave,
    onedit,
    ondelete,
  }: {
    record?: EntityRecord;
    mode?: FormMode;
    oncancel: () => void;
    onsave: (values: Record<string, string>) => void;
    onedit: () => void;
    ondelete: () => void;
  } = $props();

  let businesses = $state<Business[]>([]);
  let loadingBusinesses = $state(true);
  let businessError = $state("");
  let workspaces = $state<Workspace[]>([]);
  let workspaceError = $state("");
  let form = $state(emptyForm());
  const viewOnly = $derived(mode === "view");
  const modalTitle = $derived(
    viewOnly
      ? record?.nome || "Detalhes do contrato"
      : mode === "edit"
        ? "Editar contrato"
        : "Novo contrato",
  );

  function emptyForm(source?: EntityRecord) {
    const contractType =
      source?.contractType === "recurring" ? "recurring" : "one_off";
    const valor = source?.valor?.replace(/[^0-9,.-]/gu, "") ?? "";
    const installments = parseInstallments(source?.installments);
    const primeiroVencimento =
      source?.primeiroVencimento ?? installments[0]?.dueDate ?? "";
    if (contractType === "one_off" && !installments.length) {
      installments.push({
        number: 1,
        dueDate: primeiroVencimento,
        amount: centsToMoney(moneyToCents(valor)),
        status: "pending",
      });
    }
    return {
      nome: source?.nome ?? "",
      workspaceId:
        source?.contractWorkspaceId ?? source?.workspaceId ?? "",
      negocioId: source?.negocioId ?? "",
      contractType,
      valor,
      dataInicio: source?.dataInicio ?? "",
      dataFim: source?.dataFim ?? "",
      primeiroVencimento,
      paymentMethod: source?.paymentMethod ?? "",
      condicoes: source?.condicoes ?? "",
      financeNotes: source?.financeNotes ?? "",
      installments,
    };
  }

  function parseInstallments(value?: string): InstallmentDraft[] {
    try {
      const parsed: unknown = value ? JSON.parse(value) : [];
      if (!Array.isArray(parsed)) return [];
      return parsed.flatMap((entry, index) => {
        if (!entry || typeof entry !== "object") return [];
        const item = entry as Record<string, unknown>;
        return [
          {
            number: typeof item.number === "number" ? item.number : index + 1,
            dueDate: typeof item.dueDate === "string" ? item.dueDate : "",
            amount:
              typeof item.amountCents === "number"
                ? (item.amountCents / 100).toLocaleString("pt-BR", {
                    minimumFractionDigits: 2,
                  })
                : "",
            status: typeof item.status === "string" ? item.status : "pending",
          },
        ];
      });
    } catch {
      return [];
    }
  }

  function updateInstallmentCount(value: string): void {
    const count = Math.max(1, Math.min(99, Number.parseInt(value, 10) || 1));
    const total = moneyToCents(form.valor);
    const amounts = splitCents(total, count);
    form.installments = Array.from({ length: count }, (_, index) => ({
      number: index + 1,
      dueDate:
        form.installments[index]?.dueDate ||
        addMonthsToFinanceDate(form.primeiroVencimento, index),
      amount: centsToMoney(amounts[index] ?? 0),
      status: form.installments[index]?.status || "pending",
    }));
  }

  function updateAmount(value: string): void {
    form.valor = value;
    if (form.contractType === "one_off") {
      updateInstallmentCount(String(Math.max(1, form.installments.length)));
    }
  }

  function updateFirstDueDate(value: string): void {
    form.primeiroVencimento = value;
    if (form.contractType !== "one_off") return;
    form.installments = form.installments.map((installment, index) => ({
      ...installment,
      dueDate: addMonthsToFinanceDate(value, index),
    }));
  }

  function updateContractType(value: "one_off" | "recurring"): void {
    form.contractType = value;
    if (value === "recurring") {
      form.installments = [];
      return;
    }
    updateInstallmentCount(String(Math.max(1, form.installments.length)));
  }

  function rebalanceInstallments(changedIndex: number, value: string): void {
    const total = moneyToCents(form.valor);
    const previousTotal = form.installments
      .slice(0, changedIndex)
      .reduce((sum, installment) => sum + moneyToCents(installment.amount), 0);
    const changedAmount = Math.min(
      moneyToCents(value),
      Math.max(0, total - previousTotal),
    );
    const followingAmounts = splitCents(
      total - previousTotal - changedAmount,
      form.installments.length - changedIndex - 1,
    );
    form.installments = form.installments.map((installment, index) => {
      if (index < changedIndex) return installment;
      if (index === changedIndex)
        return { ...installment, amount: centsToMoney(changedAmount) };
      return {
        ...installment,
        amount: centsToMoney(followingAmounts[index - changedIndex - 1] ?? 0),
      };
    });
  }

  $effect(() => {
    form = emptyForm(record);
  });

  onMount(() => {
    workspaces = loadWorkspaces();
    if (!form.workspaceId) form.workspaceId = loadActiveWorkspaceId(workspaces);
    void refreshWorkspaceSnapshot()
      .then((items) => {
        workspaces = items;
        if (!form.workspaceId) form.workspaceId = loadActiveWorkspaceId(items);
      })
      .catch(() => {
        workspaceError = "NÃ£o foi possÃ­vel carregar os workspaces.";
      });
    void listAllActiveBusinesses()
      .then((items) => {
        businesses = items;
        if (!form.negocioId && items.length === 1)
          form.negocioId = items[0]!.id;
      })
      .catch(() => {
        businessError = "Não foi possível carregar os negócios disponíveis.";
      })
      .finally(() => {
        loadingBusinesses = false;
      });
  });

  function submit(event: SubmitEvent): void {
    event.preventDefault();
    if (
      viewOnly ||
      !form.nome.trim() ||
      !form.negocioId ||
      !form.workspaceId
    )
      return;
    onsave({
      nome: form.nome.trim(),
      workspaceId: form.workspaceId,
      negocioId: form.negocioId,
      contractType: form.contractType,
      valor: form.valor.trim(),
      dataInicio: form.dataInicio,
      dataFim: form.dataFim,
      primeiroVencimento: form.primeiroVencimento,
      paymentMethod: form.paymentMethod.trim(),
      condicoes: form.condicoes.trim(),
      financeNotes: form.financeNotes.trim(),
      installments: JSON.stringify(
        form.installments.map((item, index) => ({
          number: index + 1,
          dueDate: item.dueDate,
          amountCents: moneyToCents(item.amount),
          status: item.status,
        })),
      ),
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
    aria-labelledby="contract-form-title"
  >
    <header>
      <h2 id="contract-form-title">{modalTitle}</h2>
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
      <form class:view-mode={viewOnly} onsubmit={submit}>
        <section class="form-section">
          <h3>Contrato</h3>

          <div class="fields">
            <div class="control full">
              <span class="control-icon" aria-hidden="true">
                <FileText size={16} strokeWidth={1.8} />
              </span>
              <input
                bind:value={form.nome}
                disabled={viewOnly}
                required
                maxlength="140"
                placeholder="Nome do contrato *"
                aria-label="Nome do contrato"
              />
            </div>

            <div class="two-column-grid full">
              <div class="control">
              <span class="control-icon" aria-hidden="true">
                <BriefcaseBusiness size={16} strokeWidth={1.8} />
              </span>
              <select
                bind:value={form.workspaceId}
                disabled={viewOnly || mode === "edit"}
                required
                aria-label="Workspace do contrato"
              >
                <option value="" disabled>Selecione o workspace *</option>
                {#each workspaces as workspace (workspace.id)}
                  <option value={workspace.id}>{workspace.name}</option>
                {/each}
              </select>
            </div>

            {#if workspaceError}
              <p class="catalog-state catalog-state--error" role="alert">
                {workspaceError}
              </p>
            {/if}

              <div class="control business-control">
              <span class="control-icon" aria-hidden="true">
                <BriefcaseBusiness size={16} strokeWidth={1.8} />
              </span>
              <select
                bind:value={form.negocioId}
                disabled={viewOnly || loadingBusinesses}
                required
                aria-label="Negócio vinculado"
              >
                <option value="" disabled>Selecione o negócio *</option>
                {#each businesses as business (business.id)}
                  <option value={business.id}>{business.name}</option>
                {/each}
              </select>
            </div>
            </div>

            {#if loadingBusinesses}
              <p class="catalog-state" role="status">Carregando negócios…</p>
            {:else if businessError}
              <p class="catalog-state catalog-state--error" role="alert">
                {businessError}
              </p>
            {:else if !businesses.length}
              <p class="catalog-state catalog-state--error" role="alert">
                Cadastre um negócio antes de criar um contrato.
              </p>
            {/if}

            <div class="two-column-grid full">
              <div class="control">
                <span class="control-icon" aria-hidden="true">
                  <CalendarDays size={16} strokeWidth={1.8} />
                </span>
                <input
                  bind:value={form.dataInicio}
                  disabled={viewOnly}
                  type="date"
                  aria-label="Data de início"
                />
              </div>
              <div class="control">
                <span class="control-icon" aria-hidden="true">
                  <CalendarDays size={16} strokeWidth={1.8} />
                </span>
                <input
                  bind:value={form.dataFim}
                  disabled={viewOnly}
                  type="date"
                  min={form.dataInicio || undefined}
                  aria-label="Data de fim"
                />
              </div>
            </div>

            <div class="two-column-grid full">
              <div class="control">
                <span class="control-icon" aria-hidden="true">
                  <FileText size={16} strokeWidth={1.8} />
                </span>
                <select
                  value={form.contractType}
                  disabled={viewOnly}
                  onchange={(event) =>
                    updateContractType(
                      event.currentTarget.value as "one_off" | "recurring",
                    )}
                  aria-label="Tipo de contratação"
                >
                  <option value="one_off">Pontual</option>
                  <option value="recurring">Recorrente</option>
                </select>
              </div>
              <div class="control">
                <span class="control-icon" aria-hidden="true">
                  <CircleDollarSign size={16} strokeWidth={1.8} />
                </span>
                <input
                  value={form.valor}
                  disabled={viewOnly}
                  inputmode="decimal"
                  placeholder="Valor"
                  aria-label="Valor do contrato"
                  oninput={(event) => updateAmount(event.currentTarget.value)}
                />
              </div>

            </div>

          </div>
        </section>

        <section class="form-section">
          <h3>Pagamento</h3>
          <div class="fields">
            {#if form.contractType === "one_off"}
              <div class="two-column-grid full">
                <div class="control">
                  <span class="control-icon" aria-hidden="true">
                    <CreditCard size={16} strokeWidth={1.8} />
                  </span>
                  <input
                    bind:value={form.paymentMethod}
                    disabled={viewOnly}
                    maxlength="120"
                    placeholder="Forma de pagamento"
                    aria-label="Forma de pagamento"
                  />
                </div>
                <div class="control installment-count">
                  <span class="control-label">Parcelas</span>
                  <input
                    type="number"
                    min="1"
                    max="99"
                    disabled={viewOnly}
                    title="Parcelas"
                    aria-label="Parcelas"
                    value={Math.max(1, form.installments.length)}
                    onchange={(event) =>
                      updateInstallmentCount(event.currentTarget.value)}
                  />
                </div>
              </div>

              <div class="installment-list full">
                {#each form.installments as installment, index (installment.number)}
                  <div class="installment-row">
                    <div
                      class="installment-index"
                      aria-label={`Parcela ${installment.number}`}
                    >
                      <span class="installment-hash" aria-hidden="true">#</span>
                      <span>{String(installment.number).padStart(2, "0")}</span>
                    </div>
                    <div class="control">
                      <span class="control-icon" aria-hidden="true">
                        <CalendarDays size={16} strokeWidth={1.8} />
                      </span>
                      <input
                        type="date"
                        disabled={viewOnly}
                        required={index === 0 && moneyToCents(form.valor) > 0}
                        value={installment.dueDate}
                        aria-label={`Vencimento da parcela ${installment.number}`}
                        onchange={(event) => {
                          if (index === 0) {
                            updateFirstDueDate(event.currentTarget.value);
                          } else {
                            installment.dueDate = event.currentTarget.value;
                          }
                        }}
                      />
                    </div>
                    <div class="control installment-amount">
                      <span class="control-icon" aria-hidden="true">R$</span>
                      <input
                        inputmode="decimal"
                        disabled={viewOnly}
                        placeholder="Valor"
                        bind:value={installment.amount}
                        aria-label={`Valor da parcela ${installment.number}`}
                        onchange={(event) =>
                          rebalanceInstallments(index, event.currentTarget.value)}
                      />
                    </div>
                  </div>
                {/each}
              </div>
            {:else}
              <div class="two-column-grid full">
                <div class="control">
                  <span class="control-icon" aria-hidden="true">
                    <CreditCard size={16} strokeWidth={1.8} />
                  </span>
                  <input
                    bind:value={form.paymentMethod}
                    disabled={viewOnly}
                    maxlength="120"
                    placeholder="Forma de pagamento"
                    aria-label="Forma de pagamento"
                  />
                </div>
                <div class="control">
                  <span class="control-icon" aria-hidden="true">
                    <CalendarDays size={16} strokeWidth={1.8} />
                  </span>
                  <input
                    value={form.primeiroVencimento}
                    disabled={viewOnly}
                    type="date"
                    aria-label="Data de vencimento"
                    onchange={(event) => updateFirstDueDate(event.currentTarget.value)}
                  />
                </div>
              </div>
            {/if}
          </div>
        </section>

        <section class="form-section">
          <h3>Condições financeiras</h3>

          <div class="fields">
            <div class="control textarea-control full">
              <span class="control-icon" aria-hidden="true">
                <FileText size={16} strokeWidth={1.8} />
              </span>
              <textarea
                bind:value={form.condicoes}
                disabled={viewOnly}
                maxlength="2000"
                rows="4"
                placeholder="Observações"
                aria-label="Observações"></textarea>
            </div>
          </div>
        </section>

        <div class="actions">
          {#if viewOnly}
            <div class="action-group action-group-right">
              <button class="primary" type="button" onclick={onedit}>
                <Pencil size={16} strokeWidth={2} />
                <span>Editar</span>
              </button>
            </div>
          {:else if mode === "edit"}
            <div class="action-group">
              <button class="danger" type="button" onclick={ondelete}>
                <Trash2 size={16} strokeWidth={2} />
                <span>Excluir</span>
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
                disabled={loadingBusinesses || !businesses.length || !form.workspaceId}
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
                disabled={loadingBusinesses || !businesses.length || !form.workspaceId}
              >
                <Save size={16} strokeWidth={2} />
                <span>Criar contrato</span>
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
    position: relative;
    z-index: 1;
    display: grid;
    grid-template-rows: auto minmax(0, 1fr);
    width: min(780px, 100%);
    max-height: min(88dvh, 940px);
    overflow: hidden;
    border: 1px solid var(--border);
    border-radius: 20px;
    background: var(--canvas);
    box-shadow: 0 22px 48px rgba(15, 23, 42, 0.18);
    animation: rise var(--motion-base) ease-out;
  }

  .dialog > header {
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

  .installment-list {
    display: grid;
    gap: 8px;
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

  .two-column-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px;
  }

  .installment-row {
    display: grid;
    grid-template-columns: 58px repeat(2, minmax(0, 1fr));
    gap: 10px;
  }

  .installment-index {
    display: inline-flex;
    min-height: 58px;
    align-items: center;
    justify-content: center;
    gap: 1px;
    border: 1px solid var(--border);
    border-radius: var(--radius-xl);
    background: var(--surface-soft);
    color: var(--text-soft);
    font-size: var(--text-md);
    font-weight: 600;
    font-variant-numeric: tabular-nums;
    user-select: none;
  }

  .installment-hash {
    color: var(--muted);
    font-size: var(--text-sm);
    font-weight: 500;
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

  .business-control {
    order: -1;
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

  .control.installment-count {
    grid-template-columns: auto minmax(0, 1fr);
  }

  .control-label {
    color: var(--muted);
    font-size: var(--text-md);
    white-space: nowrap;
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

  .catalog-state {
    margin: 0 4px;
    color: var(--muted);
    font-size: var(--text-xs);
  }

  .catalog-state--error {
    color: var(--danger);
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

  .primary:hover,
  .cancel:hover {
    border-color: #1f3fc2;
    background: #2447d8;
  }

  .success {
    border: 1px solid #16a34a;
    background: #16a34a;
    box-shadow: 0 8px 18px rgba(22, 163, 74, 0.22);
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
    background: #b91c1b;
  }

  .cancel {
    border: 1px solid var(--primary);
    background: var(--primary);
    box-shadow: 0 8px 18px rgba(46, 86, 255, 0.22);
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

    .dialog > header {
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

    .installment-row {
      grid-template-columns: 52px repeat(2, minmax(0, 1fr));
    }

    .installment-index {
      min-height: 52px;
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
    .two-column-grid {
      grid-template-columns: minmax(0, 1fr);
    }

    .installment-row {
      grid-template-columns: 52px minmax(0, 1fr);
    }

    .installment-amount {
      grid-column: 1 / -1;
    }
  }
</style>
