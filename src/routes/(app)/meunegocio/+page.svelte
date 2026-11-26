<script lang="ts">
  import { goto } from "$app/navigation";
  import { getContext, onMount } from "svelte";
  import {
    ENTITY_CREATE_CONTEXT,
    type EntityCreateContext,
  } from "$lib/entities/create-context";
  import {
    archiveServicePackage,
    deleteServicePackage,
    duplicateServicePackage,
    listServicePackages,
    observeServicePackages,
    restoreServicePackage,
    ServicePackageApiError,
  } from "$lib/service-packages/client";
  import ServiceCatalogCard from "$lib/service-packages/ServiceCatalogCard.svelte";
  import type { ServicePackage } from "$lib/service-packages/types";
  import PageHeader from "$lib/ui/PageHeader.svelte";
  import {
    Archive,
    BriefcaseBusiness,
    Layers,
    Package,
    Plus,
    RefreshCw,
    Search,
  } from "@lucide/svelte";

  type CatalogFilter = "active" | "archived";

  const entityCreate = getContext<EntityCreateContext | undefined>(
    ENTITY_CREATE_CONTEXT,
  );

  let packages = $state<ServicePackage[]>([]);
  let activeCount = $state(0);
  let archivedCount = $state(0);
  let filter = $state<CatalogFilter>("active");
  let query = $state("");
  let loading = $state(true);
  let errorMessage = $state("");
  let actionMessage = $state("");
  let abortController: AbortController | undefined;

  const visiblePackages = $derived.by(() => {
    const needle = query.trim().toLocaleLowerCase("pt-BR");
    return packages.filter((pkg) => {
      const archived = Boolean(pkg.archivedAt);
      if (filter === "active" && archived) return false;
      if (filter === "archived" && !archived) return false;
      if (!needle) return true;
      return (
        pkg.name.toLocaleLowerCase("pt-BR").includes(needle) ||
        pkg.description.toLocaleLowerCase("pt-BR").includes(needle) ||
        pkg.projects.some((project) =>
          project.name.toLocaleLowerCase("pt-BR").includes(needle),
        )
      );
    });
  });

  async function loadPackages(): Promise<void> {
    abortController?.abort();
    const controller = new AbortController();
    abortController = controller;
    loading = true;
    errorMessage = "";
    try {
      const response = await listServicePackages({
        archived: "include",
        signal: controller.signal,
      });
      if (controller.signal.aborted) return;
      packages = response.items;
      activeCount = response.facets.active;
      archivedCount = response.facets.archived;
    } catch (cause) {
      if (controller.signal.aborted) return;
      errorMessage =
        cause instanceof ServicePackageApiError
          ? cause.message
          : "Não foi possível carregar os serviços.";
    } finally {
      if (abortController === controller) loading = false;
    }
  }

  function openStudio(pkg: ServicePackage): void {
    void goto(`/meunegocio/${pkg.id}`);
  }

  function useService(pkg: ServicePackage): void {
    entityCreate?.open("contratos", { servicePackageId: pkg.id });
  }

  async function handleDuplicate(pkg: ServicePackage): Promise<void> {
    actionMessage = "";
    try {
      await duplicateServicePackage(pkg.id);
      actionMessage = `Cópia de "${pkg.name}" criada.`;
    } catch (cause) {
      errorMessage =
        cause instanceof ServicePackageApiError
          ? cause.message
          : "Não foi possível duplicar o serviço.";
    }
  }

  async function handleToggleArchive(pkg: ServicePackage): Promise<void> {
    actionMessage = "";
    try {
      if (pkg.archivedAt) {
        await restoreServicePackage(pkg.id);
        actionMessage = `"${pkg.name}" restaurado.`;
      } else {
        await archiveServicePackage(pkg.id);
        actionMessage = `"${pkg.name}" arquivado.`;
      }
    } catch (cause) {
      errorMessage =
        cause instanceof ServicePackageApiError
          ? cause.message
          : "Não foi possível atualizar o status do serviço.";
    }
  }

  async function handleDelete(pkg: ServicePackage): Promise<void> {
    if (
      !window.confirm(
        `Excluir o serviço "${pkg.name}" permanentemente? Contratos já criados não serão afetados.`,
      )
    ) {
      return;
    }
    actionMessage = "";
    try {
      await deleteServicePackage(pkg.id);
      actionMessage = `"${pkg.name}" excluído.`;
    } catch (cause) {
      errorMessage =
        cause instanceof ServicePackageApiError
          ? cause.message
          : "Não foi possível excluir o serviço.";
    }
  }

  onMount(() => {
    void loadPackages();
    const stop = observeServicePackages(() => {
      void loadPackages();
    });
    return () => {
      abortController?.abort();
      stop();
    };
  });
