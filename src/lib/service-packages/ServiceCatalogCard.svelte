<script lang="ts">
  import { resolveColor, resolveIcon } from "$lib/ui/icon-color";
  import {
    Archive,
    ArchiveRestore,
    ArrowUpRight,
    CheckSquare2,
    CircleDot,
    Clock3,
    Copy,
    EllipsisVertical,
    FolderKanban,
    Layers,
    ListChecks,
    Pencil,
    Repeat,
    Shield,
    Trash2,
  } from "@lucide/svelte";
  import {
    formatServiceHours,
    formatServiceMoney,
    type ServicePackage,
  } from "./types";

  let {
    pkg,
    onopen,
    onuse,
    onduplicate,
    onarchive,
    ondelete,
  }: {
    pkg: ServicePackage;
    onopen: () => void;
    onuse: () => void;
    onduplicate: () => void;
    onarchive: () => void;
    ondelete: () => void;
  } = $props();

  let menuOpen = $state(false);
  let menuTrigger = $state<HTMLButtonElement | undefined>();

  const Icon = $derived(resolveIcon(pkg.icon));
  const accent = $derived(
    pkg.color.startsWith("#") ? pkg.color : resolveColor(pkg.color),
  );
  const isArchived = $derived(Boolean(pkg.archivedAt));
  const explicitProjects = $derived(
    pkg.projects.filter((project) => !project.isInstitutional),
  );
  const previewProjects = $derived(explicitProjects.slice(0, 3));
  const extraProjectCount = $derived(
    Math.max(0, explicitProjects.length - previewProjects.length),
  );
  const durationLabel = $derived(
    pkg.durationMonths
      ? pkg.durationMonths === 1
        ? "1 mês"
        : `${pkg.durationMonths} meses`
      : "Prazo livre",
  );
  const amountLabel = $derived(
    pkg.amountCents > 0 ? formatServiceMoney(pkg.amountCents) : "Sob medida",
  );
  const hourlyLabel = $derived(
    pkg.metrics.hourlyRateCents
      ? `~${formatServiceMoney(pkg.metrics.hourlyRateCents)}/h`
      : "",
  );

  function toggleMenu(event: MouseEvent): void {
    event.stopPropagation();
    menuOpen = !menuOpen;
  }

  function runMenuAction(event: MouseEvent, action: () => void): void {
    event.stopPropagation();
    menuOpen = false;
    action();
  }

  function handleWindowKeydown(event: KeyboardEvent): void {
    if (event.key !== "Escape" || !menuOpen) return;
    event.preventDefault();
    menuOpen = false;
    queueMicrotask(() => menuTrigger?.focus());
  }
</script>

<svelte:window
  onclick={() => (menuOpen = false)}
  onkeydown={handleWindowKeydown}
/>

<article
  class="package-card"
  class:archived={isArchived}
  style={`--pkg-accent: ${accent}`}
