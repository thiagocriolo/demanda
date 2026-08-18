<script module lang="ts">
  import type { LucideIcon } from "@lucide/svelte";

  export type GlobalSelectorItem = {
    id: string;
    label: string;
    description?: string;
    avatarUrl?: string;
    email?: string;
    pending?: boolean;
    relevance?: number;
    updatedAt?: string;
    actionLabel?: string;
    actionIcon?: LucideIcon;
    actionDisabled?: boolean;
    actionBusy?: boolean;
  };

  export type GlobalSelectorPresentation = "search" | "chooser";
  export type GlobalSelectorSelection = "single" | "multiple" | "action";
  export type GlobalSelectorSelectedPosition = "above" | "below";
  export type GlobalSelectorDropdownPosition = "above" | "below";
  export type GlobalSelectorIcon = LucideIcon;
</script>

<script lang="ts">
  import { Check, ChevronDown, LoaderCircle, Search, X } from "@lucide/svelte";
  import { parseAvatarProfileUrl } from "$lib/avatar/avatar-options";
  import { tick } from "svelte";

  let {
    items,
    value = $bindable(""),
    selected = $bindable([]),
    label,
    placeholder = "Busque pelo nome...",
    emptyMessage = "Nenhuma opção encontrada.",
    presentation = "search",
    selection = "single",
    selectedPosition = "above",
    dropdownPosition = "below",
    maxResults = 10,
    compactEmpty = false,
    preserveItemOrder = false,
    disabled = false,
    required = false,
    invalid = false,
    errorMessage = "",
    icon: Icon = Search,
    controlIcon: ControlIcon = Search,
    showInitials = false,
    showLabel = false,
    showHelper = false,
    helperMessage = "Você pode selecionar mais de um item.",
    loading = false,
    loadingMessage = "Buscando…",
    onchange,
    onquerychange,
    onselectedchange,
    onitemaction,
  }: {
    items: GlobalSelectorItem[];
    value?: string;
    selected?: GlobalSelectorItem[];
    label: string;
    placeholder?: string;
    emptyMessage?: string;
    presentation?: GlobalSelectorPresentation;
    selection?: GlobalSelectorSelection;
    selectedPosition?: GlobalSelectorSelectedPosition;
    dropdownPosition?: GlobalSelectorDropdownPosition;
    maxResults?: number;
    compactEmpty?: boolean;
    preserveItemOrder?: boolean;
    disabled?: boolean;
    required?: boolean;
    invalid?: boolean;
    errorMessage?: string;
    icon?: GlobalSelectorIcon;
    controlIcon?: GlobalSelectorIcon;
    showInitials?: boolean;
    showLabel?: boolean;
    showHelper?: boolean;
    helperMessage?: string;
    loading?: boolean;
    loadingMessage?: string;
    onchange?: (value: string) => void;
    onquerychange?: (query: string) => void;
    onselectedchange?: (selected: GlobalSelectorItem[]) => void;
    onitemaction?: (item: GlobalSelectorItem) => void;
  } = $props();

  const componentId = $props.id();
  const listboxId = `${componentId}-options`;
  const errorId = `${componentId}-error`;

  let root: HTMLDivElement;
  let input = $state<HTMLInputElement>();
  let open = $state(false);
  let query = $state("");
  let searching = $state(false);
  let activeIndex = $state(0);
  let wasOpenOnControlPointerDown = false;
  let suppressNextFocus = false;
  let syncedValue = "";
  let syncedLabel = "";

  let multiple = $derived(selection === "multiple");
  let action = $derived(selection === "action");
  let chooser = $derived(presentation === "chooser");
  let selectedItem = $derived(items.find((item) => item.id === value));
  let selectedIds = $derived(new Set(selected.map((item) => item.id)));
  let results = $derived.by(() => {
    const normalizedQuery =
      !chooser && searching ? normalize(query.trim()) : "";
    const matches = items.filter((item) => {
      if (multiple && selectedIds.has(item.id)) return false;
      if (!normalizedQuery) return true;
      return normalize(`${item.label} ${item.description ?? ""}`).includes(
        normalizedQuery,
      );
    });

    if (!preserveItemOrder) {
      matches.sort((first, second) => {
        if (normalizedQuery) return compareLabels(first, second);
        const relevanceDifference = rank(second) - rank(first);
        return relevanceDifference || compareLabels(first, second);
      });
    }

    return matches.slice(0, Math.max(0, maxResults));
  });

  $effect(() => {
    if (multiple) return;
    const nextValue = value;
    const nextLabel = selectedItem?.label ?? "";
    if (nextValue !== syncedValue || nextLabel !== syncedLabel) {
      syncedValue = nextValue;
      syncedLabel = nextLabel;
      query = nextLabel;
      searching = false;
    }
  });

  $effect(() => {
    input?.setCustomValidity(
      required && (multiple ? selected.length === 0 : !selectedItem)
        ? `Selecione ${label.toLocaleLowerCase("pt-BR")}.`
        : "",
    );
  });

  $effect(() => {
    if (results.length === 0) activeIndex = 0;
    else if (activeIndex >= results.length) activeIndex = results.length - 1;
  });

  $effect(() => {
    if (disabled) open = false;
  });

  function normalize(text: string): string {
    return text
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, "")
      .toLocaleLowerCase("pt-BR");
  }

  function compareLabels(
    first: GlobalSelectorItem,
    second: GlobalSelectorItem,
  ): number {
    return first.label.localeCompare(second.label, "pt-BR", {
      sensitivity: "base",
    });
  }

  function rank(item: GlobalSelectorItem): number {
    if (item.relevance !== undefined) return item.relevance;
    const timestamp = Date.parse(item.updatedAt ?? "");
    return Number.isFinite(timestamp) ? timestamp : 0;
  }

  function initials(label: string): string {
    return label
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0])
      .join("")
      .toLocaleUpperCase("pt-BR");
  }

  function avatarStyle(item: GlobalSelectorItem): string | undefined {
    if (!item.avatarUrl) return undefined;
    const avatar = parseAvatarProfileUrl(item.avatarUrl);
    return avatar
      ? `--option-avatar-background: ${avatar.avatarColor}`
      : undefined;
  }

  function setValue(nextValue: string, nextLabel = ""): void {
    const changed = value !== nextValue;
    syncedValue = nextValue;
    syncedLabel = nextLabel;
    value = nextValue;
    if (changed) onchange?.(nextValue);
  }

  function setSelected(nextSelected: GlobalSelectorItem[]): void {
    selected = nextSelected;
    onselectedchange?.(nextSelected);
  }

  function openOptions(): void {
    if (disabled) return;
    open = true;
    activeIndex = multiple
      ? 0
      : Math.max(
          results.findIndex((item) => item.id === value),
          0,
        );
  }

  function handleFocus(): void {
    if (suppressNextFocus) {
      suppressNextFocus = false;
      return;
    }
    openOptions();
    if (!chooser && !multiple && value) {
      queueMicrotask(() => input?.select());
    }
  }

  function handleControlPointerDown(): void {
    wasOpenOnControlPointerDown = open;
  }

  function handleControlClick(): void {
    if (disabled) return;
    open = !wasOpenOnControlPointerDown;
    if (open) {
      activeIndex = multiple
        ? 0
        : Math.max(
            results.findIndex((item) => item.id === value),
            0,
          );
    }
    input?.focus();
  }

  function handleInput(event: Event): void {
    if (chooser) return;
    query = (event.currentTarget as HTMLInputElement).value;
    onquerychange?.(query);
    searching = true;
    open = true;
    activeIndex = 0;
    if (!multiple && value) setValue("");
  }

  function selectItem(item: GlobalSelectorItem): void {
    if (action) {
      if (item.actionDisabled || item.actionBusy) return;
      onitemaction?.(item);
      query = "";
      onquerychange?.("");
      searching = false;
      activeIndex = 0;
      open = false;
      return;
    }

    if (multiple) {
      setSelected([...selected, item]);
      query = "";
      onquerychange?.("");
      searching = false;
      activeIndex = 0;
      open = false;
      queueMicrotask(() => {
        if (!input || document.activeElement === input) return;
        suppressNextFocus = true;
        input.focus();
      });
      return;
    }

    setValue(item.id, item.label);
    query = item.label;
    searching = false;
    activeIndex = 0;
    open = false;
    queueMicrotask(() => {
      if (!input || document.activeElement === input) return;
      suppressNextFocus = true;
      input.focus();
    });
  }

  function removeItem(itemId: string): void {
    if (disabled) return;
    setSelected(selected.filter((item) => item.id !== itemId));
  }

  function clearControl(event: MouseEvent): void {
    event.stopPropagation();
    if (multiple) {
      query = "";
      onquerychange?.("");
    } else {
      setValue("");
      query = "";
    }
    searching = false;
    activeIndex = 0;
    if (input && document.activeElement !== input) {
      suppressNextFocus = true;
      input.focus();
    }
    open = false;
  }

  async function revealActiveOption(): Promise<void> {
    await tick();
    document
      .getElementById(`${componentId}-option-${activeIndex}`)
      ?.scrollIntoView({ block: "nearest" });
  }

  function handleKeydown(event: KeyboardEvent): void {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (!open) openOptions();
      else if (results.length > 0) {
        activeIndex = Math.min(activeIndex + 1, results.length - 1);
      }
      void revealActiveOption();
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      if (!open) {
        openOptions();
        activeIndex = Math.max(results.length - 1, 0);
      } else if (results.length > 0) {
        activeIndex = Math.max(activeIndex - 1, 0);
      }
      void revealActiveOption();
      return;
    }

    if (event.key === "Enter" && open && results[activeIndex]) {
      event.preventDefault();
      selectItem(results[activeIndex]);
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      open = false;
      if (multiple) query = "";
      return;
    }

    if (event.key === "Tab") open = false;
  }

  function handleOutsidePointer(event: PointerEvent): void {
    if (root && !root.contains(event.target as Node)) open = false;
  }
