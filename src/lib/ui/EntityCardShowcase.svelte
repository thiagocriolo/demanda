<script module lang="ts">
  export type {
    EntityCardAction,
    EntityCardItem,
    EntityCardKind,
  } from "./entity-card";
</script>

<script lang="ts">
  import { getContext, onMount } from "svelte";
  import { parseAvatarProfileUrl } from "$lib/avatar/avatar-options";
  import {
    BriefcaseBusiness,
    Building2,
    CalendarCheck2,
    Check,
    CheckSquare,
    FileText,
    FolderKanban,
    ListTodo,
    LoaderCircle,
    Mail,
    PackageCheck,
    Phone,
    Play,
    Plus,
    Tag,
    UsersRound,
  } from "@lucide/svelte";
  import {
    ENTITY_CREATE_CONTEXT,
    type EntityCreateContext,
  } from "$lib/entities/create-context";
  import type { EntityConfig } from "$lib/entities/types";
  import { cardScale, normalizeCardScale } from "./card-scale";
  import EntityCardMenu from "./EntityCardMenu.svelte";
  import type {
    EntityCardAction,
    EntityCardItem,
    EntityCardKind,
  } from "./entity-card";

  function responsibleAvatarStyle(avatarUrl?: string): string | undefined {
    const avatar = parseAvatarProfileUrl(avatarUrl ?? "");
    return avatar
      ? `--wc-card-responsible-avatar-background: ${avatar.avatarColor}`
      : undefined;
  }

  const defaultItems: EntityCardItem[] = [
    {
      id: "pessoas-exemplo-1",
      kind: "pessoa",
      title: "Marina Costa",
      status: "Cliente",
      statusColor: "#f59e0b",
      primary: "(85) 99982-4106",
      secondary: "marina@aurora.com",
      relation: "Estúdio Aurora",
      counts: [2, 4, 12],
    },
    {
      id: "negocios-exemplo-1",
      kind: "negocio",
      title: "Estúdio Aurora",
      status: "Ativado",
      statusColor: "#f59e0b",
      primary: "Marina Costa",
      primaryMore: "+1",
      secondary: "Empreendimento",
      relation: "Reposicionamento e identidade visual",
      counts: [2, 8, 3],
    },
    {
      id: "projetos-exemplo-1",
      kind: "projeto",
      title: "Nova identidade Aurora",
      status: "Execução",
      statusColor: "#5dac83",
      secondary: "Estúdio Aurora",
      relation: "Identidade visual",
      counts: ["8/12", "18.07.2026"],
      progress: 68,
      progressMeta: "8/12 entregas concluídas",
      completion: "18.07.2026",
    },
    {
      id: "entregas-exemplo-1",
      kind: "tarefa",
      title: "Manual de identidade",
      status: "Fazendo",
      statusColor: "#f59e0b",
      primary: "Estúdio Aurora",
      secondary: "Nova identidade Aurora",
      relation: "Design gráfico",
      responsible: "Marina",
      steps: "3/5",
    },
  ];

  let {
    level,
    items = defaultItems,
    ariaLabel = "Cards de pessoa, negócio, projeto e tarefa",
    single = false,
    interactive = true,
    createKey,
    createLabel,
  } = $props<{
    level?: number;
    items?: EntityCardItem[];
    ariaLabel?: string;
    single?: boolean;
    interactive?: boolean;
    createKey?: EntityConfig["key"];
    createLabel?: string;
  }>();
  const entityActions = getContext<EntityCreateContext | undefined>(
    ENTITY_CREATE_CONTEXT,
  );
  let gridElement: HTMLElement;
  let gridWidth = $state(0);
  let viewportWidth = $state(1920);
  let resolvedLevel = $derived(normalizeCardScale(level ?? $cardScale));

  const targetColumns = $derived(11 - resolvedLevel);
  const columns = $derived.by(() => {
    if (single) return 1;
    if (viewportWidth <= 920) return 1;
    if (!gridWidth) return targetColumns;

    const gap =
      resolvedLevel >= 9
        ? 18
        : resolvedLevel >= 7
          ? 14
          : resolvedLevel >= 5
            ? 12
            : resolvedLevel >= 3
              ? 10
              : 8;
    const layoutOffset = Math.max(0, viewportWidth - gridWidth);
    const referenceWidth = Math.max(320, 1920 - layoutOffset);
    const cardWidth =
      (referenceWidth - gap * (targetColumns - 1)) / targetColumns;
    const columnRatio = (gridWidth + gap) / (cardWidth + gap);
    const possibleColumns = Math.max(1, Math.floor(columnRatio + 1e-7));

    return Math.min(targetColumns, possibleColumns);
  });

  function kindLabel(kind: EntityCardKind): string {
    if (kind === "pessoa") return "pessoa";
    if (kind === "negocio") return "negócio";
    if (kind === "projeto") return "projeto";
    return "tarefa";
  }

  function initials(name: string): string {
    return name.trim().charAt(0).toLocaleUpperCase("pt-BR") || "?";
  }

  function actOnCard(action: EntityCardAction, item: EntityCardItem): void {
    entityActions?.actOnCard(action, item);
  }

  function createEntity(): void {
    if (createKey) entityActions?.open(createKey);
  }

  onMount(() => {
    const updateSize = () => {
      gridWidth = gridElement.clientWidth;
      viewportWidth = window.innerWidth;
    };
    const observer = new ResizeObserver(updateSize);

    updateSize();
    observer.observe(gridElement);
    window.addEventListener("resize", updateSize);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", updateSize);
    };
  });