>
  <span class="card-top-accent" aria-hidden="true"></span>

  <div class="card-header">
    <button
      type="button"
      class="card-identity"
      onclick={onopen}
      aria-label={`Abrir pacote ${pkg.name}`}
    >
      <span class="card-emblem" aria-hidden="true">
        <Icon size={20} strokeWidth={1.9} />
      </span>
      <div class="card-titles">
        <div class="title-row">
          <strong title={pkg.name}>{pkg.name}</strong>
          {#if isArchived}
            <span class="archived-chip">Arquivado</span>
          {/if}
        </div>
        <p class="card-description">
          {pkg.description ||
            "Pacote configurável para geração rápida de contratos."}
        </p>
      </div>
    </button>

    <div class="menu-wrap">
      <button
        bind:this={menuTrigger}
        type="button"
        class="menu-trigger"
        aria-label={`Opções de ${pkg.name}`}
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        onclick={toggleMenu}
      >
        <EllipsisVertical size={17} strokeWidth={2} />
      </button>

      {#if menuOpen}
        <div class="menu-popover" role="menu">
          <button
            type="button"
            role="menuitem"
            onclick={(event) => runMenuAction(event, onopen)}
          >
            <Pencil size={15} strokeWidth={2} />
            <span>Editar pacote</span>
          </button>
          <button
            type="button"
            role="menuitem"
            onclick={(event) => runMenuAction(event, onduplicate)}
          >
            <Copy size={15} strokeWidth={2} />
            <span>Duplicar</span>
          </button>
          <button
            type="button"
            role="menuitem"
            onclick={(event) => runMenuAction(event, onarchive)}
          >
            {#if isArchived}
              <ArchiveRestore size={15} strokeWidth={2} />
              <span>Restaurar</span>
            {:else}
              <Archive size={15} strokeWidth={2} />
              <span>Arquivar</span>
            {/if}
          </button>
          <button
            type="button"
            class="danger"
            role="menuitem"
            onclick={(event) => runMenuAction(event, ondelete)}
          >
            <Trash2 size={15} strokeWidth={2} />
            <span>Excluir</span>
          </button>
        </div>
      {/if}
    </div>
  </div>

  <div class="offer-band">
    <div class="offer-price">
      <span class="offer-label"
        >{pkg.contractType === "recurring"
          ? "Valor mensal"
          : "Valor de referência"}</span
      >
      <div class="price-line">
        <strong>{amountLabel}</strong>
        {#if hourlyLabel}
          <span class="hourly-chip">{hourlyLabel}</span>
        {/if}
      </div>
    </div>
    <div class="offer-term">
      <span class="offer-label">Vigência sugerida</span>
      <strong>{durationLabel}</strong>
    </div>
  </div>

  <div class="blueprint-preview" aria-label="Estrutura do pacote">
    {#if explicitProjects.length > 0}
      <div class="preview-list">
        {#each previewProjects as project (project.id)}
          <div class="preview-project">
            <span class="preview-project-name" title={project.name}>
              <FolderKanban size={13.5} strokeWidth={1.9} />
              <span>{project.name}</span>
            </span>
            <span
              class="nature-pill"
              class:recurring={project.projectType === "recurring"}
            >
              {#if project.projectType === "recurring"}
                <Repeat size={11} strokeWidth={2.2} />
                <span>Recorrente</span>
              {:else}
                <CircleDot size={11} strokeWidth={2.2} />
                <span>Pontual</span>
              {/if}
            </span>
          </div>
        {/each}
        {#if extraProjectCount > 0}
          <span class="more-projects">
            + {extraProjectCount}
            {extraProjectCount === 1 ? "projeto" : "projetos"} neste pacote
          </span>
        {/if}
        {#if pkg.metrics.institutionalDeliveries > 0}
          <span class="institutional-hint">
            <Shield size={12} strokeWidth={2} />
            <span>
              + {pkg.metrics.institutionalDeliveries}
              {pkg.metrics.institutionalDeliveries === 1
                ? "entrega direta (Institucional)"
                : "entregas diretas (Institucional)"}
            </span>
          </span>
        {/if}
      </div>
    {:else if pkg.metrics.institutionalDeliveries > 0}
      <div class="preview-empty-block">
        <Shield size={15} strokeWidth={1.9} />
        <div>
          <strong>Escopo direto (Institucional)</strong>
          <span>
            {pkg.metrics.institutionalDeliveries}
            {pkg.metrics.institutionalDeliveries === 1 ? "entrega" : "entregas"}
            sem projetos extras
          </span>
        </div>
      </div>
    {:else}
      <div class="preview-empty-block">
        <Layers size={15} strokeWidth={1.9} />
        <div>
          <strong>Base comercial pronta</strong>
          <span
            >Apenas condições comerciais — adicione projetos quando quiser</span
          >
        </div>
      </div>
    {/if}
  </div>

  <div class="metrics-strip" aria-label="Composição do serviço">
    <span title="Projetos no pacote (exclui Institucional vazio)">
      <FolderKanban size={13} strokeWidth={2} />
      <strong
        >{explicitProjects.length > 0 ? explicitProjects.length : 1}</strong
      >
      <small>{explicitProjects.length > 1 ? "proj." : "proj."}</small>
    </span>
    <span title="Total de entregas">
      <ListChecks size={13} strokeWidth={2} />
      <strong>{pkg.metrics.totalDeliveries}</strong>
      <small>{pkg.metrics.totalDeliveries === 1 ? "ent." : "ents."}</small>
    </span>
    <span title="Total de tarefas">
      <CheckSquare2 size={13} strokeWidth={2} />
      <strong>{pkg.metrics.totalTasks}</strong>
      <small>{pkg.metrics.totalTasks === 1 ? "tar." : "tars."}</small>
    </span>
    <span title="Esforço estimado">
      <Clock3 size={13} strokeWidth={2} />
      <strong>{formatServiceHours(pkg.metrics.totalMinutes)}</strong>
    </span>
  </div>

  <footer class="card-actions">
    <button type="button" class="btn-outline" onclick={onopen}>
      <Pencil size={14} strokeWidth={2} />
      <span>Abrir estúdio</span>
    </button>
    {#if !isArchived}
      <button type="button" class="btn-use" onclick={onuse}>
        <span>Usar serviço</span>
        <ArrowUpRight size={15} strokeWidth={2.2} />
      </button>
    {/if}
  </footer>
</article>

<style>
  .package-card {
    position: relative;
    display: flex;
    flex-direction: column;
    gap: 14px;
    padding: 18px;
    border: 1px solid var(--border);
    border-radius: 20px;
    background: var(--panel);
    transition:
      border-color var(--motion-fast) ease,
      box-shadow var(--motion-fast) ease,
      transform var(--motion-fast) ease;
  }

  .package-card:hover {
    border-color: color-mix(in srgb, var(--pkg-accent) 42%, var(--border));
    box-shadow: 0 14px 32px rgba(15, 23, 42, 0.08);
    transform: translateY(-1px);
  }

  .package-card.archived {
    opacity: 0.78;
    background: color-mix(in srgb, var(--canvas) 70%, var(--panel));
  }

  .card-top-accent {
    position: absolute;
    top: 0;
    right: 22px;
    left: 22px;
    height: 3px;
    border-radius: 0 0 999px 999px;
    background: var(--pkg-accent);
    opacity: 0.85;
  }

  .card-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 10px;
  }

  .card-identity {
    display: flex;
    min-width: 0;
    flex: 1;
    align-items: flex-start;
    gap: 12px;
    padding: 0;
    border: 0;
    background: transparent;
    color: inherit;
    font: inherit;
    text-align: left;
    cursor: pointer;
  }

  .card-emblem {
    display: grid;
    width: 44px;
    height: 44px;
    flex: 0 0 auto;
    border: 1px solid color-mix(in srgb, var(--pkg-accent) 26%, var(--border));
    border-radius: 14px;
    color: var(--pkg-accent);
    background: color-mix(in srgb, var(--pkg-accent) 11%, var(--panel));
    place-items: center;
  }

  .card-titles {
    display: grid;
    min-width: 0;
    gap: 4px;
  }

  .title-row {
    display: flex;
    min-width: 0;
    align-items: center;
    gap: 8px;
  }

  .title-row strong {
    min-width: 0;
    overflow: hidden;
    color: var(--ink-950);
    font-size: 15.5px;
    font-weight: 700;
    line-height: 1.25;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .archived-chip {
    flex: 0 0 auto;
    padding: 2px 7px;
    border: 1px solid var(--border);
    border-radius: var(--radius-pill);
    color: var(--ink-500);
    background: var(--canvas);
    font-size: 10.5px;
    font-weight: 600;
  }

  .card-description {
    display: -webkit-box;
    margin: 0;
    overflow: hidden;
    color: var(--ink-500);
    font-size: var(--text-sm);
    line-height: 1.42;
    line-clamp: 2;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
  }

  .menu-wrap {
    position: relative;
    flex: 0 0 auto;
  }

  .menu-trigger {
    display: grid;
    width: 32px;
    height: 32px;
    padding: 0;
    border: 1px solid transparent;
    border-radius: 9px;
    color: var(--ink-500);
    background: transparent;
    place-items: center;
    cursor: pointer;
  }

  .menu-trigger:hover {
    border-color: var(--border);
    color: var(--ink-950);
    background: var(--canvas);
  }

  .menu-popover {
    position: absolute;
    z-index: 20;
    top: calc(100% + 6px);
    right: 0;
    display: grid;
    width: 170px;
    gap: 2px;
    padding: 5px;
    border: 1px solid var(--border);
    border-radius: 12px;
    background: var(--panel);
    box-shadow: 0 18px 40px rgba(15, 23, 42, 0.16);
  }

  .menu-popover button {
    display: flex;
    min-height: 34px;
    align-items: center;
    gap: 9px;
    padding: 0 10px;
    border: 0;
    border-radius: 8px;
    color: var(--ink-700);
    background: transparent;
    font: inherit;
    font-size: var(--text-sm);
    font-weight: 500;
    text-align: left;
    cursor: pointer;
  }

  .menu-popover button:hover {
    color: var(--brand-600);
    background: var(--brand-50);
  }

  .menu-popover button.danger {
    color: var(--danger);
  }

  .menu-popover button.danger:hover {
    background: rgba(220, 38, 38, 0.08);
  }

  .offer-band {
    display: grid;
    grid-template-columns: minmax(0, 1.35fr) minmax(0, 0.85fr);
    gap: 10px;
    padding: 12px 14px;
    border: 1px solid color-mix(in srgb, var(--pkg-accent) 16%, var(--border));
    border-radius: 14px;
    background: linear-gradient(
      135deg,
      color-mix(in srgb, var(--pkg-accent) 6%, var(--panel)),
      var(--canvas)
    );
  }

  .offer-price,
  .offer-term {
    display: grid;
    min-width: 0;
    gap: 3px;
  }

  .offer-term {
    padding-left: 10px;
    border-left: 1px solid var(--border);
  }

  .offer-label {
    color: var(--ink-500);
    font-size: 10.5px;
    font-weight: 600;
    letter-spacing: 0.03em;
    text-transform: uppercase;
  }

  .price-line {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 6px;
  }

  .offer-price strong,
  .offer-term strong {
    color: var(--ink-950);
    font-size: 15.5px;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
    letter-spacing: -0.02em;
  }

  .offer-term strong {
    font-size: 13.5px;
    font-weight: 600;
  }

  .hourly-chip {
    padding: 2px 6px;
    border-radius: var(--radius-pill);
    color: color-mix(in srgb, var(--pkg-accent) 78%, var(--ink-950));
    background: color-mix(in srgb, var(--pkg-accent) 12%, var(--panel));
    font-size: 10.5px;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
  }

  .blueprint-preview {
    display: flex;
    min-height: 92px;
    flex: 1;
    flex-direction: column;
    justify-content: center;
    padding: 11px 12px;
    border: 1px dashed var(--border-strong);
    border-radius: 14px;
    background: color-mix(in srgb, var(--canvas) 55%, var(--panel));
  }

  .preview-list {
    display: grid;
    gap: 7px;
  }

  .preview-project {
    display: flex;
    min-width: 0;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }

  .preview-project-name {
    display: inline-flex;
    min-width: 0;
    align-items: center;
    gap: 7px;
    color: var(--ink-800);
    font-size: 12.5px;
    font-weight: 600;
  }

  .preview-project-name :global(svg) {
    flex: 0 0 auto;
    color: var(--ink-400);
  }

  .preview-project-name span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .nature-pill {
    display: inline-flex;
    flex: 0 0 auto;
    align-items: center;
    gap: 4px;
    padding: 2px 7px;
    border-radius: var(--radius-pill);
    color: var(--brand-700);
    background: rgba(46, 86, 255, 0.09);
    font-size: 10.5px;
    font-weight: 600;
  }

  .nature-pill.recurring {
    color: #1f6b47;
    background: rgba(93, 172, 131, 0.16);
  }

  .more-projects,
  .institutional-hint {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    color: var(--ink-500);
    font-size: 11.5px;
    font-weight: 500;
  }

  .preview-empty-block {
    display: flex;
    align-items: center;
    gap: 10px;
    color: var(--ink-500);
  }

  .preview-empty-block > :global(svg) {
    flex: 0 0 auto;
    color: var(--pkg-accent);
  }

  .preview-empty-block div {
    display: grid;
    gap: 2px;
  }

  .preview-empty-block strong {
    color: var(--ink-800);
    font-size: 12.5px;
    font-weight: 600;
  }

  .preview-empty-block span {
    font-size: 11.5px;
    line-height: 1.35;
  }

  .metrics-strip {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 6px;
  }

  .metrics-strip > span {
    display: inline-flex;
    min-width: 0;
    align-items: center;
    justify-content: center;
    gap: 4px;
    padding: 6px 6px;
    border: 1px solid var(--border);
    border-radius: 10px;
    color: var(--ink-500);
    background: var(--canvas);
    font-size: 11.5px;
    font-variant-numeric: tabular-nums;
  }

  .metrics-strip strong {
    color: var(--ink-950);
    font-weight: 700;
  }

  .metrics-strip small {
    color: var(--ink-500);
    font-size: 10.5px;
  }

  .card-actions {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;
    margin-top: auto;
  }

  .card-actions:not(:has(.btn-use)) {
    grid-template-columns: minmax(0, 1fr);
  }

  .btn-outline,
  .btn-use {
    display: inline-flex;
    min-height: 38px;
    align-items: center;
    justify-content: center;
    gap: 6px;
    padding: 0 12px;
    border-radius: 11px;
    font: inherit;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    transition:
      background var(--motion-fast) ease,
      border-color var(--motion-fast) ease,
      color var(--motion-fast) ease;
  }

  .btn-outline {
    border: 1px solid var(--border-strong);
    color: var(--ink-800);
    background: var(--panel);
  }

  .btn-outline:hover {
    border-color: var(--brand-500);
    color: var(--brand-600);
    background: var(--brand-50);
  }

  .btn-use {
    border: 1px solid var(--primary);
    color: #ffffff;
    background: var(--primary);
  }

  .btn-use:hover {
    border-color: var(--brand-700);
    background: var(--brand-700);
  }
</style>
