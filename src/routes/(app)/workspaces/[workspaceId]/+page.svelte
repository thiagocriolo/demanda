<script lang="ts">
  import { page } from "$app/state";
  import PageHeader from "$lib/ui/PageHeader.svelte";
  import WorkspaceProjectStrip from "$lib/workspaces/WorkspaceProjectStrip.svelte";
  import {
    GLOBAL_WORKSPACE_ID,
    loadWorkspaces,
    observeWorkspaces,
    refreshWorkspaceSnapshot,
    type Workspace,
  } from "$lib/workspaces/workspace-storage";
  import type { EntityRecord } from "$lib/entities/types";
  import { FolderKanban, Globe2, UsersRound } from "@lucide/svelte";
  import { onMount } from "svelte";

  let workspaces = $state<Workspace[]>([]);
  let requestedId = $derived(page.params.workspaceId);
  let global = $derived(requestedId === GLOBAL_WORKSPACE_ID);
  let workspace = $derived(workspaces.find(({ id }) => id === requestedId));
  let projects = $derived.by((): EntityRecord[] => {
    const sources = global ? workspaces : workspace ? [workspace] : [];
    return sources.flatMap((item) =>
      item.projectPreviews.map((project) => ({
        id: project.id,
        workspaceId: project.workspaceId,
        nome: project.name,
        negocio: project.businessName,
        contractName: project.contractName ?? "",
        status: project.status,
        dataFim: project.endDate ?? "",
        servicos: project.serviceNames.join(", "),
        createdAt: project.createdAt,
        updatedAt: project.updatedAt,
      })),
    );
  });
  let title = $derived(global ? "Visão global" : (workspace?.name ?? "Workspace"));
  let description = $derived(
    global
      ? "Projetos de todos os workspaces aos quais você tem acesso."
      : (workspace?.description || "Projetos e equipe deste workspace."),
  );

  function refresh(): void {
    workspaces = loadWorkspaces();
  }

  onMount(() => {
    refresh();
    void refreshWorkspaceSnapshot().then(refresh).catch(() => undefined);
    return observeWorkspaces(refresh);
  });
</script>

<svelte:head><title>{title} · Demanda</title></svelte:head>

<PageHeader eyebrow={global ? "Área de trabalho" : "Workspace"} title={title} icon={global ? Globe2 : UsersRound} />

<section class="workspace-view">
  <header>
    <div>
      <h2>Projetos</h2>
      <p>{description}</p>
    </div>
    <span class="project-count"><FolderKanban size={16} /> {projects.length} {projects.length === 1 ? "projeto" : "projetos"}</span>
  </header>
  <WorkspaceProjectStrip {projects} />
</section>

<style>
  .workspace-view { display: grid; gap: 16px; padding: 24px 28px; }
  header { display: flex; align-items: end; justify-content: space-between; gap: 16px; }
  h2 { margin: 0; color: var(--ink-800); font-size: var(--text-lg); }
  p { margin: 5px 0 0; color: var(--ink-500); font-size: var(--text-sm); }
  .project-count { display: inline-flex; align-items: center; gap: 6px; color: var(--ink-500); font-size: var(--text-sm); white-space: nowrap; }
  @media (max-width: 640px) { .workspace-view { padding: 18px; } header { align-items: flex-start; flex-direction: column; } }
</style>