</script>

<svelte:head><title>Serviços · Demanda</title></svelte:head>

<section class="services-catalog" aria-label="Catálogo de serviços">
  <PageHeader eyebrow="Meu negócio" title="Serviços" icon={BriefcaseBusiness}>
    {#snippet actions()}
      <a class="create-service-btn" href="/meunegocio/novo">
        <Plus size={17} strokeWidth={2.2} />
        <span>Novo serviço</span>
      </a>
    {/snippet}
  </PageHeader>

  <div class="catalog-toolbar">
    <div class="filter-pills" role="tablist" aria-label="Filtrar serviços">
      <button
        type="button"
        role="tab"
        aria-selected={filter === "active"}
        class:active={filter === "active"}
        onclick={() => (filter = "active")}
      >
        <Layers size={14} strokeWidth={2} />
        <span>Ativos</span>
        <strong>{activeCount}</strong>
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={filter === "archived"}
        class:active={filter === "archived"}
        onclick={() => (filter = "archived")}
      >
        <Archive size={14} strokeWidth={2} />
        <span>Arquivados</span>
        <strong>{archivedCount}</strong>
      </button>
    </div>

    <label class="search-box">
      <Search size={15} strokeWidth={2} />
      <input
        type="search"
        bind:value={query}
        placeholder="Buscar serviço ou projeto do pacote..."
        aria-label="Buscar serviços"
      />
    </label>
  </div>

  {#if actionMessage}
    <p class="catalog-notice" role="status">{actionMessage}</p>
  {/if}

  {#if errorMessage}
    <div class="catalog-state catalog-state--error" role="alert">
      <strong>Não foi possível carregar os serviços</strong>
      <p>{errorMessage}</p>
      <button
        type="button"
        class="retry-btn"
        onclick={() => void loadPackages()}
      >
        <RefreshCw size={15} />
        <span>Tentar novamente</span>
      </button>
    </div>
  {:else if loading && packages.length === 0}
    <div class="catalog-state" role="status">
      <strong>Carregando catálogo de serviços…</strong>
      <p>Buscando seus modelos de pacotes e estruturas.</p>
    </div>
  {:else if visiblePackages.length === 0}
    <div class="catalog-state">
      <span class="empty-emblem" aria-hidden="true">
        <Package size={24} strokeWidth={1.7} />
      </span>
      <strong>
        {#if packages.length === 0}
          Crie seu primeiro pacote de serviço
        {:else if filter === "archived"}
          Nenhum serviço arquivado
        {:else}
          Nenhum serviço encontrado para esta busca
        {/if}
      </strong>
      <p>
        {#if packages.length === 0}
          Estruture a base comercial e, quando quiser, adicione até 100 projetos
          com suas entregas e tarefas. Depois é só aplicar em qualquer novo
          contrato.
        {:else}
          Ajuste o termo de busca ou alterne entre ativos e arquivados.
        {/if}
      </p>
      {#if packages.length === 0}
        <a class="create-service-btn" href="/meunegocio/novo">
          <Plus size={16} strokeWidth={2.2} />
          <span>Montar primeiro serviço</span>
        </a>
      {/if}
    </div>
  {:else}
    <div class="catalog-grid">
      {#each visiblePackages as pkg (pkg.id)}
        <ServiceCatalogCard
          {pkg}
          onopen={() => openStudio(pkg)}
          onuse={() => useService(pkg)}
          onduplicate={() => void handleDuplicate(pkg)}
          onarchive={() => void handleToggleArchive(pkg)}
          ondelete={() => void handleDelete(pkg)}
        />
      {/each}
    </div>
  {/if}
</section>

<style>
  .services-catalog {
    display: grid;
    gap: 16px;
    width: 100%;
    max-width: var(--content-width);
  }

  .services-catalog :global(.page-header) {
    margin-bottom: 0;
  }

  .create-service-btn {
    display: inline-flex;
    min-height: 40px;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 0 16px;
    border: 1px solid var(--primary);
    border-radius: var(--radius-md);
    color: #ffffff;
    background: var(--primary);
    box-shadow: 0 8px 18px rgba(46, 86, 255, 0.22);
    font: inherit;
    font-size: var(--text-md);
    font-weight: 600;
    text-decoration: none;
    cursor: pointer;
    transition:
      background var(--motion-fast) ease,
      border-color var(--motion-fast) ease;
  }

  .create-service-btn:hover {
    border-color: var(--brand-700);
    background: var(--brand-700);
  }

  .catalog-toolbar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }

  .filter-pills {
    display: inline-flex;
    gap: 6px;
    padding: 4px;
    border: 1px solid var(--border);
    border-radius: 13px;
    background: var(--panel);
  }

  .filter-pills button {
    display: inline-flex;
    min-height: 34px;
    align-items: center;
    gap: 7px;
    padding: 0 12px;
    border: 1px solid transparent;
    border-radius: 9px;
    color: var(--ink-500);
    background: transparent;
    font: inherit;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
  }

  .filter-pills button strong {
    padding: 1px 6px;
    border-radius: var(--radius-pill);
    background: var(--canvas);
    color: var(--ink-700);
    font-size: 11px;
    font-variant-numeric: tabular-nums;
  }

  .filter-pills button.active {
    border-color: color-mix(in srgb, var(--primary) 24%, var(--border));
    color: var(--brand-600);
    background: var(--brand-50);
  }

  .filter-pills button.active strong {
    color: var(--brand-700);
    background: var(--panel);
  }

  .search-box {
    display: flex;
    min-height: 42px;
    width: min(360px, 100%);
    align-items: center;
    gap: 9px;
    padding: 0 14px;
    border: 1px solid var(--border);
    border-radius: 13px;
    color: var(--ink-400);
    background: var(--panel);
  }

  .search-box:focus-within {
    border-color: var(--brand-500);
    box-shadow: var(--focus-ring);
  }

  .search-box input {
    width: 100%;
    border: 0;
    color: var(--ink-950);
    background: transparent;
    font: inherit;
    font-size: 13.5px;
    outline: 0;
  }

  .catalog-notice {
    margin: 0;
    padding: 10px 14px;
    border: 1px solid rgba(93, 172, 131, 0.35);
    border-radius: 12px;
    color: #1f6b47;
    background: rgba(93, 172, 131, 0.1);
    font-size: 13px;
    font-weight: 500;
  }

  .catalog-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(min(100%, 340px), 1fr));
    align-items: stretch;
    gap: 16px;
  }

  .catalog-state {
    display: grid;
    justify-items: center;
    gap: 10px;
    padding: 56px 24px;
    border: 1px dashed var(--border-strong);
    border-radius: 22px;
    background: var(--panel);
    text-align: center;
  }

  .empty-emblem {
    display: grid;
    width: 54px;
    height: 54px;
    border-radius: 16px;
    color: var(--brand-600);
    background: var(--brand-50);
    place-items: center;
  }

  .catalog-state strong {
    color: var(--ink-950);
    font-size: 16.5px;
  }

  .catalog-state p {
    max-width: 460px;
    margin: 0;
    color: var(--ink-500);
    font-size: 13.5px;
    line-height: 1.5;
  }

  .catalog-state--error strong {
    color: var(--danger);
  }

  .retry-btn {
    display: inline-flex;
    min-height: 38px;
    align-items: center;
    gap: 7px;
    padding: 0 14px;
    border: 1px solid var(--border-strong);
    border-radius: 11px;
    color: var(--ink-950);
    background: var(--panel);
    font: inherit;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
  }
</style>
