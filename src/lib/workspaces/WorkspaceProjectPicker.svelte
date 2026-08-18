<script lang="ts">
  import type { EntityRecord } from "$lib/entities/types";
  import { Check, FolderKanban, Search, X } from "@lucide/svelte";

  let {
    projects,
    selectedIds = $bindable([]),
    disabled = false,
  } = $props<{
    projects: EntityRecord[];
    selectedIds?: string[];
    disabled?: boolean;
  }>();

  const componentId = $props.id();
  const listboxId = `${componentId}-projects`;
  let root: HTMLElement;
  let input: HTMLInputElement;
  let query = $state("");
  let open = $state(false);

  function normalize(value: string): string {
    return value
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, "")
      .toLocaleLowerCase("pt-BR");
  }

  let selectedProjects = $derived(
    selectedIds.flatMap((id: string) => {
      const project = projects.find((item: EntityRecord) => item.id === id);
      return project ? [project] : [];
    }),
  );

  let results = $derived.by(() => {
    const selected = new Set(selectedIds);
    const search = normalize(query.trim());
    return projects
      .filter((project: EntityRecord) => {
        if (selected.has(project.id)) return false;
        return (
          !search ||
          normalize(
            `${project.nome} ${project.negocio || project.cliente}`,
          ).includes(search)
        );
      })
      .slice(0, 8);
  });

  function addProject(project: EntityRecord): void {
    selectedIds = [...selectedIds, project.id];
    query = "";
    open = true;
    queueMicrotask(() => input?.focus());
  }

  function removeProject(projectId: string): void {
    selectedIds = selectedIds.filter((id: string) => id !== projectId);
  }

  function handleOutsidePointer(event: PointerEvent): void {
    if (root && !root.contains(event.target as Node)) open = false;
  }
</script>

<svelte:window onpointerdown={handleOutsidePointer} />

<section class="project-picker" bind:this={root}>
  <div class="section-heading">
    <strong>Projetos</strong>
    <span
      >{selectedIds.length} {selectedIds.length === 1 ? "card" : "cards"}</span
    >
  </div>

  <div class="search" class:search--open={open}>
    <Search size={18} aria-hidden="true" />
    <input
      bind:this={input}
      id={componentId}
      type="text"
      role="combobox"
      autocomplete="off"
      placeholder="Buscar projetos para adicionar..."
      aria-label="Buscar projetos para adicionar"
      aria-expanded={open}
      aria-controls={listboxId}
      {disabled}
      bind:value={query}
      onfocus={() => !disabled && (open = true)}
      oninput={() => (open = true)}
      onkeydown={(event) => event.key === "Escape" && (open = false)}
    />

    {#if open}
      <div class="dropdown" id={listboxId} role="listbox">
        {#each results as project (project.id)}
          <button type="button" onclick={() => addProject(project)}>
            <span class="project-icon"><FolderKanban size={17} /></span>
            <span class="project-copy">
              <strong>{project.nome}</strong>
              <small
                >{project.negocio || project.cliente || "Sem negócio"}</small
              >
            </span>
            <span class="add"><Check size={15} />Adicionar</span>
          </button>
        {:else}
          <p>Nenhum projeto encontrado.</p>
        {/each}
      </div>
    {/if}
  </div>

  {#if selectedProjects.length > 0}
    <div class="selected-projects">
      {#each selectedProjects as project (project.id)}
        <div class="selected-project">
          <span class="project-icon"><FolderKanban size={17} /></span>
          <span class="project-copy">
            <strong>{project.nome}</strong>
            <small>{project.status || "Sem status"}</small>
          </span>
          <button
            type="button"
            aria-label={`Remover ${project.nome}`}
            onclick={() => removeProject(project.id)}><X size={17} /></button
          >
        </div>
      {/each}
    </div>
  {:else}
    <p class="empty">Nenhum projeto cadastrado neste workspace.</p>
  {/if}
</section>

<style>
  .project-picker {
    display: grid;
    gap: 10px;
    padding-top: 2px;
    border-top: 1px solid var(--border);
  }

  .section-heading {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding-top: 10px;
  }

  .section-heading strong {
    color: var(--ink-800);
    font-size: var(--text-sm);
  }

  .section-heading span {
    color: var(--ink-500);
    font-size: var(--text-xs);
    font-weight: 600;
  }

  .search {
    position: relative;
    display: flex;
    min-height: 50px;
    align-items: center;
    gap: 10px;
    padding: 0 14px;
    border: 1px solid var(--border);
    border-radius: var(--radius-xl);
    color: var(--ink-400);
    background: var(--surface);
  }

  .search:focus-within,
  .search--open {
    border-color: var(--brand-500);
    box-shadow: none;
  }

  .search input {
    width: 100%;
    min-width: 0;
    border: 0;
    outline: 0;
    color: var(--ink-800);
    background: transparent;
    font: inherit;
  }

  .search input::placeholder {
    color: var(--ink-400);
  }

  .dropdown {
    position: absolute;
    z-index: 110;
    top: calc(100% + 7px);
    right: 0;
    left: 0;
    overflow: hidden;
    padding: 5px;
    border: 1px solid var(--border);
    border-radius: 13px;
    background: var(--surface);
    box-shadow: var(--shadow-md);
  }

  .dropdown button,
  .selected-project {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: center;
    gap: 10px;
  }

  .dropdown button {
    width: 100%;
    min-height: 52px;
    padding: 7px 9px;
    border: 0;
    border-radius: 9px;
    color: inherit;
    background: transparent;
    text-align: left;
  }

  .dropdown button:hover {
    background: var(--brand-50);
  }

  .dropdown > p {
    padding: 24px 12px;
    color: var(--ink-400);
    font-size: var(--text-sm);
    text-align: center;
  }

  .project-icon {
    display: grid;
    width: 34px;
    height: 34px;
    place-items: center;
    border-radius: 9px;
    color: var(--brand-600);
    background: var(--brand-50);
  }

  .project-copy,
  .project-copy strong,
  .project-copy small {
    display: block;
    min-width: 0;
  }

  .project-copy strong,
  .project-copy small {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .project-copy strong {
    color: var(--ink-800);
    font-size: var(--text-sm);
  }

  .project-copy small {
    margin-top: 2px;
    color: var(--ink-400);
    font-size: var(--text-xs);
  }

  .add {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    color: var(--brand-600);
    font-size: var(--text-xs);
    font-weight: 600;
  }

  .selected-projects {
    display: grid;
    gap: 7px;
    max-height: 186px;
    overflow: auto;
  }

  .selected-project {
    min-height: 52px;
    padding: 7px 8px 7px 10px;
    border: 1px solid var(--border);
    border-radius: 12px;
    background: var(--surface-soft);
  }

  .selected-project > button {
    display: grid;
    width: 32px;
    height: 32px;
    place-items: center;
    border: 0;
    border-radius: 8px;
    color: var(--ink-400);
    background: transparent;
  }

  .selected-project > button:hover {
    color: var(--red-500);
    background: color-mix(in srgb, var(--red-500) 7%, transparent);
  }

  .empty {
    color: var(--ink-500);
    font-size: var(--text-xs);
  }
</style>
