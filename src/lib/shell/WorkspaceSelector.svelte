<script lang="ts">
  import {
    loadActiveWorkspaceId,
    loadWorkspaces,
    observeWorkspaces,
    GLOBAL_WORKSPACE_ID,
    PERSONAL_WORKSPACE_ID,
    refreshWorkspaceSnapshot,
    setActiveWorkspaceId,
    type WorkspaceOption,
  } from "$lib/workspaces/workspace-storage";
  import {
    Check,
    ChevronDown,
    Globe2,
    LayoutGrid,
    Settings2,
    UserRound,
  } from "@lucide/svelte";
  import { onMount } from "svelte";

  let { compact = false } = $props<{ compact?: boolean }>();
  let root: HTMLDivElement;
  let open = $state(false);
  let menuTop = $state(0);
  let menuLeft = $state(0);
  let workspaces = $state<WorkspaceOption[]>([]);
  let selectedId = $state(PERSONAL_WORKSPACE_ID);
  const globalWorkspace: WorkspaceOption = {
    id: GLOBAL_WORKSPACE_ID,
    name: "Global",
    description: "Visualização de todos os workspaces.",
    icon: "globe-2",
    color: "blue",
    kind: "shared",
    ownerId: "",
    createdAt: "",
    updatedAt: "",
    members: [],
    invitations: [],
    projectCount: 0,
    projectPreviews: [],
  };
  let selected = $derived(
    selectedId === GLOBAL_WORKSPACE_ID
      ? globalWorkspace
      : (workspaces.find(({ id }) => id === selectedId) ?? workspaces[0]),
  );

  function refresh(): void {
    workspaces = loadWorkspaces();
    selectedId = loadActiveWorkspaceId(workspaces);
  }

  onMount(() => {
    refresh();
    void refreshWorkspaceSnapshot()
      .then(refresh)
      .catch(() => undefined);
    const unobserve = observeWorkspaces(refresh);
    const closeOnOutsideClick = (event: PointerEvent) => {
      if (!root.contains(event.target as Node)) open = false;
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") open = false;
    };
    document.addEventListener("pointerdown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);

    return () => {
      unobserve();
      document.removeEventListener("pointerdown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  });

  async function selectWorkspace(workspace: WorkspaceOption): Promise<void> {
    selectedId = workspace.id;
    await setActiveWorkspaceId(workspace.id);
    open = false;
  }

  function toggleMenu(): void {
    if (!open) {
      const rect = root.getBoundingClientRect();
      menuTop = rect.top;
      menuLeft = rect.right + 10;
    }
    open = !open;
  }
</script>

<div class="workspace-selector" class:compact bind:this={root}>
  <button
    class="trigger"
    type="button"
    aria-haspopup="listbox"
    aria-expanded={open}
    aria-label={`Workspace: ${selected?.name ?? "Pessoal"}`}
    title={compact ? `Workspace: ${selected?.name ?? "Pessoal"}` : undefined}
    onclick={toggleMenu}
  >
    <span class="trigger-icon"><LayoutGrid size={17} /></span>
    <span class="trigger-copy">
      <small>Workspace</small>
      <strong>{selected?.name ?? "Pessoal"}</strong>
    </span>
    <ChevronDown class={open ? "rotated" : ""} size={15} aria-hidden="true" />
  </button>

  {#if open}
    <div
      class="menu"
      role="listbox"
      aria-label="Selecionar workspace"
      style:top={`${menuTop}px`}
      style:left={`${menuLeft}px`}
    >
      <span class="menu-label">Selecionar workspace</span>
      <button
        type="button"
        role="option"
        aria-selected={selectedId === GLOBAL_WORKSPACE_ID}
        onclick={() => selectWorkspace(globalWorkspace)}
      >
        <span class="option-icon" aria-hidden="true"><Globe2 size={17} /></span>
        <span class="option-copy">
          <strong>Global</strong>
          <small>Todos os workspaces</small>
        </span>
        {#if selectedId === GLOBAL_WORKSPACE_ID}
          <Check class="check" size={17} aria-hidden="true" />
        {/if}
      </button>
      {#each workspaces as workspace (workspace.id)}
        <button
          type="button"
          role="option"
          aria-selected={workspace.id === selectedId}
          onclick={() => selectWorkspace(workspace)}
        >
          <span class="option-icon" aria-hidden="true">
            {#if workspace.kind === "personal"}
              <UserRound size={17} />
            {:else}
              <LayoutGrid size={17} />
            {/if}
          </span>
          <span class="option-copy">
            <strong>{workspace.name}</strong>
            {#if workspace.kind === "personal"}
              <small>Seu workspace pessoal</small>
            {:else}
              <small
                >{workspace.members.length}
                {workspace.members.length === 1 ? "membro" : "membros"}</small
              >
            {/if}
          </span>
          {#if workspace.id === selectedId}
            <Check class="check" size={17} aria-hidden="true" />
          {/if}
        </button>
      {/each}
      <a class="manage-link" href="/workspaces" onclick={() => (open = false)}>
        <Settings2 size={16} />
        Gerenciar workspaces
      </a>
    </div>
  {/if}
</div>

<style>
  .workspace-selector {
    position: relative;
    width: 100%;
  }
  .trigger {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    width: 100%;
    min-width: 0;
    min-height: 48px;
    align-items: center;
    gap: 9px;
    padding: 5px 10px;
    border: 1px solid var(--border);
    border-radius: 11px;
    color: var(--ink-700);
    background: var(--surface);
    text-align: left;
  }
  .trigger:hover,
  .trigger[aria-expanded="true"] {
    border-color: var(--border-strong);
    background: var(--surface-hover);
  }
  .trigger-icon,
  .option-icon {
    display: grid;
    flex: 0 0 auto;
    place-items: center;
    color: var(--brand-600);
  }
  .trigger-icon {
    width: 29px;
    height: 29px;
    border-radius: 8px;
    background: var(--brand-50);
  }
  .trigger-copy,
  .option-copy {
    min-width: 0;
  }
  .trigger-copy small,
  .trigger-copy strong,
  .option-copy small,
  .option-copy strong {
    display: block;
  }
  .trigger-copy small {
    color: var(--ink-400);
    font-size: 9px;
    font-weight: 600;
    line-height: 1;
    text-transform: uppercase;
  }
  .trigger-copy strong {
    margin-top: 3px;
    overflow: hidden;
    font-size: var(--text-sm);
    font-weight: 600;
    line-height: 1;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .trigger :global(.lucide-chevron-down) {
    color: var(--ink-400);
    transition: transform var(--motion-fast);
  }
  .trigger :global(.rotated) {
    transform: rotate(180deg);
  }
  .menu {
    position: fixed;
    z-index: 40;
    width: 282px;
    padding: 7px;
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    background: var(--surface);
    box-shadow: 0 16px 38px rgba(15, 23, 42, 0.18);
    animation: appear var(--motion-fast) ease-out;
  }
  .menu::before,
  .menu::after {
    position: absolute;
    top: 16px;
    width: 0;
    height: 0;
    border-style: solid;
    content: "";
  }
  .menu::before {
    left: -9px;
    border-width: 9px 9px 9px 0;
    border-color: transparent var(--border) transparent transparent;
  }
  .menu::after {
    top: 17px;
    left: -8px;
    border-width: 8px 8px 8px 0;
    border-color: transparent var(--surface) transparent transparent;
  }
  .menu-label {
    display: block;
    padding: 7px 9px 6px;
    color: var(--ink-400);
    font-size: var(--text-xs);
    font-weight: 600;
    text-transform: uppercase;
  }
  .menu > button {
    display: grid;
    grid-template-columns: 34px minmax(0, 1fr) 18px;
    width: 100%;
    align-items: center;
    gap: 9px;
    padding: 9px;
    border: 0;
    border-radius: 9px;
    color: var(--ink-700);
    background: transparent;
    text-align: left;
  }
  .manage-link {
    display: flex;
    min-height: 40px;
    align-items: center;
    gap: 9px;
    margin-top: 5px;
    padding: 0 10px;
    border-top: 1px solid var(--border);
    color: var(--ink-600);
    font-size: var(--text-xs);
    font-weight: 600;
  }
  .manage-link:hover {
    color: var(--brand-600);
  }
  .menu > button:hover,
  .menu > button[aria-selected="true"] {
    color: var(--brand-600);
    background: var(--brand-50);
  }
  .option-icon {
    width: 34px;
    height: 34px;
    border-radius: 9px;
    background: var(--surface-hover);
  }
  .option-copy strong {
    overflow: hidden;
    font-size: var(--text-sm);
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .option-copy small {
    margin-top: 2px;
    color: var(--ink-400);
    font-size: var(--text-xs);
  }
  .menu :global(.check) {
    color: var(--brand-600);
  }
  @keyframes appear {
    from {
      opacity: 0;
      transform: translateX(-5px) scale(0.98);
    }
  }
  .compact .trigger {
    grid-template-columns: 48px;
    width: 48px;
    min-height: 48px;
    padding: 0;
  }
  .compact .trigger-icon {
    width: 100%;
    height: 100%;
    background: transparent;
  }
  .compact .trigger-copy,
  .compact .trigger :global(.lucide-chevron-down) {
    display: none;
  }
  @media (max-width: 1120px) {
    .workspace-selector:not(.compact) .trigger {
      min-width: 132px;
    }
    .trigger-copy small {
      display: none;
    }
    .trigger-copy strong {
      margin-top: 0;
    }
  }
  @media (max-width: 700px) {
    .workspace-selector:not(.compact) .trigger {
      grid-template-columns: auto auto;
      min-width: 0;
      min-height: 40px;
      padding: 5px;
    }
    .trigger-copy,
    .trigger :global(.lucide-chevron-down) {
      display: none;
    }
    .menu {
      width: min(282px, calc(100vw - 20px));
    }
  }
</style>
