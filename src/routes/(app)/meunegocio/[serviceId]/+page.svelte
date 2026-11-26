<script lang="ts">
  import { page } from "$app/state";
  import { onMount } from "svelte";
  import {
    getServicePackage,
    ServicePackageApiError,
  } from "$lib/service-packages/client";
  import ServiceStudio from "$lib/service-packages/ServiceStudio.svelte";
  import type { ServicePackage } from "$lib/service-packages/types";
  import { ArrowLeft, RefreshCw } from "@lucide/svelte";

  let pkg = $state<ServicePackage | undefined>();
  let loading = $state(true);
  let errorMessage = $state("");

  async function loadPackage(id: string): Promise<void> {
    loading = true;
    errorMessage = "";
    try {
      pkg = await getServicePackage(id);
    } catch (cause) {
      errorMessage =
        cause instanceof ServicePackageApiError
          ? cause.message
          : "Não foi possível carregar o serviço.";
    } finally {
      loading = false;
    }
  }

  onMount(() => {
    const id = page.params.serviceId;
    if (id) void loadPackage(id);
  });
</script>

<svelte:head>
  <title>{pkg ? `${pkg.name} · Serviços · Demanda` : "Serviço · Demanda"}</title>
</svelte:head>

{#if loading}
  <section class="studio-loading" role="status">
    <strong>Carregando estúdio do serviço…</strong>
    <p>Montando a estrutura de projetos, entregas e tarefas.</p>
  </section>
{:else if errorMessage || !pkg}
  <section class="studio-loading studio-loading--error" role="alert">
    <strong>Não foi possível abrir este serviço</strong>
    <p>{errorMessage || "Serviço não encontrado."}</p>
    <div class="loading-actions">
      <a class="action-btn" href="/meunegocio">
        <ArrowLeft size={15} />
        <span>Voltar para Serviços</span>
      </a>
      {#if page.params.serviceId}
        <button
          type="button"
          class="action-btn"
          onclick={() => void loadPackage(page.params.serviceId!)}
        >
          <RefreshCw size={15} />
          <span>Tentar novamente</span>
        </button>
      {/if}
    </div>
  </section>
{:else}
  <ServiceStudio initialPackage={pkg} mode="edit" />
{/if}

<style>
  .studio-loading {
    display: grid;
    justify-items: center;
    gap: 8px;
    padding: 56px 24px;
    border: 1px solid var(--border);
    border-radius: 20px;
    background: var(--panel);
    text-align: center;
  }

  .studio-loading strong {
    color: var(--ink-950);
    font-size: 16px;
  }

  .studio-loading p {
    margin: 0;
    color: var(--ink-500);
    font-size: 13.5px;
  }

  .studio-loading--error strong {
    color: var(--danger);
  }

  .loading-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-top: 8px;
  }

  .action-btn {
    display: inline-flex;
    min-height: 38px;
    align-items: center;
    gap: 7px;
    padding: 0 14px;
    border: 1px solid var(--border-strong);
    border-radius: 10px;
    color: var(--ink-950);
    background: var(--canvas);
    font: inherit;
    font-size: 13px;
    font-weight: 600;
    text-decoration: none;
    cursor: pointer;
  }
</style>