</script>

<div
  class:single
  class="cards-showcase"
  data-card-level={resolvedLevel}
  aria-label={ariaLabel}
>
  <div
    class="wc-card-grid cards-people-list"
    data-card-showcase-grid
    data-cards-per-row={columns}
    bind:this={gridElement}
    style={`--cards-per-row: ${columns}`}
  >
    {#if interactive && entityActions && createKey && createLabel}
      <button
        class="wc-card-create"
        type="button"
        aria-label={`Adicionar ${createLabel}`}
        title={`Adicionar ${createLabel}`}
        onclick={createEntity}
      >
        <span class="wc-card-create__icon" aria-hidden="true">
          <Plus size={25} strokeWidth={1.8} />
        </span>
      </button>
    {/if}

    {#each items as item (item.id)}
      <article
        class:interactive-card={interactive && !!entityActions}
        class={`wc-card-item wc-card-item--${item.kind}`}
        aria-label={`Card de ${kindLabel(item.kind)}: ${item.title}`}
      >
        {#if interactive && entityActions}
          <button
            class="wc-card-open"
            type="button"
            aria-label={`Ver ${item.title}`}
            onclick={() => actOnCard("view", item)}
          >
            <span class="wc-card-open__title">{item.title}</span>
          </button>
          <EntityCardMenu {item} onaction={actOnCard} />
        {/if}

        <header class="wc-card-head wc-card-head--no-avatar">
          <span class="wc-card-head__copy">
            <strong class="wc-card-title">{item.title}</strong>
            <span
              class="wc-card-status"
              style={`--wc-card-status-color: ${item.statusColor}`}
            >
              <span class="icon">
                {#if item.kind === "pessoa"}<Check size={11} />
                {:else if item.kind === "tarefa"}<LoaderCircle size={11} />
                {:else}<Play size={11} />{/if}
              </span>
              <span class="wc-card-status__label">{item.status}</span>
            </span>
          </span>
        </header>

        {#if item.kind === "pessoa"}
          <div class="wc-card-body">
            <span class="wc-card-meta wc-card-info wc-card-info--primary">
              <span class="icon"><Phone size={15} /></span><span
                >{item.primary}</span
              >
            </span>
            <span class="wc-card-meta wc-card-info wc-card-info--secondary">
              <span class="icon"><Mail size={15} /></span><span
                >{item.secondary}</span
              >
            </span>
            <span class="wc-card-relations wc-card-info wc-card-info--relation">
              <span class="icon"><BriefcaseBusiness size={15} /></span>
              <span class="wc-card-relations__items">{item.relation}</span>
            </span>
          </div>
          <footer class="wc-card-footer">
            <span class="wc-card-counter">
              <span class="icon"><BriefcaseBusiness size={15} /></span>
              <span class="wc-card-counter__label">Negócios</span><strong
                >{item.counts?.[0] ?? 0}</strong
              >
            </span>
            <span class="wc-card-counter">
              <span class="icon"><FolderKanban size={15} /></span>
              <span class="wc-card-counter__label">Projetos</span><strong
                >{item.counts?.[1] ?? 0}</strong
              >
            </span>
            <span class="wc-card-counter">
              <span class="icon"><CheckSquare size={15} /></span>
              <span class="wc-card-counter__label">Tarefas</span><strong
                >{item.counts?.[2] ?? 0}</strong
              >
            </span>
          </footer>
        {:else if item.kind === "negocio"}
          <div class="wc-card-body">
            <span class="wc-card-meta wc-card-info wc-card-info--primary">
              <span class="icon"><UsersRound size={15} /></span>
              <span class="wc-card-person-summary">
                <span class="wc-card-person-summary__name">{item.primary}</span>
                {#if item.primaryMore}<span class="wc-card-person-summary__more"
                    >{item.primaryMore}</span
                  >{/if}
              </span>
            </span>
            <span class="wc-card-meta wc-card-info wc-card-info--secondary">
              <span class="icon category-icon"><Building2 size={15} /></span>
              <span>{item.secondary}</span>
            </span>
            <span class="wc-card-relations wc-card-info wc-card-info--relation">
              <span class="icon"><FileText size={15} /></span>
              <span class="wc-card-relations__items">{item.relation}</span>
            </span>
          </div>
          <footer class="wc-card-footer">
            <span class="wc-card-counter">
              <span class="icon"><UsersRound size={15} /></span>
              <span class="wc-card-counter__label">Contatos</span><strong
                >{item.counts?.[0] ?? 0}</strong
              >
            </span>
            <span class="wc-card-counter">
              <span class="icon"><CheckSquare size={15} /></span>
              <span class="wc-card-counter__label">Tarefas</span><strong
                >{item.counts?.[1] ?? 0}</strong
              >
            </span>
            <span class="wc-card-counter">
              <span class="icon"><FolderKanban size={15} /></span>
              <span class="wc-card-counter__label">Projetos</span><strong
                >{item.counts?.[2] ?? 0}</strong
              >
            </span>
          </footer>
        {:else if item.kind === "projeto"}
          <div class="wc-card-body">
            <span
              class="wc-card-meta wc-card-info wc-card-info--secondary wc-card-meta--business"
            >
              <span class="icon"><BriefcaseBusiness size={15} /></span>
              <span>{item.secondary}</span>
            </span>
            <div
              class="wc-card-progress wc-card-info wc-card-info--primary"
              aria-label={`Progresso do projeto: ${item.progress ?? 0} por cento`}
            >
              <div class="wc-card-progress__head">
                <span class="wc-card-progress__label">Progresso</span>
                <strong class="wc-card-progress__value"
                  >{item.progress ?? 0}%</strong
                >
              </div>
              <div class="wc-card-progress__track" aria-hidden="true">
                <span
                  class="wc-card-progress__fill"
                  style={`width: ${item.progress ?? 0}%`}
                ></span>
              </div>
              <span class="wc-card-progress__meta">{item.progressMeta}</span>
            </div>
            <span class="wc-card-meta wc-card-info wc-card-info--relation">
              <span class="icon"><PackageCheck size={15} /></span>
              <span>{item.relation}</span>
            </span>
          </div>
          <footer class="wc-card-footer wc-card-footer--projeto">
            <span class="wc-card-counter wc-card-counter--ratio">
              <span class="icon"><CheckSquare size={15} /></span>
              <span class="wc-card-counter__label">Tarefas</span><strong
                >{item.counts?.[0] ?? "0/0"}</strong
              >
            </span>
            <span class="wc-card-counter wc-card-counter--delivery">
              <span class="icon"><CalendarCheck2 size={15} /></span>
              <span class="wc-card-counter__label">Conclusão</span><strong
                >{item.completion ?? item.counts?.[1]}</strong
              >
            </span>
          </footer>
        {:else}
          <div class="wc-card-body">
            <span class="wc-card-meta wc-card-info wc-card-info--primary">
              <span class="icon"><BriefcaseBusiness size={15} /></span>
              <span>{item.primary}</span>
            </span>
            <span class="wc-card-meta wc-card-info wc-card-info--secondary">
              <span class="icon"><FolderKanban size={15} /></span>
              <span>{item.secondary}</span>
            </span>
            <p class="wc-card-bio wc-card-info wc-card-info--relation">
              <span class="icon"><Tag size={15} /></span>
              <span>{item.relation}</span>
            </p>
          </div>
          <footer class="wc-card-footer wc-card-footer--task">
            <span
              class="wc-card-task-responsibles"
              aria-label={`Responsável: ${item.responsible || "Não informado"}`}
            >
              <span
                class="wc-card-task-responsibles__avatars"
                aria-hidden="true"
              >
                {#if item.responsible}
                  {#if item.responsibleAvatarUrl}
                    <img
                      class="wc-card-task-responsible-avatar"
                      src={item.responsibleAvatarUrl}
                      style={responsibleAvatarStyle(item.responsibleAvatarUrl)}
                      alt=""
                    />
                  {:else}
                    <span class="wc-card-task-responsible-avatar"
                      >{initials(item.responsible)}</span
                    >
                  {/if}
                {/if}
              </span>
              <span class="wc-card-task-responsibles__summary"
                >{item.responsible || "Sem responsável"}</span
              >
            </span>
            <span
              class="wc-card-counter wc-card-counter--ratio"
              aria-label={`Etapas realizadas: ${item.steps ?? "0/0"}`}
            >
              <span class="icon"><ListTodo size={15} /></span><strong
                >{item.steps ?? "0/0"}</strong
              >
            </span>
          </footer>
        {/if}
      </article>
    {/each}
  </div>
</div>

<style>
  .cards-showcase {
    --wc-card-bg: linear-gradient(180deg, #fdfefffa 0%, #f1f8fffa 100%);
    --wc-card-bg-hover: linear-gradient(180deg, #fafdffff 0%, #ebf5ffff 100%);
    --wc-card-border: #bfd4ea;
    --wc-card-border-hover: #a8c7e5;
    --wc-card-section-border: #c7d9ea;
    --wc-card-section-bg: #ffffff7a;
    --wc-card-text: #1f344a;
    --wc-card-title: #1b3047;
    --wc-card-muted: #456077;
    --wc-card-icon: #607c96;
    --wc-card-pill-border: #b8cfe7;
    --wc-card-pill-text: #31516d;
    --state-neutral-bg: #eef2f6;
    --state-neutral-text: #64748b;
    min-width: 0;
  }

  .wc-card-grid {
    display: grid;
    grid-template-columns: repeat(var(--cards-per-row, 4), minmax(0, 1fr));
    gap: var(--cards-gap, 12px);
    align-items: stretch;
    min-width: 0;
    max-width: 100%;
  }

  .wc-card-create {
    width: 100%;
    min-width: 0;
    min-height: 100%;
    padding: var(--card-pad);
    border: 1px dashed var(--wc-card-border-hover);
    border-radius: var(--card-radius);
    color: var(--wc-card-icon);
    background: #f7fbff;
    display: grid;
    place-items: center;
    transition:
      border-color var(--motion-fast),
      color var(--motion-fast),
      background var(--motion-fast),
      transform var(--motion-fast);
  }

  .wc-card-create:hover {
    border-color: var(--brand-500);
    color: var(--brand-600, var(--brand-500));
    background: var(--wc-card-bg-hover);
  }

  .wc-card-create:active {
    transform: translateY(1px);
  }

  .wc-card-create:focus-visible {
    border-color: var(--brand-500);
    box-shadow: var(--focus-ring);
    outline: 0;
  }

  .wc-card-create__icon {
    width: 48px;
    height: 48px;
    border: 1px solid currentColor;
    border-radius: 50%;
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }

  .cards-people-list {
    --cards-gap: 12px;
    --card-pad: 12px;
    --card-gap: 9px;
    --card-radius: 16px;
    --card-title-size: 16px;
    --card-status-font-size: var(--text-xs);
    --card-meta-pad: 8px;
    --card-meta-font-size: var(--text-sm);
    --card-bio-font-size: var(--text-xs);
    --card-info-height: 34px;
    --card-counter-height: 34px;
    --card-counter-font-size: var(--text-xs);
    --card-counter-number-size: 13px;
    --card-title-lines: 1;
  }

  .wc-card-item {
    position: relative;
    width: 100%;
    min-width: 0;
    min-height: 100%;
    padding: var(--card-pad);
    border: 1px solid var(--wc-card-border);
    border-radius: var(--card-radius);
    color: var(--wc-card-text);
    background: var(--wc-card-bg);
    display: flex;
    flex-direction: column;
    gap: var(--card-gap);
    transition:
      border-color var(--motion-fast),
      background var(--motion-fast);
  }

  .wc-card-item:hover {
    border-color: var(--wc-card-border-hover);
    background: var(--wc-card-bg-hover);
  }

  .wc-card-open {
    position: absolute;
    z-index: 1;
    padding: 0;
    border: 0;
    border-radius: inherit;
    background: transparent;
    cursor: pointer;
    inset: 0;
  }

  .wc-card-open__title {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0 0 0 0);
    clip-path: inset(50%);
    white-space: nowrap;
  }

  .wc-card-item:has(.wc-card-open:focus-visible) {
    border-color: var(--brand-500);
    box-shadow: var(--focus-ring);
    outline: 0;
  }

  .interactive-card .wc-card-head {
    padding-right: 34px;
  }

  .wc-card-head {
    min-width: 0;
    display: grid;
    grid-template-columns: 1fr;
    align-items: center;
  }

  .wc-card-head__copy {
    min-width: 0;
    display: grid;
    gap: 6px;
  }

  .wc-card-title {
    min-height: calc(var(--card-title-size) * 1.15 * var(--card-title-lines));
    margin: 0;
    overflow: hidden;
    color: var(--wc-card-title);
    font-size: var(--card-title-size);
    font-weight: 600;
    line-height: 1.15;
    display: -webkit-box;
    line-clamp: var(--card-title-lines);
    -webkit-line-clamp: var(--card-title-lines);
    -webkit-box-orient: vertical;
  }

  .wc-card-status {
    width: fit-content;
    padding: 3px 8px;
    border: 1px solid
      color-mix(in srgb, var(--wc-card-status-color) 42%, var(--border));
    border-radius: var(--radius-pill);
    color: color-mix(
      in srgb,
      var(--wc-card-status-color) 78%,
      var(--wc-card-title)
    );
    background: color-mix(
      in srgb,
      var(--wc-card-status-color) 12%,
      var(--surface)
    );
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-size: var(--card-status-font-size);
    font-weight: 600;
    letter-spacing: 0.02em;
    line-height: 1;
    text-transform: uppercase;
  }

  img.wc-card-task-responsible-avatar {
    background: var(
      --wc-card-responsible-avatar-background,
      var(--state-neutral-soft)
    );
    object-fit: contain;
  }

  .wc-card-status__label {
    white-space: nowrap;
    transform: translateY(0.5px);
  }

  .icon {
    display: inline-flex;
    flex: 0 0 auto;
    align-items: center;
    justify-content: center;
  }

  .wc-card-body {
    min-width: 0;
    display: grid;
    align-content: start;
    gap: var(--card-gap);
  }

  .wc-card-info {
    display: none;
  }

  .wc-card-info--primary {
    order: 1;
  }

  .wc-card-info--secondary {
    order: 2;
  }

  .wc-card-info--relation {
    order: 3;
  }

  .wc-card-meta,
  .wc-card-relations,
  .wc-card-bio {
    width: 100%;
    min-width: 0;
    min-height: var(--card-info-height);
    padding: var(--card-meta-pad);
    border: 1px solid var(--wc-card-section-border);
    border-radius: var(--radius-sm);
    color: var(--wc-card-muted);
    background: var(--wc-card-section-bg);
    align-items: center;
    gap: var(--card-gap);
  }

  .wc-card-bio {
    margin: 0;
    align-items: flex-start;
  }

  .wc-card-meta > span:last-child,
  .wc-card-relations__items,
  .wc-card-bio > span:last-child {
    min-width: 0;
    overflow: hidden;
    font-size: var(--card-meta-font-size);
    line-height: 1.2;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .wc-card-meta .icon,
  .wc-card-relations .icon,
  .wc-card-bio .icon,
  .wc-card-counter .icon {
    color: var(--wc-card-icon);
  }

  .wc-card-meta .category-icon {
    color: #5dac83;
  }

  .wc-card-person-summary {
    width: 100%;
    min-width: 0;
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }

  .wc-card-person-summary__name {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .wc-card-person-summary__more {
    flex: 0 0 auto;
    padding: 2px 6px;
    border: 1px solid var(--wc-card-pill-border);
    border-radius: var(--radius-pill);
    color: var(--wc-card-pill-text);
    background: var(--wc-card-section-bg);
    font-size: var(--card-status-font-size);
    font-weight: 600;
    line-height: 1;
    object-fit: cover;
  }

  .wc-card-progress {
    width: 100%;
    min-width: 0;
    min-height: var(--card-info-height);
    padding: var(--card-meta-pad);
    border: 1px solid var(--wc-card-section-border);
    border-radius: var(--radius-sm);
    background: var(--wc-card-section-bg);
    grid-template-columns: minmax(0, 1fr) auto;
    grid-template-areas: "track value";
    align-items: center;
    gap: var(--card-gap);
  }

  .wc-card-progress__head {
    display: contents;
  }

  .wc-card-progress__label,
  .wc-card-progress__meta {
    display: none;
  }

  .wc-card-progress__value {
    grid-area: value;
    color: var(--wc-card-title);
    font-size: var(--text-sm);
    font-weight: 600;
    line-height: 1;
    white-space: nowrap;
  }

  .wc-card-progress__track {
    grid-area: track;
    height: 8px;
    overflow: hidden;
    border-radius: var(--radius-pill);
    background: var(--state-neutral-bg);
  }

  .wc-card-progress__fill {
    display: block;
    height: 100%;
    border-radius: inherit;
    background: linear-gradient(90deg, #eab308 0%, #f4cc52 100%);
  }

  .wc-card-footer {
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 6px;
  }

  .wc-card-footer--projeto {
    grid-template-columns: minmax(0, 2fr) minmax(0, 4fr);
  }

  .wc-card-footer.wc-card-footer--task {
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    gap: 8px;
  }

  .wc-card-counter {
    min-width: 0;
    min-height: var(--card-counter-height);
    padding: 6px var(--card-meta-pad);
    border: 1px solid var(--wc-card-pill-border);
    border-radius: var(--radius-md);
    color: var(--wc-card-pill-text);
    background: var(--wc-card-bg);
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: var(--card-counter-font-size);
    line-height: 1;
  }

  .wc-card-counter strong {
    min-width: 0;
    margin-left: auto;
    overflow: hidden;
    color: var(--wc-card-title);
    font-size: var(--card-counter-number-size);
    font-weight: 500;
    line-height: 1;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .wc-card-counter__label {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .wc-card-task-responsibles {
    min-width: 0;
    min-height: var(--card-counter-height);
    overflow: hidden;
    color: var(--wc-card-pill-text);
    display: inline-flex;
    align-items: center;
    gap: 7px;
  }

  .wc-card-task-responsibles__avatars {
    display: inline-flex;
    flex: 0 0 auto;
    align-items: center;
  }

  .wc-card-task-responsible-avatar {
    position: relative;
    z-index: 2;
    width: 30px;
    height: 30px;
    margin-left: -8px;
    border: 2px solid #fff;
    border-radius: var(--radius-pill);
    color: var(--state-neutral-text);
    background: color-mix(
      in srgb,
      var(--state-neutral-text) 18%,
      var(--surface)
    );
    box-shadow: 0 1px 2px rgba(15, 23, 42, 0.16);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-size: var(--text-xs);
    font-weight: 600;
    line-height: 1;
  }

  .wc-card-task-responsible-avatar:first-child {
    z-index: 3;
    margin-left: 0;
  }

  .wc-card-task-responsibles__summary {
    min-width: 0;
    overflow: hidden;
    font-size: var(--card-counter-font-size);
    font-weight: 600;
    line-height: 1;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .wc-card-footer--task .wc-card-counter--ratio {
    width: fit-content;
    min-width: 58px;
    justify-self: end;
    justify-content: center;
  }

  .wc-card-footer--task .wc-card-counter--ratio strong {
    margin-left: 0;
  }

  [data-card-level="9"] .cards-people-list,
  [data-card-level="10"] .cards-people-list {
    --cards-gap: 18px;
    --card-pad: 16px;
    --card-gap: 12px;
    --card-radius: 20px;
    --card-title-size: 20px;
    --card-status-font-size: var(--text-sm);
    --card-meta-pad: 10px;
    --card-info-height: 42px;
    --card-meta-font-size: var(--text-md);
    --card-counter-height: 42px;
    --card-counter-font-size: var(--text-sm);
    --card-counter-number-size: 15px;
    --card-title-lines: 2;
  }

  [data-card-level="7"] .cards-people-list,
  [data-card-level="8"] .cards-people-list {
    --cards-gap: 14px;
    --card-pad: 14px;
    --card-gap: 10px;
    --card-radius: 18px;
    --card-title-size: 18px;
    --card-status-font-size: var(--text-sm);
    --card-info-height: 38px;
    --card-counter-height: 38px;
    --card-counter-font-size: var(--text-sm);
    --card-counter-number-size: 14px;
  }

  [data-card-level="5"] .cards-people-list {
    --card-title-size: 14px;
  }

  [data-card-level="3"] .cards-people-list,
  [data-card-level="4"] .cards-people-list {
    --cards-gap: 10px;
    --card-pad: 9px;
    --card-gap: 7px;
    --card-radius: 14px;
    --card-title-size: 14px;
    --card-info-height: 32px;
  }

  [data-card-level="3"] .cards-people-list {
    --card-title-size: 12px;
    --card-status-font-size: 9px;
  }

  [data-card-level="1"] .cards-people-list,
  [data-card-level="2"] .cards-people-list {
    --cards-gap: 8px;
    --card-pad: 8px;
    --card-gap: 6px;
    --card-radius: 12px;
    --card-title-size: 10px;
    --card-info-height: 30px;
  }

  :is([data-card-level="1"], [data-card-level="2"], [data-card-level="3"])
    .wc-card-body {
    display: none;
  }

  :is(
      [data-card-level="4"],
      [data-card-level="5"],
      [data-card-level="6"],
      [data-card-level="7"],
      [data-card-level="8"],
      [data-card-level="9"],
      [data-card-level="10"]
    )
    .wc-card-info--primary,
  :is(
      [data-card-level="6"],
      [data-card-level="7"],
      [data-card-level="8"],
      [data-card-level="9"],
      [data-card-level="10"]
    )
    .wc-card-info--secondary,
  :is(
      [data-card-level="7"],
      [data-card-level="8"],
      [data-card-level="9"],
      [data-card-level="10"]
    )
    .wc-card-info--relation {
    display: inline-flex;
  }

  :is(
      [data-card-level="4"],
      [data-card-level="5"],
      [data-card-level="6"],
      [data-card-level="7"],
      [data-card-level="8"],
      [data-card-level="9"],
      [data-card-level="10"]
    )
    .wc-card-progress.wc-card-info--primary {
    display: grid;
  }

  :is(
      [data-card-level="1"],
      [data-card-level="2"],
      [data-card-level="3"],
      [data-card-level="4"]
    )
    .wc-card-footer {
    display: none;
  }

  :is(
      [data-card-level="5"],
      [data-card-level="6"],
      [data-card-level="7"],
      [data-card-level="8"],
      [data-card-level="9"],
      [data-card-level="10"]
    )
    .wc-card-footer {
    display: grid;
  }

  :is([data-card-level="4"], [data-card-level="5"], [data-card-level="6"])
    .wc-card-item--projeto
    .wc-card-meta--business {
    order: 0;
  }

  :is([data-card-level="4"], [data-card-level="5"])
    .wc-card-item--projeto
    .wc-card-meta--business.wc-card-info--secondary {
    display: inline-flex;
  }

  [data-card-level="4"]
    .wc-card-item--projeto
    .wc-card-progress.wc-card-info--primary,
  [data-card-level="5"] .wc-card-item--projeto .wc-card-footer--projeto {
    display: none;
  }

  :is([data-card-level="5"], [data-card-level="6"], [data-card-level="7"])
    .wc-card-counter__label {
    display: none;
  }

  :is([data-card-level="5"], [data-card-level="6"], [data-card-level="7"])
    .wc-card-counter {
    justify-content: center;
  }

  :is([data-card-level="5"], [data-card-level="6"], [data-card-level="7"])
    .wc-card-counter
    strong {
    margin-left: 0;
  }

  :is([data-card-level="1"], [data-card-level="2"]) .wc-card-item {
    justify-content: center;
  }

  [data-card-level="1"] .wc-card-item.interactive-card {
    --card-menu-top: 50%;
    --card-menu-translate-y: -50%;
    padding: 0;
  }

  [data-card-level="1"] .interactive-card .wc-card-open {
    position: static;
    display: flex;
    width: 100%;
    min-width: 0;
    min-height: calc(var(--card-title-size) * 1.15 + var(--card-pad) * 2);
    flex: 1;
    align-items: center;
    padding: var(--card-pad) calc(var(--card-pad) + 26px) var(--card-pad)
      var(--card-pad);
    border-radius: inherit;
    color: var(--wc-card-title);
    font-size: var(--card-title-size);
    font-weight: 600;
    line-height: 1.15;
    text-align: left;
  }

  [data-card-level="1"] .interactive-card .wc-card-open__title {
    position: static;
    width: auto;
    height: auto;
    min-width: 0;
    overflow: hidden;
    clip: auto;
    clip-path: none;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  [data-card-level="1"] .interactive-card .wc-card-head {
    display: none;
  }

  :is(
      [data-card-level="1"],
      [data-card-level="2"],
      [data-card-level="3"],
      [data-card-level="4"]
    )
    .wc-card-head__copy {
    grid-template-columns: 1fr;
    align-items: start;
  }

  [data-card-level="2"] .wc-card-head__copy,
  :is([data-card-level="4"], [data-card-level="5"])
    .wc-card-head--no-avatar
    .wc-card-head__copy {
    grid-template-columns: auto minmax(0, 1fr);
    align-items: center;
    gap: 6px;
  }

  :is(
      [data-card-level="1"],
      [data-card-level="2"],
      [data-card-level="3"],
      [data-card-level="4"],
      [data-card-level="5"],
      [data-card-level="6"],
      [data-card-level="7"],
      [data-card-level="8"]
    )
    .wc-card-title {
    display: block;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    line-clamp: unset;
    -webkit-line-clamp: unset;
  }

  [data-card-level="1"] .wc-card-status {
    display: none;
  }

  [data-card-level="2"] .wc-card-status,
  :is([data-card-level="4"], [data-card-level="5"])
    .wc-card-head--no-avatar
    .wc-card-status {
    grid-column: 1;
    grid-row: 1;
    width: 24px;
    height: 24px;
    padding: 0;
    justify-content: center;
  }

  [data-card-level="2"] .wc-card-title,
  :is([data-card-level="4"], [data-card-level="5"])
    .wc-card-head--no-avatar
    .wc-card-title {
    grid-column: 2;
    align-self: center;
    line-height: 1;
  }

  [data-card-level="2"] .wc-card-status__label,
  :is([data-card-level="4"], [data-card-level="5"])
    .wc-card-head--no-avatar
    .wc-card-status__label {
    display: none;
  }

  :is([data-card-level="3"], [data-card-level="4"]) .wc-card-head__copy {
    gap: 3px;
  }

  @media (max-width: 920px) {
    .wc-card-grid {
      grid-template-columns: minmax(0, 1fr);
    }

    .cards-people-list {
      --cards-gap: 10px;
      --card-pad: 11px;
      --card-gap: 9px;
      --card-title-size: var(--text-md);
    }

    .wc-card-item {
      border-radius: var(--radius-lg);
    }

    .wc-card-footer,
    .wc-card-footer--projeto {
      grid-template-columns: minmax(0, 1fr);
    }

    .wc-card-counter {
      justify-content: space-between;
    }
  }
</style>
