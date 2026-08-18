<script lang="ts">
  import {
    BriefcaseBusiness,
    Check,
    ListTodo,
    RotateCcw,
    Search,
    SlidersHorizontal,
    UserRound,
    X,
  } from "@lucide/svelte";
  import { parseAvatarProfileUrl } from "$lib/avatar/avatar-options";
  import { useGlobalFilters } from "./global-filters.svelte";

  type FilterMenu = "responsible" | "business" | "task";

  const filters = useGlobalFilters();
  let expanded = $state(false);
  let activeMenu = $state<FilterMenu | undefined>();
  let responsibleQuery = $state("");
  let root = $state<HTMLDivElement>();

  let filteredUsers = $derived(
    filters.users.filter((user) => {
      const search = normalized(responsibleQuery);
      return (
        !search ||
        normalized(user.name).includes(search) ||
        normalized(user.email).includes(search)
      );
    }),
  );

  function normalized(value: string | undefined): string {
    return (value ?? "").trim().toLocaleLowerCase("pt-BR");
  }

  function avatarStyle(avatarUrl?: string): string | undefined {
    const avatar = parseAvatarProfileUrl(avatarUrl ?? "");
    return avatar
      ? `--choice-avatar-background: ${avatar.avatarColor}`
      : undefined;
  }

  function toggleValue(list: string[], value: string): string[] {
    return list.includes(value)
      ? list.filter((item) => item !== value)
      : [...list, value];
  }

  function toggleMenu(menu: FilterMenu): void {
    activeMenu = activeMenu === menu ? undefined : menu;
    if (menu === "responsible") responsibleQuery = "";
  }

  function selectResponsible(userId: string): void {
    filters.responsibleIds = filters.responsibleIds.includes(userId)
      ? []
      : [userId];
    responsibleQuery = "";
    activeMenu = undefined;
  }

  function toggleExpanded(): void {
    expanded = !expanded;
    if (!expanded) activeMenu = undefined;
  }

  function clearFilters(): void {
    responsibleQuery = "";
    filters.clear();
    activeMenu = undefined;
  }

  function closeOnOutsideClick(event: PointerEvent): void {
    if (root && !root.contains(event.target as Node)) activeMenu = undefined;
  }

  function closeOnEscape(event: KeyboardEvent): void {
    if (event.key === "Escape") activeMenu = undefined;
  }
</script>

<svelte:window onpointerdown={closeOnOutsideClick} onkeydown={closeOnEscape} />