</script>

<svelte:window onpointerdown={handleOutsidePointer} />

<div class="global-selector" bind:this={root}>
  {#if showLabel}
    <div class="field-heading">
      <label for={componentId}>{label}</label>
      {#if multiple && selected.length > 0}
        <span
          >{selected.length} selecionado{selected.length === 1 ? "" : "s"}</span
        >
      {/if}
    </div>
  {/if}

  {#snippet selectedItems()}
    {#if multiple && selected.length > 0}
      <ul class="selected-list" aria-label={`${label}: itens selecionados`}>
        {#each selected as item (item.id)}
          <li>
            <span
              class="option-visual option-visual--selected"
              style={avatarStyle(item)}
              aria-hidden="true"
            >
              {#if item.avatarUrl}
                <img src={item.avatarUrl} alt="" />
              {:else if showInitials}
                {initials(item.label)}
              {:else}
                <Icon size={18} strokeWidth={1.8} />
              {/if}
            </span>
            <span class="option-copy">
              <strong>{item.label}</strong>
              {#if item.description}<small>{item.description}</small>{/if}
            </span>
            <span class="selected-state"
              >{#if item.pending}Pendente{:else}<Check
                  size={15}
                />Selecionado{/if}</span
            >
            <button
              type="button"
              aria-label={`Remover ${item.label} da seleção`}
              {disabled}
              onclick={() => removeItem(item.id)}
            >
              <X size={18} strokeWidth={1.9} />
            </button>
          </li>
        {/each}
      </ul>
    {/if}
  {/snippet}

  {#if selectedPosition === "above"}{@render selectedItems()}{/if}

  <div class="picker" class:picker--open={open} class:picker--invalid={invalid}>
    <div
      class="selector-control"
      class:selector-control--disabled={disabled}
      role="presentation"
      onpointerdown={handleControlPointerDown}
      onclick={handleControlClick}
    >
      <span class="control-icon" aria-hidden="true">
        {#if chooser}
          <Icon size={18} strokeWidth={1.8} />
        {:else}
          <ControlIcon size={18} strokeWidth={1.8} />
        {/if}
      </span>
      <input
        bind:this={input}
        id={componentId}
        type="text"
        role="combobox"
        aria-label={label}
        aria-autocomplete={chooser ? "none" : "list"}
        aria-expanded={open}
        aria-controls={listboxId}
        aria-activedescendant={open && results[activeIndex]
          ? `${componentId}-option-${activeIndex}`
          : undefined}
        aria-required={required}
        aria-invalid={invalid}
        aria-describedby={invalid && errorMessage ? errorId : undefined}
        autocomplete="off"
        {placeholder}
        {disabled}
        readonly={chooser}
        value={query}
        onfocus={handleFocus}
        oninput={handleInput}
        onkeydown={handleKeydown}
      />
      {#if chooser}
        <ChevronDown
          class={open ? "chevron--open" : undefined}
          size={17}
          strokeWidth={1.9}
          aria-hidden="true"
        />
      {:else if loading}
        <LoaderCircle class="spin" size={17} aria-label={loadingMessage} />
      {:else if query && !disabled}
        <button
          class="clear-control"
          type="button"
          aria-label={`Limpar ${label.toLocaleLowerCase("pt-BR")}`}
          onpointerdown={(event) => event.stopPropagation()}
          onclick={clearControl}
        >
          <X size={16} strokeWidth={1.9} />
        </button>
      {/if}
    </div>

    {#if open}
      <div
        class="dropdown"
        class:dropdown--above={dropdownPosition === "above"}
        class:dropdown--compact-empty={compactEmpty}
      >
        <ul id={listboxId} role="listbox" aria-label={`${label}: opções`}>
          {#each results as item, index (item.id)}
            <li role="presentation">
              <button
                id={`${componentId}-option-${index}`}
                type="button"
                role="option"
                aria-selected={!multiple && !action && item.id === value}
                aria-disabled={action &&
                  (item.actionDisabled || item.actionBusy)}
                class:active={index === activeIndex}
                onpointerenter={() => (activeIndex = index)}
                onclick={(event) => {
                  event.stopPropagation();
                  selectItem(item);
                }}
              >
                <span
                  class="option-visual"
                  style={avatarStyle(item)}
                  aria-hidden="true"
                >
                  {#if item.avatarUrl}
                    <img src={item.avatarUrl} alt="" />
                  {:else if showInitials}
                    {initials(item.label)}
                  {:else}
                    <Icon size={18} strokeWidth={1.8} />
                  {/if}
                </span>
                <span class="option-copy">
                  <strong>{item.label}</strong>
                  {#if item.description}<small>{item.description}</small>{/if}
                </span>
                <span class:select-label={!action} class:item-action={action}>
                  {#if action && item.actionBusy}
                    <LoaderCircle class="spin" size={14} />
                  {:else if action && item.actionIcon}
                    {@const ActionIcon = item.actionIcon}
                    <ActionIcon size={14} />
                  {/if}
                  {action
                    ? (item.actionLabel ?? "Selecionar")
                    : !multiple && item.id === value
                      ? "Selecionado"
                      : multiple
                        ? "Adicionar"
                        : "Selecionar"}
                </span>
              </button>
            </li>
          {:else}
            <li class="empty-state">
              {#if loading}
                <LoaderCircle class="spin" size={20} aria-hidden="true" />
                <span>{loadingMessage}</span>
              {:else}
                <Search size={22} aria-hidden="true" />
                <span>{emptyMessage}</span>
              {/if}
            </li>
          {/each}
        </ul>
      </div>
    {/if}
  </div>

  {#if selectedPosition === "below"}{@render selectedItems()}{/if}

  {#if invalid && errorMessage}
    <p class="error" id={errorId} role="alert">{errorMessage}</p>
  {/if}

  {#if showHelper && helperMessage}
    <p class="helper">{helperMessage}</p>
  {/if}
</div>

<style>
  .global-selector,
  .picker {
    position: relative;
    width: 100%;
    min-width: 0;
    color: var(--ink-800, var(--text));
  }

  .field-heading {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 8px;
  }

  .field-heading label {
    font-size: var(--text-sm);
    font-weight: 600;
  }

  .field-heading > span {
    color: var(--brand-600, var(--primary));
    font-size: var(--text-xs);
    font-weight: 600;
  }

  .selected-list {
    display: grid;
    gap: 7px;
    margin-block: 8px;
  }

  .selected-list:first-child {
    margin-top: 0;
  }

  .selected-list li {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto auto;
    min-height: 58px;
    align-items: center;
    gap: 11px;
    padding: 8px 9px 8px 12px;
    border: 1px solid
      color-mix(in srgb, var(--brand-500, var(--primary)) 20%, transparent);
    border-radius: var(--radius-md);
    background: var(--brand-50, var(--surface-soft));
  }

  .selected-list button {
    display: grid;
    width: 34px;
    height: 34px;
    padding: 0;
    border: 0;
    border-radius: 9px;
    color: var(--ink-500, var(--muted));
    background: transparent;
    box-shadow: none;
    place-items: center;
  }

  .selected-list button:hover {
    color: var(--danger);
    background: color-mix(in srgb, var(--danger) 8%, transparent);
  }

  .selected-list button:disabled {
    color: var(--ink-300, var(--muted));
    background: transparent;
    cursor: default;
  }

  .selected-state {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    color: var(--brand-600, var(--primary));
    font-size: var(--text-xs);
    font-weight: 600;
  }

  .selector-control {
    display: flex;
    min-height: 58px;
    align-items: center;
    gap: 10px;
    padding: 0 14px;
    border: 1px solid var(--border-strong, var(--border));
    border-radius: var(--radius-xl);
    color: var(--ink-400, var(--muted));
    background: var(--surface, var(--panel));
    transition:
      border-color var(--motion-fast) ease,
      box-shadow var(--motion-fast) ease,
      background var(--motion-fast) ease;
  }

  .picker--open .selector-control,
  .selector-control:focus-within {
    border-color: var(--brand-500, var(--primary));
    box-shadow: var(--global-selector-focus-shadow, var(--focus-ring));
  }

  .picker--invalid .selector-control {
    border-color: var(--danger);
  }

  .selector-control--disabled,
  .picker--open .selector-control--disabled {
    border-color: var(--border);
    background: var(--surface-soft, var(--panel));
    box-shadow: none;
    cursor: not-allowed;
    opacity: 0.72;
  }

  .control-icon {
    display: inline-flex;
    flex: 0 0 auto;
    align-items: center;
    justify-content: center;
  }

  .selector-control input {
    width: 100%;
    min-width: 0;
    min-height: 0;
    padding: 0;
    border: 0;
    border-radius: 0;
    outline: 0;
    color: var(--ink-800, var(--text));
    background: transparent;
    box-shadow: none;
    font: inherit;
    font-size: var(--text-md);
  }

  .selector-control input[readonly] {
    cursor: pointer;
  }

  .selector-control input::placeholder {
    color: var(--ink-400, var(--muted));
    opacity: 1;
  }

  .selector-control input:disabled {
    color: var(--ink-600, var(--text));
    cursor: not-allowed;
    opacity: 1;
    -webkit-text-fill-color: var(--ink-600, var(--text));
  }

  :global(.chevron--open) {
    transform: rotate(180deg);
  }

  .clear-control {
    display: grid;
    flex: 0 0 auto;
    padding: 4px;
    border: 0;
    border-radius: 50%;
    color: var(--ink-500, var(--muted));
    background: transparent;
    box-shadow: none;
    place-items: center;
  }

  .clear-control:hover {
    color: var(--ink-800, var(--text));
    background: var(--surface-soft, transparent);
  }

  .dropdown {
    position: absolute;
    z-index: 120;
    top: calc(100% + 7px);
    right: 0;
    left: 0;
    overflow: hidden;
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    background: var(--surface, var(--panel));
    box-shadow: var(--shadow-md);
    animation: reveal var(--motion-fast) ease-out;
  }

  .dropdown--above {
    top: auto;
    bottom: calc(100% + 7px);
    transform-origin: bottom center;
  }

  .dropdown ul {
    max-height: 360px;
    overflow-y: auto;
    padding: 5px;
    overscroll-behavior: contain;
  }

  .dropdown li > button {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    width: 100%;
    min-height: 54px;
    align-items: center;
    gap: 11px;
    padding: 7px 9px;
    border: 0;
    border-radius: 9px;
    color: inherit;
    background: transparent;
    box-shadow: none;
    text-align: left;
  }

  .dropdown li > button:hover,
  .dropdown li > button.active {
    background: var(--brand-50, var(--surface-soft));
  }

  .option-visual {
    display: grid;
    width: 36px;
    height: 36px;
    overflow: hidden;
    place-items: center;
    border-radius: 10px;
    color: var(--brand-600, var(--primary));
    background: var(
      --option-avatar-background,
      var(--brand-100, var(--surface-soft))
    );
    font-size: var(--text-xs);
    font-weight: 700;
    letter-spacing: 0.02em;
  }

  .option-visual--selected {
    color: white;
    background: var(
      --option-avatar-background,
      var(--brand-600, var(--primary))
    );
  }

  .option-visual img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .option-copy {
    display: block;
    min-width: 0;
  }

  .option-copy strong,
  .option-copy small {
    display: block;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .option-copy strong {
    color: var(--ink-800, var(--text));
    font-size: var(--text-sm);
    font-weight: 600;
  }

  .option-copy small {
    margin-top: 2px;
    color: var(--ink-500, var(--muted));
    font-size: var(--text-xs);
  }

  .select-label {
    color: var(--brand-600, var(--primary));
    font-size: var(--text-xs);
    font-weight: 600;
    opacity: 0;
    transition: opacity var(--motion-fast) ease;
  }

  .item-action {
    display: inline-flex;
    align-items: center;
    justify-content: flex-end;
    gap: 5px;
    color: var(--brand-600, var(--primary));
    font-size: var(--text-xs);
    font-weight: 600;
  }

  .dropdown li > button[aria-disabled="true"] .item-action {
    color: var(--ink-500, var(--muted));
  }

  .dropdown li > button:hover .select-label,
  .dropdown li > button.active .select-label,
  .dropdown li > button[aria-selected="true"] .select-label {
    opacity: 1;
  }

  .empty-state {
    display: flex;
    min-height: 110px;
    align-items: center;
    justify-content: center;
    flex-direction: column;
    gap: 8px;
    color: var(--ink-400, var(--muted));
    font-size: var(--text-sm);
  }

  .dropdown--compact-empty .empty-state {
    min-height: 62px;
    flex-direction: row;
    gap: 7px;
    padding: 10px 12px;
  }

  .dropdown--compact-empty .empty-state :global(svg) {
    width: 18px;
    height: 18px;
  }

  .helper,
  .error {
    margin-top: 8px;
    font-size: var(--text-xs);
  }

  .helper {
    color: var(--ink-400, var(--muted));
  }

  .error {
    color: var(--danger);
    font-weight: 600;
  }

  @keyframes reveal {
    from {
      transform: translateY(-4px);
      opacity: 0;
    }
  }

  :global(.spin) {
    animation: spin 0.8s linear infinite;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  @media (max-width: 560px) {
    .selected-state,
    .select-label {
      display: none;
    }

    .selected-list li {
      grid-template-columns: auto minmax(0, 1fr) auto;
    }

    .dropdown ul {
      max-height: 300px;
    }
  }
</style>
