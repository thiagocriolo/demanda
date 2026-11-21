<script lang="ts">
  import { tick } from "svelte";
  import { ChevronDown, ChevronLeft, ChevronRight } from "@lucide/svelte";
  import { portal } from "$lib/ui/portal";
  import {
    MONTH_SHORT_LABELS,
    formatMonth,
    formatYearMonth,
    parseYearMonth,
    shiftMonth,
  } from "./finance";

  let {
    value,
    currentMonth,
    onchange,
    compact = false,
  } = $props<{
    value: string;
    currentMonth: string;
    onchange: (month: string) => void;
    compact?: boolean;
  }>();

  let root: HTMLDivElement | undefined = $state();
  let triggerButton: HTMLButtonElement | undefined = $state();
  let popoverEl: HTMLDivElement | undefined = $state();
  let open = $state(false);
  let pickerMode = $state<"months" | "years">("months");
  let pickerYear = $state(new Date().getFullYear());
  let yearGridStart = $state(Math.floor(new Date().getFullYear() / 12) * 12);
  let popoverPosition = $state({ top: 0, left: 0 });

  const selectedParts = $derived(parseYearMonth(value));
  const currentParts = $derived(parseYearMonth(currentMonth));
  const yearOptions = $derived(
    Array.from({ length: 12 }, (_, index) => yearGridStart + index),
  );

  function updatePopoverPosition(): void {
    if (!root) return;
    const anchorRect = root.getBoundingClientRect();
    const panelWidth = Math.min(296, window.innerWidth - 24);
    const panelHeight = popoverEl?.offsetHeight ?? 308;
    const margin = 12;

    let left = anchorRect.left;
    if (left + panelWidth > window.innerWidth - margin) {
      left = Math.max(margin, window.innerWidth - margin - panelWidth);
    }
    if (left < margin) left = margin;

    let top = anchorRect.bottom + 10;
    if (
      top + panelHeight > window.innerHeight - margin &&
      anchorRect.top - panelHeight - 10 >= margin
    ) {
      top = anchorRect.top - panelHeight - 10;
    }

    popoverPosition = { top: Math.round(top), left: Math.round(left) };
  }

  async function openPicker(): Promise<void> {
    pickerYear = selectedParts.year;
    yearGridStart = Math.floor(pickerYear / 12) * 12;
    pickerMode = "months";
    open = true;
    await tick();
    updatePopoverPosition();
  }

  function closePicker(restoreFocus = false): void {
    open = false;
    pickerMode = "months";
    if (restoreFocus) triggerButton?.focus();
  }

  function togglePicker(): void {
    if (open) {
      closePicker();
    } else {
      void openPicker();
    }
  }

  function stepMonth(offset: number): void {
    const next = shiftMonth(value, offset);
    onchange(next);
    if (open) {
      pickerYear = parseYearMonth(next).year;
      yearGridStart = Math.floor(pickerYear / 12) * 12;
    }
  }

  function chooseMonth(monthNumber: number): void {
    onchange(formatYearMonth(pickerYear, monthNumber));
    closePicker(true);
  }

  function chooseYear(year: number): void {
    pickerYear = year;
    pickerMode = "months";
  }

  function toggleYearMode(): void {
    if (pickerMode === "months") {
      yearGridStart = Math.floor(pickerYear / 12) * 12;
      pickerMode = "years";
    } else {
      pickerMode = "months";
    }
  }

  function chooseCurrentMonth(): void {
    onchange(currentMonth);
    closePicker(true);
  }

  $effect(() => {
    if (!open) return;

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (root?.contains(target) || popoverEl?.contains(target)) return;
      closePicker();
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closePicker(true);
      }
    };
    const handleViewportChange = () => updatePopoverPosition();

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    window.addEventListener("resize", handleViewportChange);
    window.addEventListener("scroll", handleViewportChange, true);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("resize", handleViewportChange);
      window.removeEventListener("scroll", handleViewportChange, true);
    };
  });
</script>