<div class:expanded class="filter-controls" bind:this={root}>
  <div class="filter-secondary" aria-hidden={!expanded}>
    <div class="filter-control">
      <button
        class:active={filters.responsibleIds.length > 0}
        class="filter-option-button"
        type="button"
        aria-expanded={activeMenu === "responsible"}
        aria-controls="responsible-filter-menu"
        aria-label="Filtrar por responsável"
        title="Responsável"
        tabindex={expanded ? 0 : -1}
        onclick={() => toggleMenu("responsible")}
      >
        <UserRound size={15} />
      </button>
      {#if activeMenu === "responsible"}
        <div
          id="responsible-filter-menu"
          class="filter-popover"
          role="group"
          aria-label="Filtrar por responsável"
        >
          <div class="popover-heading">
            <strong>Responsável</strong>
            <span>Busque e selecione uma pessoa</span>
          </div>
          <label class="responsible-search">
            <Search size={14} aria-hidden="true" />
            <span class="sr-only">Buscar responsável</span>
            <input
              bind:value={responsibleQuery}
              type="search"
              placeholder="Buscar pessoa"
              autocomplete="off"
            />
            {#if responsibleQuery}
              <button
                type="button"
                aria-label="Limpar busca de responsável"
                onclick={() => (responsibleQuery = "")}
              >
                <X size={13} />
              </button>
            {/if}
          </label>
          <div class="popover-options">
            {#each filteredUsers as user (user.id)}
              <button
                class:active={filters.responsibleIds.includes(user.id)}
                class="filter-user-option"
                type="button"
                aria-pressed={filters.responsibleIds.includes(user.id)}
                onclick={() => selectResponsible(user.id)}
              >
                <span class="choice-avatar" style={avatarStyle(user.avatarUrl)}>
                  {#if user.avatarUrl}
                    <img src={user.avatarUrl} alt="" />
                  {:else}
                    {user.name.slice(0, 1).toLocaleUpperCase("pt-BR")}
                  {/if}
                </span>
                <span class="choice-copy">
                  <strong>{user.name}</strong>
                  <small>{user.email}</small>
                </span>
              </button>
            {:else}
              <span class="no-user-results">Nenhuma pessoa encontrada</span>
            {/each}
          </div>
        </div>
      {/if}
    </div>

    <div class="filter-control">
      <button
        class:active={filters.businessCategoryKeys.length > 0}
        class="filter-option-button"
        type="button"
        aria-expanded={activeMenu === "business"}
        aria-controls="business-filter-menu"
        aria-label="Filtrar por categoria de negócio"
        title="Negócios"
        tabindex={expanded ? 0 : -1}
        onclick={() => toggleMenu("business")}
      >
        <BriefcaseBusiness size={15} />
      </button>
      {#if activeMenu === "business"}
        <div
          id="business-filter-menu"
          class="filter-popover"
          role="group"
          aria-label="Filtrar por categoria de negócio"
        >
          <div class="popover-heading">
            <strong>Categoria de negócio</strong>
            <span>Selecione uma ou mais</span>
          </div>
          <div class="popover-options">
            {#each filters.businessCategories as category (category.key)}
              <label class="filter-choice compact-choice">
                <input
                  type="checkbox"
                  checked={filters.businessCategoryKeys.includes(category.key)}
                  onchange={() =>
                    (filters.businessCategoryKeys = toggleValue(
                      filters.businessCategoryKeys,
                      category.key,
                    ))}
                />
                <span
                  class="choice-color"
                  style={`--choice-color: ${category.color}`}
                ></span>
                <span class="choice-copy"
                  ><strong>{category.label}</strong></span
                >
                <span class="choice-check"><Check size={13} /></span>
              </label>
            {/each}
          </div>
        </div>
      {/if}
    </div>

    <div class="filter-control">
      <button
        class:active={filters.taskCategoryKeys.length > 0}
        class="filter-option-button"
        type="button"
        aria-expanded={activeMenu === "task"}
        aria-controls="task-filter-menu"
        aria-label="Filtrar por categoria de tarefa"
        title="Tarefas"
        tabindex={expanded ? 0 : -1}
        onclick={() => toggleMenu("task")}
      >
        <ListTodo size={15} />
      </button>
      {#if activeMenu === "task"}
        <div
          id="task-filter-menu"
          class="filter-popover"
          role="group"
          aria-label="Filtrar por categoria de tarefa"
        >
          <div class="popover-heading">
            <strong>Categoria de tarefa</strong>
            <span>Selecione uma ou mais</span>
          </div>
          <div class="popover-options">
            {#each filters.taskCategories as category (category.key)}
              <label class="filter-choice compact-choice">
                <input
                  type="checkbox"
                  checked={filters.taskCategoryKeys.includes(category.key)}
                  onchange={() =>
                    (filters.taskCategoryKeys = toggleValue(
                      filters.taskCategoryKeys,
                      category.key,
                    ))}
                />
                <span
                  class="choice-color"
                  style={`--choice-color: ${category.color}`}
                ></span>
                <span class="choice-copy"
                  ><strong>{category.label}</strong></span
                >
                <span class="choice-check"><Check size={13} /></span>
              </label>
            {/each}
          </div>
        </div>
      {/if}
    </div>

    <button
      class="clear-filters"
      type="button"
      aria-label="Limpar todos os filtros"
      title="Limpar filtros"
      disabled={filters.activeCount === 0}
      tabindex={expanded ? 0 : -1}
      onclick={clearFilters}
    >
      <RotateCcw size={14} />
    </button>
  </div>

  <button
    class:active={expanded || filters.activeCount > 0}
    class="filter-trigger"
    type="button"
    aria-expanded={expanded}
    onclick={toggleExpanded}
  >
    <SlidersHorizontal size={16} />
    <span>Filtros</span>
    {#if filters.activeCount}<small>{filters.activeCount}</small>{/if}
  </button>
</div>

<style>
  .filter-controls,
  .filter-secondary {
    display: flex;
    min-width: 0;
    align-items: center;
  }
  .filter-controls {
    position: relative;
  }
  .filter-secondary {
    position: absolute;
    top: 0;
    right: calc(100% + 7px);
    gap: 6px;
    opacity: 0;
    pointer-events: none;
    visibility: hidden;
    transform: translateX(10px);
    transition:
      opacity var(--motion-fast) ease,
      transform var(--motion-base) ease,
      visibility 0s linear var(--motion-base);
    white-space: nowrap;
  }
  .filter-controls.expanded .filter-secondary {
    opacity: 1;
    pointer-events: auto;
    visibility: visible;
    transform: translateX(0);
    transition-delay: 0s;
  }
  .filter-control {
    position: relative;
  }
  .filter-trigger,
  .filter-option-button,
  .clear-filters {
    display: inline-flex;
    min-height: 38px;
    align-items: center;
    justify-content: center;
    gap: 6px;
    padding: 0 11px;
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
    color: var(--ink-600, var(--ink-500));
    background: var(--surface);
    font: inherit;
    font-size: var(--text-xs);
    font-weight: 600;
    white-space: nowrap;
    transition:
      color var(--motion-fast),
      border-color var(--motion-fast),
      background var(--motion-fast),
      transform var(--motion-fast);
  }
  .filter-option-button,
  .clear-filters {
    width: 38px;
    min-width: 38px;
    padding: 0;
  }
  .filter-trigger:hover,
  .filter-option-button:hover,
  .clear-filters:hover:not(:disabled) {
    color: var(--brand-700);
    border-color: color-mix(in srgb, var(--brand-600) 30%, var(--border));
    background: var(--brand-50);
  }
  .filter-trigger.active,
  .filter-option-button.active {
    color: var(--brand-700);
    border-color: color-mix(in srgb, var(--brand-600) 38%, var(--border));
    background: var(--brand-50);
  }
  .filter-trigger {
    color: white;
    border-color: var(--brand-600);
    background: var(--choice-avatar-background, var(--brand-600));
  }
  .filter-trigger:hover,
  .filter-trigger.active {
    color: white;
    border-color: var(--brand-700);
    background: var(--brand-700);
  }
  .filter-trigger small {
    display: inline-grid;
    min-width: 18px;
    height: 18px;
    padding: 0 5px;
    border-radius: var(--radius-pill);
    color: var(--brand-700);
    background: var(--surface);
    font-size: 9px;
    place-items: center;
  }
  .clear-filters {
    color: var(--ink-500);
  }
  .clear-filters:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }
  .filter-popover {
    position: absolute;
    top: calc(100% + 9px);
    right: 0;
    z-index: 30;
    width: 268px;
    padding: 8px;
    border: 1px solid var(--border);
    border-radius: var(--radius-xl);
    background: var(--panel);
    box-shadow: var(--shadow-md);
    animation: filter-popover-in var(--motion-fast) ease both;
  }
  .popover-heading {
    display: grid;
    gap: 2px;
    padding: 8px 9px 10px;
    border-bottom: 1px solid var(--border);
  }
  .popover-heading strong {
    color: var(--ink-800);
    font-size: var(--text-sm);
    font-weight: 600;
  }
  .popover-heading span {
    color: var(--ink-400);
    font-size: var(--text-xs);
  }
  .popover-options {
    display: grid;
    max-height: 280px;
    gap: 3px;
    overflow-y: auto;
    padding-top: 6px;
  }
  .responsible-search {
    display: flex;
    min-height: 36px;
    align-items: center;
    gap: 7px;
    margin: 8px 0 2px;
    padding: 0 9px;
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    color: var(--ink-400);
    background: var(--surface-soft);
  }
  .responsible-search:focus-within {
    border-color: var(--brand-500);
    background: var(--surface);
    box-shadow: var(--focus-ring);
  }
  .responsible-search input {
    width: 100%;
    min-width: 0;
    border: 0;
    outline: 0;
    color: var(--ink-700);
    background: transparent;
    font: inherit;
    font-size: var(--text-xs);
  }
  .responsible-search button {
    display: grid;
    width: 22px;
    height: 22px;
    flex: 0 0 auto;
    padding: 0;
    border: 0;
    border-radius: 50%;
    color: var(--ink-400);
    background: transparent;
    place-items: center;
  }
  .filter-user-option {
    display: grid;
    grid-template-columns: 30px minmax(0, 1fr);
    width: 100%;
    min-height: 44px;
    align-items: center;
    gap: 9px;
    padding: 5px 7px;
    border: 1px solid transparent;
    border-radius: var(--radius-md);
    background: transparent;
    text-align: left;
  }
  .filter-user-option:hover {
    background: var(--surface-soft);
  }
  .filter-user-option.active {
    border-color: color-mix(in srgb, var(--brand-600) 25%, var(--border));
    background: var(--brand-50);
  }
  .no-user-results {
    padding: 16px 8px;
    color: var(--ink-400);
    font-size: var(--text-xs);
    text-align: center;
  }
  .filter-choice {
    position: relative;
    display: grid;
    grid-template-columns: 30px minmax(0, 1fr) 20px;
    min-height: 44px;
    align-items: center;
    gap: 9px;
    padding: 5px 7px;
    border-radius: var(--radius-md);
    cursor: pointer;
  }
  .filter-choice:hover {
    background: var(--surface-soft);
  }
  .filter-choice:has(input:focus-visible) {
    box-shadow: var(--focus-ring);
  }
  .filter-choice input {
    position: absolute;
    width: 1px;
    height: 1px;
    opacity: 0;
  }
  .choice-avatar {
    display: grid;
    width: 30px;
    height: 30px;
    overflow: hidden;
    border-radius: 50%;
    color: white;
    background: var(--brand-600);
    font-size: var(--text-xs);
    font-weight: 600;
    place-items: center;
  }
  .choice-avatar img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
  .choice-copy {
    display: grid;
    min-width: 0;
    gap: 2px;
  }
  .choice-copy strong,
  .choice-copy small {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .choice-copy strong {
    color: var(--ink-700);
    font-size: var(--text-xs);
    font-weight: 600;
  }
  .choice-copy small {
    color: var(--ink-400);
    font-size: 10px;
  }
  .choice-check {
    display: grid;
    width: 18px;
    height: 18px;
    border: 1px solid var(--border-strong);
    border-radius: 5px;
    color: transparent;
    background: var(--surface);
    place-items: center;
  }
  .filter-choice:has(input:checked) .choice-check {
    color: white;
    border-color: var(--brand-600);
    background: var(--brand-600);
  }
  .compact-choice {
    grid-template-columns: 12px minmax(0, 1fr) 20px;
    min-height: 38px;
  }
  .choice-color {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: var(--choice-color);
  }
  @keyframes filter-popover-in {
    from {
      opacity: 0;
      transform: translateY(-5px) scale(0.98);
    }
  }
  @media (max-width: 700px) {
    .filter-trigger {
      width: 38px;
      min-width: 38px;
      padding: 0;
    }
    .filter-trigger > span {
      display: none;
    }
    .filter-trigger small {
      position: absolute;
      top: -4px;
      right: -5px;
      min-width: 16px;
      height: 16px;
      padding: 0 4px;
      font-size: 8px;
      box-shadow: 0 0 0 2px var(--panel);
    }
    .filter-popover {
      position: fixed;
      top: calc(var(--topbar-height) + 8px);
      right: 12px;
      left: 12px;
      width: auto;
      max-height: min(430px, calc(100dvh - var(--topbar-height) - 24px));
    }
  }
</style>
