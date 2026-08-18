<script lang="ts">
  import { Save, X } from "@lucide/svelte";
  import { untrack } from "svelte";
  import type {
    FinanceEntry,
    FinanceEntryDraft,
    FinanceEntryMode,
    FinanceEntryType,
    FinanceInstallment,
  } from "./finance";
  import { formatMoney, parseMoney } from "./finance";
  import {
    buildFinanceInstallments,
    financeInstallmentsTotal,
    rebalanceFinanceInstallments,
  } from "./installments";

  let {
    type,
    entry = null,
    installmentEntries = [],
    onclose,
    onsave,
  } = $props<{
    type: FinanceEntryType;
    entry?: FinanceEntry | null;
    installmentEntries?: FinanceEntry[];
    onclose: () => void;
    onsave: (draft: FinanceEntryDraft) => void;
  }>();

  const today = new Date().toISOString().slice(0, 10);
  const initialEntry = untrack(() => entry);
  const initialEntries: FinanceEntry[] = untrack(() =>
    installmentEntries.length > 1
      ? installmentEntries.toSorted(
          (a: FinanceEntry, b: FinanceEntry) =>
            (a.installmentNumber ?? 1) - (b.installmentNumber ?? 1),
        )
      : initialEntry
        ? [initialEntry]
        : [],
  );
  const initialAmount = initialEntries.reduce(
    (sum, item) => sum + item.amount,
    0,
  );
  const initialPlan: FinanceInstallment[] =
    initialEntries.length > 1
      ? initialEntries.map((item, index) => ({
          number: item.installmentNumber ?? index + 1,
          dueDate: item.date,
          amount: item.amount,
        }))
      : [];

  let title = $state(initialEntry?.title ?? "");
  let mode = $state<FinanceEntryMode>(initialEntry?.mode ?? "pontual");
  let category = $state(initialEntry?.category ?? "");
  let amount = $state(initialAmount > 0 ? moneyInputValue(initialAmount) : "");
  let date = $state(initialEntries[0]?.date ?? today);
  let period = $state(String(initialEntry?.recurrenceCount ?? 12));
  let hasInstallments = $state(initialPlan.length > 1);
  let installmentsCount = $state(
    initialPlan.length > 1 ? String(initialPlan.length) : "01",
  );
  let firstPaymentDate = $state(
    initialPlan[0]?.dueDate ?? initialEntries[0]?.date ?? today,
  );
  let firstPaymentWasChanged = $state(false);
  let installmentPlan = $state<FinanceInstallment[]>(initialPlan);
  let validationError = $state("");
  let notes = $state(initialEntry?.notes ?? "");

  const typeLabel = $derived(type === "receita" ? "receita" : "despesa");
  const titleLabel = $derived(
    entry ? `Editar ${typeLabel}` : `Nova ${typeLabel}`,
  );

  function moneyInputValue(value: number): string {
    return value.toLocaleString("pt-BR", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }

  function normalizedInstallmentsCount(): number {
    return Math.max(
      2,
      Math.min(99, Number.parseInt(installmentsCount, 10) || 2),
    );
  }

  function validateInstallments(plan = installmentPlan): boolean {
    if (mode !== "pontual" || !hasInstallments) {
      validationError = "";
      return true;
    }

    const parsedAmount = parseMoney(amount);
    if (parsedAmount <= 0) {
      validationError = "Informe um valor total válido para gerar as parcelas.";
    } else if (!firstPaymentDate) {
      validationError = `Informe a data do primeiro ${type === "receita" ? "recebimento" : "pagamento"} para gerar as parcelas.`;
    } else if (plan.some((item) => !item.dueDate)) {
      validationError = "Todas as parcelas precisam ter vencimento.";
    } else if (plan.some((item) => item.amount < 0)) {
      validationError = "Nenhuma parcela pode ter valor negativo.";
    } else if (
      Math.round(financeInstallmentsTotal(plan) * 100) !==
      Math.round(parsedAmount * 100)
    ) {
      validationError = `A soma das parcelas precisa ser igual ao valor total da ${typeLabel}.`;
    } else {
      validationError = "";
    }

    return !validationError;
  }

  function rebuildInstallments(): void {
    if (!hasInstallments || mode !== "pontual") {
      installmentPlan = [];
      validationError = "";
      return;
    }

    const count = normalizedInstallmentsCount();
    installmentsCount = String(count);
    installmentPlan = buildFinanceInstallments(
      parseMoney(amount),
      count,
      firstPaymentDate,
    );
    validateInstallments(installmentPlan);
  }

  function toggleInstallments(event: Event): void {
    hasInstallments = (event.currentTarget as HTMLInputElement).checked;
    if (hasInstallments) {
      if (Number.parseInt(installmentsCount, 10) <= 1) installmentsCount = "2";
      if (!firstPaymentDate) firstPaymentDate = date;
    } else {
      installmentsCount = "01";
    }
    rebuildInstallments();
  }

  function changeInstallmentsCount(event: Event): void {
    installmentsCount = (event.currentTarget as HTMLInputElement).value;
    if (!installmentsCount) return;
    rebuildInstallments();
  }

  function changeAmount(event: Event): void {
    amount = (event.currentTarget as HTMLInputElement).value;
    if (hasInstallments) rebuildInstallments();
  }

  function changeDate(event: Event): void {
    date = (event.currentTarget as HTMLInputElement).value;
    if (!firstPaymentWasChanged) firstPaymentDate = date;
    if (hasInstallments) rebuildInstallments();
  }

  function changeFirstPaymentDate(event: Event): void {
    firstPaymentDate = (event.currentTarget as HTMLInputElement).value;
    firstPaymentWasChanged = true;
    rebuildInstallments();
  }

  function changeInstallmentDate(index: number, event: Event): void {
    const dueDate = (event.currentTarget as HTMLInputElement).value;
    installmentPlan = installmentPlan.map((item, itemIndex) =>
      itemIndex === index ? { ...item, dueDate } : item,
    );
    validateInstallments(installmentPlan);
  }

  function changeInstallmentAmount(index: number, event: Event): void {
    const value = parseMoney((event.currentTarget as HTMLInputElement).value);
    installmentPlan = rebalanceFinanceInstallments(
      installmentPlan,
      index,
      value,
      parseMoney(amount),
    );
    validateInstallments(installmentPlan);
  }

  function submit(event: SubmitEvent): void {
    event.preventDefault();
    const parsedAmount = parseMoney(amount);
    if (!title.trim() || !date || parsedAmount <= 0) return;
    if (!validateInstallments()) return;

    onsave({
      title: title.trim(),
      type,
      amount: parsedAmount,
      date,
      mode,
      category: category.trim(),
      notes: notes.trim(),
      recurrenceMonths:
        mode === "fixa"
          ? Math.max(1, Math.min(120, Number.parseInt(period, 10) || 12))
          : undefined,
      installments:
        mode === "pontual" && hasInstallments
          ? installmentPlan.map((item, index) => ({
              ...item,
              number: index + 1,
            }))
          : undefined,
    });
  }

  function onkeydown(event: KeyboardEvent): void {
    if (event.key === "Escape") onclose();
  }
</script>

<svelte:window {onkeydown} />

<div class="modal" role="presentation">
  <button class="backdrop" type="button" aria-label="Fechar" onclick={onclose}
  ></button>
  <div
    class="dialog"
    role="dialog"
    aria-modal="true"
    aria-labelledby="finance-modal-title"
  >
    <header>
      <h2 id="finance-modal-title">{titleLabel}</h2>
      <button
        class="icon-button"
        type="button"
        aria-label="Fechar"
        onclick={onclose}><X size={19} /></button
      >
    </header>

    <form onsubmit={submit}>
      <input
        type="text"
        placeholder="Título"
        aria-label="Título"
        required
        bind:value={title}
      />

      <div class="form-grid">
        <select
          aria-label="Tipo"
          bind:value={mode}
          onchange={rebuildInstallments}
        >
          <option value="pontual">Pontual</option>
          <option value="fixa">Fixa</option>
        </select>

        {#if type === "receita"}
          <select aria-label="Categoria" bind:value={category}>
            <option value="">Categoria</option>
            <option value="Contratos">Contratos</option>
            <option value="Alterações">Alterações</option>
            <option value="Fees">Fees</option>
            <option value="Bônus">Bônus</option>
            <option value="Outros">Outros</option>
          </select>
        {:else}
          <input
            type="text"
            placeholder="Categoria"
            aria-label="Categoria"
            bind:value={category}
          />
        {/if}
      </div>

      <div class="form-grid">
        <input
          type="text"
          inputmode="decimal"
          placeholder="Valor"
          aria-label="Valor"
          required
          value={amount}
          oninput={changeAmount}
        />
        <input
          type="date"
          aria-label="Vencimento"
          required
          value={date}
          oninput={changeDate}
        />
      </div>

      {#if mode === "fixa"}
        <input
          type="number"
          min="1"
          max="120"
          placeholder="Período"
          aria-label="Período"
          bind:value={period}
        />
      {:else}
        <section class="installments" aria-label="Configuração do parcelamento">
          <div class="installments-controls">
            <label class="toggle">
              <input
                type="checkbox"
                checked={hasInstallments}
                onchange={toggleInstallments}
              />
              <span aria-hidden="true"></span>
              Parcelamento
            </label>

            <input
              type="number"
              min="2"
              max="99"
              aria-label="Parcelas"
              readonly={!hasInstallments}
              value={installmentsCount}
              oninput={changeInstallmentsCount}
            />

            <input
              type="date"
              aria-label={`Data do primeiro ${type === "receita" ? "recebimento" : "pagamento"}`}
              disabled={!hasInstallments}
              value={firstPaymentDate}
              oninput={changeFirstPaymentDate}
            />
          </div>

          {#if hasInstallments && installmentPlan.length > 1}
            <div class="installments-panel">
              {#if validationError}
                <div class="installments-alert" role="alert">
                  {validationError}
                </div>
              {/if}

              <div class="installments-list">
                {#each installmentPlan as installment, index}
                  <div class="installment-row">
                    <strong>Parcela {String(index + 1).padStart(2, "0")}</strong
                    >
                    <input
                      type="date"
                      aria-label={`Vencimento da parcela ${index + 1}`}
                      value={installment.dueDate}
                      onchange={(event) => changeInstallmentDate(index, event)}
                    />
                    <input
                      type="text"
                      inputmode="decimal"
                      aria-label={`Valor da parcela ${index + 1}`}
                      value={moneyInputValue(installment.amount)}
                      onchange={(event) =>
                        changeInstallmentAmount(index, event)}
                    />
                  </div>
                {/each}
              </div>
            </div>
          {/if}
        </section>
      {/if}

      <textarea
        rows="3"
        maxlength="500"
        placeholder="Observação"
        aria-label="Observação"
        bind:value={notes}></textarea>

      <footer>
        <button class="primary" type="submit"
          ><Save size={17} />{entry
            ? "Salvar alterações"
            : `Adicionar ${typeLabel}`}</button
        >
        <button class="cancel" type="button" onclick={onclose}
          ><X size={17} />Cancelar</button
        >
      </footer>
    </form>
  </div>
</div>

<style>
  .modal {
    position: fixed;
    z-index: 100;
    inset: 0;
    display: grid;
    place-items: center;
    padding: 18px;
  }
  .backdrop {
    position: absolute;
    inset: 0;
    border: 0;
    background: rgba(15, 23, 42, 0.55);
    cursor: default;
  }
  .dialog {
    position: relative;
    width: min(760px, 100%);
    max-height: calc(100dvh - 36px);
    overflow-y: auto;
    border: 1px solid var(--border);
    border-radius: var(--radius-xl);
    background: var(--panel);
    box-shadow: var(--shadow-md);
  }
  header {
    display: flex;
    min-height: 66px;
    align-items: center;
    justify-content: space-between;
    gap: 20px;
    padding: 16px 20px;
    border-bottom: 1px solid var(--border);
  }
  h2 {
    color: var(--ink-950);
    font-size: var(--text-xl);
  }
  .icon-button {
    display: grid;
    width: 36px;
    height: 36px;
    place-items: center;
    border: 1px solid var(--border);
    border-radius: 10px;
    color: var(--ink-500);
    background: var(--surface-soft);
  }
  form {
    display: grid;
    gap: 14px;
    padding: 20px;
  }
  .form-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 14px;
  }
  input,
  select,
  textarea {
    width: 100%;
    min-height: 42px;
    border: 1px solid var(--border);
    border-radius: 10px;
    padding: 0 13px;
    color: var(--ink-950);
    background: var(--panel);
    font: inherit;
    outline: 0;
  }
  input:focus,
  select:focus,
  textarea:focus {
    border-color: var(--primary);
    box-shadow: none;
  }
  input:read-only,
  input:disabled {
    color: var(--ink-500);
    background: var(--surface-soft);
    cursor: not-allowed;
  }
  textarea {
    min-height: 92px;
    padding-block: 11px;
    resize: vertical;
  }
  .installments {
    display: grid;
    gap: 14px;
    padding: 12px;
    border: 1px solid var(--border);
    border-radius: 10px;
    background: var(--surface-soft);
  }
  .installments-controls {
    display: grid;
    grid-template-columns: minmax(180px, 1fr) 120px minmax(190px, 1fr);
    align-items: center;
    gap: 14px;
  }
  .toggle {
    display: inline-flex;
    align-items: center;
    gap: 10px;
    color: var(--ink-700);
    font-size: var(--text-sm);
  }
  .toggle input {
    position: absolute;
    width: 1px;
    height: 1px;
    opacity: 0;
  }
  .toggle span {
    position: relative;
    width: 46px;
    height: 26px;
    flex: 0 0 auto;
    border: 1px solid var(--border);
    border-radius: var(--radius-pill);
    background: var(--panel);
    transition: background var(--motion-fast);
  }
  .toggle span::after {
    content: "";
    position: absolute;
    top: 3px;
    left: 3px;
    width: 18px;
    height: 18px;
    border-radius: 50%;
    background: var(--ink-400);
    transition:
      transform var(--motion-fast),
      background var(--motion-fast);
  }
  .toggle input:checked + span {
    border-color: var(--primary);
    background: var(--primary);
  }
  .toggle input:checked + span::after {
    background: #fff;
    transform: translateX(20px);
  }
  .installments-panel,
  .installments-list {
    display: grid;
    gap: 10px;
  }
  .installments-panel {
    padding-top: 12px;
    border-top: 1px solid var(--border);
  }
  .installments-alert {
    padding: 10px 12px;
    border: 1px solid rgba(220, 38, 38, 0.25);
    border-radius: 10px;
    color: var(--danger);
    background: rgba(220, 38, 38, 0.08);
    font-size: var(--text-sm);
  }
  .installment-row {
    display: grid;
    grid-template-columns: minmax(110px, 0.7fr) repeat(2, minmax(0, 1fr));
    align-items: center;
    gap: 10px;
    padding: 10px;
    border: 1px solid var(--border);
    border-radius: 10px;
    background: var(--panel);
  }
  .installment-row strong {
    color: var(--ink-700);
    font-size: var(--text-sm);
  }
  footer {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 10px;
    padding-top: 4px;
  }
  footer button {
    display: inline-flex;
    min-height: 42px;
    align-items: center;
    justify-content: center;
    gap: 8px;
    border: 1px solid transparent;
    border-radius: 10px;
    padding: 0 16px;
    font-weight: 600;
  }
  .primary {
    color: #fff;
    background: var(--primary);
  }
  .cancel {
    border-color: rgba(220, 38, 38, 0.25);
    color: var(--danger);
    background: rgba(220, 38, 38, 0.08);
  }
  @media (max-width: 700px) {
    .form-grid,
    .installments-controls,
    .installment-row {
      grid-template-columns: 1fr;
    }
    footer {
      align-items: stretch;
      flex-direction: column;
    }
    footer button {
      width: 100%;
    }
  }
</style>