<div class="month-picker" class:compact bind:this={root}>
  <button
    class="nav-button"
    type="button"
    aria-label="Mês anterior"
    title="Mês anterior"
    onclick={() => stepMonth(-1)}
  >
    <ChevronLeft size={18} aria-hidden="true" />
  </button>

  <h1 class="month-heading">
    <button
      class="month-trigger"
      class:open
      type="button"
      bind:this={triggerButton}
      aria-haspopup="dialog"
      aria-expanded={open}
      aria-label={`Escolher mês e ano (${formatMonth(value)})`}
      onclick={togglePicker}
    >
      <span>{formatMonth(value)}</span>
      {#if !compact}
        <ChevronDown
          size={18}
          class={open ? "chevron rotated" : "chevron"}
          aria-hidden="true"
        />
      {/if}
    </button>
  </h1>

  <button
    class="nav-button"
    type="button"
    aria-label="Próximo mês"
    title="Próximo mês"
    onclick={() => stepMonth(1)}
  >
    <ChevronRight size={18} aria-hidden="true" />
  </button>
</div>

{#if open}
  <div
    class="month-popover"
    role="dialog"
    aria-label="Escolher mês e ano"
    style={`top: ${popoverPosition.top}px; left: ${popoverPosition.left}px;`}
    bind:this={popoverEl}
    use:portal
  >
    <div class="popover-header">
      <button
        class="popover-nav"
        type="button"
        aria-label={pickerMode === "months"
          ? "Ano anterior"
          : "Período anterior"}
        onclick={() => {
          if (pickerMode === "months") pickerYear -= 1;
          else yearGridStart -= 12;
        }}
      >
        <ChevronLeft size={16} aria-hidden="true" />
      </button>

      <button
        class="popover-year-button"
        type="button"
        aria-label={pickerMode === "months"
          ? `Selecionar ano (${pickerYear})`
          : "Voltar para meses"}
        onclick={toggleYearMode}
      >
        {#if pickerMode === "months"}
          {pickerYear}
        {:else}
          {yearGridStart} – {yearGridStart + 11}
        {/if}
      </button>

      <button
        class="popover-nav"
        type="button"
        aria-label={pickerMode === "months" ? "Próximo ano" : "Próximo período"}
        onclick={() => {
          if (pickerMode === "months") pickerYear += 1;
          else yearGridStart += 12;
        }}
      >
        <ChevronRight size={16} aria-hidden="true" />
      </button>
    </div>

    {#if pickerMode === "months"}
      <div
        class="picker-grid"
        role="group"
        aria-label={`Meses de ${pickerYear}`}
      >
        {#each MONTH_SHORT_LABELS as label, index}
          {@const monthNumber = index + 1}
          {@const candidate = formatYearMonth(pickerYear, monthNumber)}
          {@const isSelected =
            selectedParts.year === pickerYear &&
            selectedParts.month === monthNumber}
          {@const isCurrent =
            currentParts.year === pickerYear &&
            currentParts.month === monthNumber}
          <button
            class="picker-cell"
            class:selected={isSelected}
            class:current={isCurrent && !isSelected}
            type="button"
            aria-pressed={isSelected}
            aria-label={formatMonth(candidate)}
            onclick={() => chooseMonth(monthNumber)}
          >
            {label}
          </button>
        {/each}
      </div>
    {:else}
      <div
        class="picker-grid"
        role="group"
        aria-label={`Anos de ${yearGridStart} a ${yearGridStart + 11}`}
      >
        {#each yearOptions as year (year)}
          {@const isSelected = selectedParts.year === year}
          {@const isCurrent = currentParts.year === year}
          <button
            class="picker-cell"
            class:selected={isSelected}
            class:current={isCurrent && !isSelected}
            type="button"
            aria-pressed={isSelected}
            onclick={() => chooseYear(year)}
          >
            {year}
          </button>
        {/each}
      </div>
    {/if}

    <div class="popover-footer">
      <button
        class="popover-today"
        type="button"
        disabled={value === currentMonth}
        onclick={chooseCurrentMonth}
      >
        Mês atual
      </button>
      <button
        class="popover-close"
        type="button"
        onclick={() => closePicker(true)}
      >
        Fechar
      </button>
    </div>
  </div>
{/if}

<style>
  .month-picker {
    display: inline-flex;
    max-width: 100%;
    align-items: center;
    gap: 8px;
  }
  .month-heading {
    min-width: 0;
    margin: 0;
    font-size: clamp(var(--text-2xl), 2.4vw, 30px);
    line-height: 1.08;
    letter-spacing: -0.04em;
  }
  .month-trigger {
    display: inline-flex;
    max-width: 100%;
    align-items: center;
    gap: 8px;
    padding: 4px 10px;
    border: 1px solid transparent;
    border-radius: 11px;
    color: var(--ink-950);
    background: transparent;
    font: inherit;
    letter-spacing: inherit;
    text-align: left;
    transition:
      border-color var(--motion-fast),
      background var(--motion-fast),
      color var(--motion-fast);
  }
  .month-trigger:hover,
  .month-trigger.open {
    border-color: rgba(46, 86, 255, 0.22);
    color: var(--brand-700, var(--brand-600));
    background: rgba(46, 86, 255, 0.07);
  }
  .month-trigger :global(.chevron) {
    flex: 0 0 auto;
    color: var(--ink-500);
    transition:
      transform var(--motion-fast),
      color var(--motion-fast);
  }
  .month-trigger:hover :global(.chevron),
  .month-trigger.open :global(.chevron) {
    color: var(--brand-600);
  }
  .month-trigger :global(.rotated) {
    transform: rotate(180deg);
  }
  .nav-button {
    display: inline-grid;
    width: 34px;
    height: 34px;
    flex: 0 0 auto;
    place-items: center;
    border: 1px solid var(--border);
    border-radius: 10px;
    color: var(--ink-700);
    background: rgba(255, 255, 255, 0.85);
    transition:
      border-color var(--motion-fast),
      color var(--motion-fast),
      background var(--motion-fast),
      transform var(--motion-fast);
  }
  .nav-button:hover {
    border-color: rgba(46, 86, 255, 0.3);
    color: var(--brand-600);
    background: rgba(46, 86, 255, 0.08);
    transform: translateY(-1px);
  }
  .month-picker.compact {
    display: grid;
    width: 100%;
    min-height: 34px;
    grid-template-columns: 34px minmax(0, 1fr) 34px;
    gap: 0;
    border: 1px solid var(--border);
    border-radius: 10px;
    background: rgba(255, 255, 255, 0.85);
    overflow: hidden;
  }
  .month-picker.compact .month-heading {
    font-size: var(--text-lg);
    line-height: 1;
    letter-spacing: -0.025em;
  }
  .month-picker.compact .month-trigger {
    position: relative;
    width: 100%;
    justify-content: center;
    gap: 0;
    padding: 2px 8px;
    border: 0;
    border-radius: 0;
  }
  .month-picker.compact .month-trigger:hover,
  .month-picker.compact .month-trigger.open {
    border-color: transparent;
    background: rgba(46, 86, 255, 0.07);
  }
  .month-picker.compact .nav-button {
    width: 34px;
    height: 32px;
    border: 0;
    border-radius: 0;
    background: transparent;
    box-shadow: none;
  }
  .month-popover {
    position: fixed;
    z-index: 3000;
    width: min(296px, calc(100vw - 24px));
    padding: 14px;
    border: 1px solid var(--border);
    border-radius: 16px;
    background: var(--panel, #ffffff);
    box-shadow: 0 18px 42px rgba(15, 23, 42, 0.16);
    animation: popover-appear var(--motion-fast) ease-out;
  }
  .popover-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    margin-bottom: 12px;
  }
  .popover-nav {
    display: inline-grid;
    width: 32px;
    height: 32px;
    flex: 0 0 auto;
    place-items: center;
    border: 1px solid var(--border);
    border-radius: 9px;
    color: var(--ink-700);
    background: var(--surface-soft);
    transition:
      border-color var(--motion-fast),
      color var(--motion-fast),
      background var(--motion-fast);
  }
  .popover-nav:hover {
    border-color: rgba(46, 86, 255, 0.28);
    color: var(--brand-600);
    background: rgba(46, 86, 255, 0.08);
  }
  .popover-year-button {
    min-height: 32px;
    padding: 0 12px;
    border: 1px solid transparent;
    border-radius: 9px;
    color: var(--ink-950);
    background: transparent;
    font-size: var(--text-md);
    font-weight: 700;
    transition:
      border-color var(--motion-fast),
      color var(--motion-fast),
      background var(--motion-fast);
  }
  .popover-year-button:hover {
    border-color: rgba(46, 86, 255, 0.2);
    color: var(--brand-600);
    background: rgba(46, 86, 255, 0.07);
  }
  .picker-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 7px;
  }
  .picker-cell {
    display: inline-flex;
    min-height: 38px;
    align-items: center;
    justify-content: center;
    border: 1px solid var(--border);
    border-radius: 10px;
    color: var(--ink-700);
    background: var(--surface-soft);
    font-size: var(--text-sm);
    font-weight: 600;
    transition:
      border-color var(--motion-fast),
      color var(--motion-fast),
      background var(--motion-fast);
  }
  .picker-cell:hover {
    border-color: rgba(46, 86, 255, 0.3);
    color: var(--brand-600);
    background: rgba(46, 86, 255, 0.08);
  }
  .picker-cell.current {
    border-color: rgba(46, 86, 255, 0.35);
    color: var(--brand-600);
    background: rgba(46, 86, 255, 0.09);
  }
  .picker-cell.selected {
    border-color: var(--brand-600);
    color: #ffffff;
    background: var(--brand-600);
    box-shadow: 0 6px 14px rgba(46, 86, 255, 0.22);
  }
  .popover-footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    margin-top: 12px;
    padding-top: 10px;
    border-top: 1px solid var(--border);
  }
  .popover-today,
  .popover-close {
    min-height: 30px;
    padding: 0 10px;
    border: 0;
    border-radius: 8px;
    background: transparent;
    font-size: var(--text-xs);
    font-weight: 600;
    transition:
      color var(--motion-fast),
      background var(--motion-fast);
  }
  .popover-today {
    color: var(--brand-600);
  }
  .popover-today:hover:not(:disabled) {
    background: rgba(46, 86, 255, 0.08);
  }
  .popover-today:disabled {
    color: var(--ink-400);
    cursor: default;
  }
  .popover-close {
    color: var(--ink-500);
  }
  .popover-close:hover {
    color: var(--ink-950);
    background: var(--surface-hover);
  }
  @keyframes popover-appear {
    from {
      opacity: 0;
      transform: translateY(-4px) scale(0.98);
    }
  }
  @media (max-width: 640px) {
    .month-picker {
      gap: 6px;
    }
    .month-trigger {
      padding: 4px 8px;
      gap: 6px;
    }
    .nav-button {
      width: 32px;
      height: 32px;
    }
  }
</style>
