<script lang="ts">
  import { portal } from "$lib/ui/portal";
  import {
    CheckSquare2,
    Clock3,
    Download,
    FolderKanban,
    Package,
    Search,
    X,
  } from "@lucide/svelte";
  import {
    formatServiceHours,
    type ServicePackage,
    type ServicePackageDelivery,
  } from "./types";

  type ImportCandidate = {
    key: string;
    serviceName: string;
    projectName: string;
    delivery: ServicePackageDelivery;
    totalMinutes: number;
  };

  let {
    packages,
    onselect,
    onclose,
  }: {
    packages: ServicePackage[];
    onselect: (delivery: ServicePackageDelivery) => void;
    onclose: () => void;
  } = $props();

  let query = $state("");

  const candidates = $derived.by((): ImportCandidate[] => {
    const items: ImportCandidate[] = [];
    for (const pkg of packages) {
      for (const project of pkg.projects) {
        for (const delivery of project.deliveries) {
          const totalMinutes = delivery.tasks.reduce(
            (sum, task) => sum + task.durationMinutes,
            0,
          );
          items.push({
            key: `${pkg.id}:${project.id}:${delivery.id}`,
            serviceName: pkg.name,
            projectName: project.name,
            delivery,
            totalMinutes,
          });
        }
      }
    }
    return items;
  });

  const filtered = $derived.by(() => {
    const needle = query.trim().toLocaleLowerCase("pt-BR");
    if (!needle) return candidates;
    return candidates.filter(
      (item) =>
        item.delivery.name.toLocaleLowerCase("pt-BR").includes(needle) ||
        item.projectName.toLocaleLowerCase("pt-BR").includes(needle) ||
        item.serviceName.toLocaleLowerCase("pt-BR").includes(needle),
    );
  });
</script>

<div
  class="backdrop"
  use:portal
  role="presentation"
  onclick={(event) => event.target === event.currentTarget && onclose()}
>
  <div
    class="dialog"
    role="dialog"
    aria-modal="true"
    aria-labelledby="import-delivery-title"
  >
    <header>
      <div>
        <h2 id="import-delivery-title">Importar entrega de outro serviço</h2>
        <p>
          Uma cópia independente da entrega e de suas tarefas será adicionada ao
          projeto atual.
        </p>
      </div>
      <button
        type="button"
        class="close-btn"
        aria-label="Fechar"
        onclick={onclose}
      >
        <X size={18} />
      </button>
    </header>

    <div class="search-row">
      <Search size={16} />
      <input
        type="search"
        bind:value={query}
        placeholder="Buscar por nome da entrega, projeto ou serviço..."
        aria-label="Buscar entrega para importar"
      />
    </div>

    <div class="list">
      {#if !candidates.length}
        <div class="empty">
          <strong>Nenhuma entrega salva em outros serviços ainda</strong>
          <p>
            Assim que você cadastrar entregas em seus serviços, poderá
            reaproveitá-las aqui com um clique.
          </p>
        </div>
      {:else if !filtered.length}
        <div class="empty">
          <strong>Nenhuma entrega encontrada</strong>
          <p>Tente outro termo na busca acima.</p>
        </div>
      {:else}
        {#each filtered as item (item.key)}
          <div class="candidate-row">
            <div class="candidate-copy">
              <strong>{item.delivery.name}</strong>
              <div class="candidate-origin">
                <span><Package size={12} /> {item.serviceName}</span>
                <span><FolderKanban size={12} /> {item.projectName}</span>
              </div>
              <div class="candidate-meta">
                <span>
                  <CheckSquare2 size={12} />
                  {item.delivery.tasks.length}
                  {item.delivery.tasks.length === 1 ? "tarefa" : "tarefas"}
                </span>
                <span>
                  <Clock3 size={12} />
                  {formatServiceHours(item.totalMinutes)}
                </span>
              </div>
            </div>
            <button
              type="button"
              class="import-btn"
              onclick={() => onselect(item.delivery)}
            >
              <Download size={14} strokeWidth={2.2} />
              <span>Importar</span>
            </button>
          </div>
        {/each}
      {/if}
    </div>
  </div>
</div>

<svelte:window onkeydown={(event) => event.key === "Escape" && onclose()} />

<style>
  .backdrop {
    position: fixed;
    z-index: 3300;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 20px;
    background: rgba(15, 23, 42, 0.52);
    inset: 0;
  }

  .dialog {
    display: grid;
    grid-template-rows: auto auto minmax(0, 1fr);
    width: min(640px, 100%);
    max-height: min(82dvh, 720px);
    overflow: hidden;
    border: 1px solid var(--border);
    border-radius: 20px;
    background: var(--panel);
    box-shadow: 0 24px 56px rgba(15, 23, 42, 0.22);
  }

  header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
    padding: 20px 22px 16px;
    border-bottom: 1px solid var(--border);
  }

  header h2 {
    margin: 0;
    color: var(--ink-950);
    font-size: var(--text-lg);
  }

  header p {
    margin: 4px 0 0;
    color: var(--ink-500);
    font-size: var(--text-sm);
  }

  .close-btn {
    display: grid;
    width: 34px;
    height: 34px;
    border: 1px solid var(--border);
    border-radius: 10px;
    color: var(--ink-500);
    background: var(--canvas);
    place-items: center;
    cursor: pointer;
  }

  .search-row {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 12px 22px;
    border-bottom: 1px solid var(--border);
    color: var(--ink-400);
    background: var(--canvas);
  }

  .search-row input {
    width: 100%;
    border: 0;
    color: var(--ink-950);
    background: transparent;
    font: inherit;
    font-size: var(--text-md);
    outline: 0;
  }

  .list {
    display: grid;
    align-content: start;
    gap: 8px;
    overflow-y: auto;
    padding: 16px 22px 22px;
  }

  .candidate-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 14px;
    padding: 12px 14px;
    border: 1px solid var(--border);
    border-radius: 14px;
    background: var(--canvas);
  }

  .candidate-copy {
    display: grid;
    min-width: 0;
    gap: 4px;
  }

  .candidate-copy strong {
    color: var(--ink-950);
    font-size: 14px;
  }

  .candidate-origin,
  .candidate-meta {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    color: var(--ink-500);
    font-size: 12px;
  }

  .candidate-origin span,
  .candidate-meta span {
    display: inline-flex;
    align-items: center;
    gap: 4px;
  }

  .import-btn {
    display: inline-flex;
    min-height: 34px;
    flex: 0 0 auto;
    align-items: center;
    gap: 6px;
    padding: 0 12px;
    border: 1px solid var(--primary);
    border-radius: 9px;
    color: #ffffff;
    background: var(--primary);
    font: inherit;
    font-size: 12.5px;
    font-weight: 600;
    cursor: pointer;
  }

  .import-btn:hover {
    background: var(--brand-700);
  }

  .empty {
    display: grid;
    justify-items: center;
    gap: 6px;
    padding: 36px 16px;
    text-align: center;
    color: var(--ink-500);
  }

  .empty strong {
    color: var(--ink-950);
    font-size: 14.5px;
  }

  .empty p {
    max-width: 380px;
    margin: 0;
    font-size: 13px;
  }
</style>
