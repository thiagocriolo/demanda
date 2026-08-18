<script lang="ts">
  import { projectConfig } from "$lib/entities/catalog";
  import type { EntityRecord } from "$lib/entities/types";
  import EntityCard from "$lib/ui/EntityCard.svelte";
  import type { EntityCardItem } from "$lib/ui/entity-card";
  import { FolderKanban } from "@lucide/svelte";
  import { onMount } from "svelte";

  let { projects } = $props<{ projects: EntityRecord[] }>();

  let root: HTMLDivElement;
  let slotCount = $state(5);

  const statusColors: Record<string, string> = {
    planejamento: "#64748b",
    andamento: "#2e56ff",
    execucao: "#2e56ff",
    pausado: "#f59e0b",
    alteracao: "#f59e0b",
    concluido: "#5dac83",
    arquivado: "#64748b",
  };

  let visibleCount = $derived(
    projects.length > slotCount ? Math.max(0, slotCount - 1) : projects.length,
  );
  let visibleProjects = $derived(projects.slice(0, visibleCount));
  let remaining = $derived(projects.length - visibleCount);

  onMount(() => {
    const updateSlots = () => {
      const width = root.clientWidth;
      const minimumCardWidth = width < 520 ? 160 : 215;
      slotCount = Math.max(
        1,
        Math.floor((width + 12) / (minimumCardWidth + 12)),
      );
    };
    const observer = new ResizeObserver(updateSlots);
    updateSlots();
    observer.observe(root);
    return () => observer.disconnect();
  });

  function formatDate(value: string): string {
    if (!value) return "Sem prazo";
    const date = new Date(`${value}T12:00:00`);
    return Number.isNaN(date.getTime())
      ? value
      : new Intl.DateTimeFormat("pt-BR").format(date);
  }

  function toCard(project: EntityRecord): EntityCardItem {
    const statusOption = projectConfig.fields
      .find(({ name }) => name === "status")
      ?.options?.find(({ value }) => value === project.status);
    return {
      id: project.id,
      kind: "projeto",
      title: project.nome || "Projeto sem nome",
      status: statusOption?.label ?? "Sem status",
      statusColor: statusColors[project.status] ?? statusColors.planejamento,
      secondary: project.negocio || project.cliente || "Negócio não informado",
      relation:
        project.responsavel || project.servicos || "Responsável não informado",
      completion: formatDate(project.dataFim || project.prazo),
    };
  }
</script>

<div class="project-strip" bind:this={root}>
  {#if projects.length}
    <div class="project-grid" style={`--project-slots: ${slotCount}`}>
      {#each visibleProjects as project (project.id)}
        <EntityCard item={toCard(project)} level={5} />
      {/each}

      {#if remaining > 0}
        <div class="more-card" aria-label={`E mais ${remaining} projetos`}>
          <span><FolderKanban size={22} /></span>
          <strong>e mais {remaining}</strong>
          <small>{remaining === 1 ? "projeto" : "projetos"}</small>
        </div>
      {/if}
    </div>
  {:else}
    <div class="empty-projects">
      <FolderKanban size={20} />
      <span>Nenhum projeto associado</span>
    </div>
  {/if}
</div>

<style>
  .project-strip {
    display: flex;
    width: 100%;
    min-width: 0;
    align-items: stretch;
  }
  .project-grid {
    display: grid;
    flex: 1 1 auto;
    min-width: 0;
    grid-template-columns: repeat(var(--project-slots, 5), minmax(0, 1fr));
    align-items: stretch;
    gap: 12px;
  }
  .project-grid > :global(*) {
    min-width: 0;
  }
  .project-grid > :global(.cards-showcase),
  .project-grid > :global(.cards-showcase .wc-card-grid) {
    height: 100%;
  }
  .project-grid
    > :global(
      .cards-showcase[data-card-level="5"] .wc-card-item--projeto .wc-card-body
    ) {
    flex: 1 1 auto;
    align-content: space-between;
  }
  .more-card {
    display: grid;
    min-width: 0;
    min-height: 100%;
    align-content: center;
    justify-items: center;
    gap: 4px;
    padding: 16px 12px;
    border: 1px dashed #a8c7e5;
    border-radius: 16px;
    color: var(--brand-600);
    background: linear-gradient(180deg, #fdfefffa 0%, #f1f8fffa 100%);
    text-align: center;
  }
  .more-card > span {
    display: grid;
    width: 40px;
    height: 40px;
    margin-bottom: 3px;
    border-radius: 11px;
    background: var(--brand-50);
    place-items: center;
  }
  .more-card strong {
    color: #1b3047;
    font-size: var(--text-md);
  }
  .more-card small {
    color: #456077;
    font-size: var(--text-xs);
  }
  .empty-projects {
    display: flex;
    min-height: 130px;
    align-items: center;
    justify-content: center;
    gap: 8px;
    border: 1px dashed var(--border-strong);
    border-radius: 14px;
    color: var(--ink-400);
    background: var(--surface-soft);
    font-size: var(--text-xs);
  }
  @media (max-width: 520px) {
    .project-grid {
      gap: 8px;
    }
  }
</style>
