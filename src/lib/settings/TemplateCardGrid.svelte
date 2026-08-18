<script module lang="ts">
  export type TemplateCardItem = {
    id: string;
    title: string;
    status: string;
    statusColor: string;
    primary: string;
    secondary: string;
    description: string;
    metric: string | number;
    metricLabel: string;
    auxiliary: string | number;
    auxiliaryLabel: string;
  };
</script>

<script lang="ts">
  import {
    BriefcaseBusiness,
    CalendarClock,
    CircleUserRound,
    Copy,
    EllipsisVertical,
    FileText,
    Flag,
    FolderKanban,
    LayoutTemplate,
    ListTodo,
    Pencil,
    Plus,
    Trash2,
  } from "@lucide/svelte";

  let { kind, items, onadd, onedit, onduplicate, ondelete } = $props<{
    kind: "service" | "delivery";
    items: TemplateCardItem[];
    onadd: () => void;
    onedit: (id: string) => void;
    onduplicate: (id: string) => void;
    ondelete: (id: string) => void;
  }>();

  let openMenuId = $state<string | undefined>();
  let activeMenuTrigger: HTMLButtonElement | undefined;

  let entityLabel = $derived(kind === "service" ? "serviço" : "entrega");
  let addLabel = $derived(`Adicionar modelo de ${entityLabel}`);
  let galleryLabel = $derived(`Modelos de ${entityLabel}`);
  let templateLabel = $derived(
    kind === "service" ? "Modelo de serviço" : "Modelo de entrega",
  );
  let limitReached = $derived(items.length >= 100);

  function toggleMenu(event: MouseEvent, itemId: string): void {
    event.stopPropagation();
    activeMenuTrigger = event.currentTarget as HTMLButtonElement;
    openMenuId = openMenuId === itemId ? undefined : itemId;
  }

  function runAction(
    event: MouseEvent,
    action: (id: string) => void,
    item: TemplateCardItem,
  ): void {
    event.stopPropagation();
    openMenuId = undefined;
    action(item.id);
  }

  function closeMenu(restoreFocus = false): void {
    if (!openMenuId) return;
    openMenuId = undefined;
    if (restoreFocus) queueMicrotask(() => activeMenuTrigger?.focus());
  }

  function handleWindowKeydown(event: KeyboardEvent): void {
    if (event.key !== "Escape" || !openMenuId) return;
    event.preventDefault();
    closeMenu(true);
  }
</script>

<svelte:window onclick={() => closeMenu()} onkeydown={handleWindowKeydown} />

<section class="template-gallery" aria-label={galleryLabel}>
  <button
    class="add-card"
    type="button"
    aria-label={limitReached ? "Limite de 100 modelos atingido" : addLabel}
    title={limitReached ? "Limite de 100 modelos atingido" : addLabel}
    disabled={limitReached}
    onclick={onadd}
  >
    <span class="add-card__mark" aria-hidden="true">
      <span class="add-card__icon">
        <Plus size={22} strokeWidth={1.8} />
      </span>
      <LayoutTemplate size={16} strokeWidth={1.8} />
    </span>
    <span class="add-card__copy">
      <strong>Novo modelo</strong>
      <span>{kind === "service" ? "de serviço" : "de entrega"}</span>
    </span>
  </button>

  {#each items as item (item.id)}
    <article
      class="template-card"
      style={`--template-accent: ${item.statusColor}`}
      aria-label={`Modelo de ${entityLabel}: ${item.title}`}
    >
      <button
        class="card-open"
        type="button"
        aria-label={`Editar ${item.title}`}
        onclick={() => onedit(item.id)}
      ></button>

      <div class="card-menu" class:open={openMenuId === item.id}>
        <button
          class="menu-trigger"
          type="button"
          aria-label={`Abrir ações de ${item.title}`}
          aria-haspopup="true"
          aria-expanded={openMenuId === item.id}
          title="Mais opções"
          onpointerdown={(event) => event.stopPropagation()}
          onclick={(event) => toggleMenu(event, item.id)}
        >
          <EllipsisVertical size={18} strokeWidth={2} />
        </button>

        {#if openMenuId === item.id}
          <div
            class="menu-popover"
            role="group"
            aria-label={`Ações de ${item.title}`}
          >
            <button
              type="button"
              onclick={(event) => runAction(event, onedit, item)}
            >
              <Pencil size={16} strokeWidth={1.9} />
              <span>Editar</span>
            </button>
            <button
              type="button"
              onclick={(event) => runAction(event, onduplicate, item)}
            >
              <Copy size={16} strokeWidth={1.9} />
              <span>Duplicar</span>
            </button>
            <button
              class="danger"
              type="button"
              onclick={(event) => runAction(event, ondelete, item)}
            >
              <Trash2 size={16} strokeWidth={1.9} />
              <span>Excluir</span>
            </button>
          </div>
        {/if}
      </div>

      <header class="card-head">
        <strong class="card-title" title={item.title}>{item.title}</strong>
        <span class="card-template-label">
          <LayoutTemplate size={12} strokeWidth={2} aria-hidden="true" />
          <span>{templateLabel}</span>
        </span>
      </header>

      <div class="card-body">
        <span class="card-info">
          <span class="icon" aria-hidden="true">
            {#if kind === "service"}
              <BriefcaseBusiness size={15} />
            {:else}
              <FolderKanban size={15} />
            {/if}
          </span>
          <span>{item.primary}</span>
        </span>
        <span class="card-info">
          <span class="icon" aria-hidden="true"
            ><CircleUserRound size={15} /></span
          >
          <span>{item.secondary}</span>
        </span>
        <span class="card-info card-description">
          <span class="icon" aria-hidden="true"><FileText size={15} /></span>
          <span>{item.description}</span>
        </span>
      </div>

      <footer class="card-footer">
        <span class="card-metric">
          <span class="icon" aria-hidden="true">
            {#if kind === "service"}
              <ListTodo size={15} />
            {:else}
              <Flag size={15} />
            {/if}
          </span>
          <span class="metric-label">{item.metricLabel}</span>
          <strong>{item.metric}</strong>
        </span>
        <span class="card-metric">
          <span class="icon" aria-hidden="true"
            ><CalendarClock size={15} /></span
          >
          <span class="metric-label">{item.auxiliaryLabel}</span>
          <strong>{item.auxiliary}</strong>
        </span>
      </footer>
    </article>
  {/each}
</section>

<style>
  .template-gallery {
    --template-card-bg: linear-gradient(180deg, #fdfefffa 0%, #f1f8fffa 100%);
    --template-card-bg-hover: linear-gradient(
      180deg,
      #fafdffff 0%,
      #ebf5ffff 100%
    );
    --template-card-border: #bfd4ea;
    --template-card-border-hover: #a8c7e5;
    --template-section-border: #c7d9ea;
    --template-section-bg: #ffffff7a;
    --template-title: #1b3047;
    --template-text: #1f344a;
    --template-muted: #456077;
    --template-icon: #607c96;
    display: grid;
    min-width: 0;
    grid-template-columns: repeat(auto-fill, minmax(min(100%, 290px), 1fr));
    align-items: stretch;
    gap: 12px;
  }

  button {
    font: inherit;
  }

  .add-card,
  .template-card {
    width: 100%;
    min-width: 0;
    min-height: 232px;
    border-radius: 16px;
  }

  .add-card {
    display: grid;
    align-content: center;
    justify-items: center;
    gap: 12px;
    padding: 18px;
    border: 1px dashed var(--template-card-border-hover);
    color: var(--brand-600);
    background: var(--template-card-bg);
    text-align: center;
    transition:
      border-color var(--motion-fast),
      background var(--motion-fast),
      box-shadow var(--motion-fast);
  }

  .add-card:hover {
    border-color: var(--brand-500);
    background: var(--template-card-bg-hover);
  }

  .add-card:disabled {
    cursor: not-allowed;
    opacity: 0.55;
  }

  .add-card:focus-visible {
    border-color: var(--brand-500);
    box-shadow: var(--focus-ring);
    outline: 0;
  }

  .add-card__icon {
    display: grid;
    width: 44px;
    height: 44px;
    border: 1px solid var(--template-card-border);
    border-radius: 50%;
    color: var(--template-title);
    background: color-mix(in srgb, var(--surface) 70%, #edf6ff);
    place-items: center;
  }

  .add-card__mark {
    position: relative;
    display: inline-grid;
    color: var(--template-icon);
  }

  .add-card__mark > :global(svg) {
    position: absolute;
    right: -8px;
    bottom: -3px;
    padding: 2px;
    border: 1px solid var(--template-card-border);
    border-radius: 6px;
    color: var(--brand-600);
    background: var(--surface);
    box-sizing: content-box;
  }

  .add-card__copy {
    display: grid;
    gap: 2px;
    line-height: 1.2;
  }

  .add-card__copy strong {
    color: var(--template-title);
    font-size: var(--text-sm);
    font-weight: 600;
  }

  .add-card__copy > span {
    color: var(--template-muted);
    font-size: var(--text-xs);
  }

  .template-card {
    position: relative;
    display: flex;
    flex-direction: column;
    gap: 9px;
    padding: 12px;
    border: 1px solid var(--template-card-border);
    color: var(--template-text);
    background: var(--template-card-bg);
    transition:
      border-color var(--motion-fast),
      background var(--motion-fast),
      box-shadow var(--motion-fast);
  }

  .template-card:hover {
    border-color: var(--template-card-border-hover);
    background: var(--template-card-bg-hover);
    box-shadow: 0 8px 20px rgba(42, 75, 108, 0.07);
  }

  .template-card:has(.card-open:focus-visible) {
    border-color: var(--brand-500);
    box-shadow: var(--focus-ring);
  }

  .card-open {
    position: absolute;
    z-index: 1;
    padding: 0;
    border: 0;
    border-radius: inherit;
    outline: 0;
    background: transparent;
    cursor: pointer;
    inset: 0;
  }

  .card-head {
    display: grid;
    min-width: 0;
    gap: 6px;
    padding-right: 34px;
  }

  .card-title {
    min-height: calc(var(--text-md) * 1.2);
    min-width: 0;
    overflow: hidden;
    color: var(--template-title);
    font-size: var(--text-md);
    font-weight: 600;
    line-height: 1.2;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .card-template-label {
    display: inline-flex;
    width: fit-content;
    max-width: 100%;
    align-items: center;
    gap: 5px;
    padding: 4px 8px;
    overflow: hidden;
    border: 1px dashed
      color-mix(
        in srgb,
        var(--template-accent) 46%,
        var(--template-card-border)
      );
    border-radius: var(--radius-pill);
    color: color-mix(
      in srgb,
      var(--template-accent) 72%,
      var(--template-title)
    );
    background: color-mix(in srgb, var(--template-accent) 9%, var(--surface));
    font-size: var(--text-xs);
    font-weight: 600;
    letter-spacing: 0.02em;
    line-height: 1;
    text-transform: uppercase;
  }

  .card-template-label > span:last-child {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .icon {
    display: inline-flex;
    flex: 0 0 auto;
    align-items: center;
    justify-content: center;
    color: var(--template-icon);
  }

  .card-body {
    display: grid;
    min-width: 0;
    gap: 8px;
  }

  .card-info {
    display: flex;
    width: 100%;
    min-width: 0;
    min-height: 34px;
    align-items: center;
    gap: 8px;
    padding: 8px;
    border: 1px solid var(--template-section-border);
    border-radius: var(--radius-sm);
    color: var(--template-muted);
    background: var(--template-section-bg);
  }

  .card-info > span:last-child {
    min-width: 0;
    overflow: hidden;
    font-size: var(--text-sm);
    line-height: 1.2;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .card-description > span:last-child {
    display: -webkit-box;
    white-space: normal;
    line-clamp: 2;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
  }

  .card-footer {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 6px;
    margin-top: auto;
  }

  .card-metric {
    display: flex;
    min-width: 0;
    min-height: 34px;
    align-items: center;
    gap: 6px;
    padding: 6px 8px;
    border: 1px solid #b8cfe7;
    border-radius: var(--radius-md);
    color: #31516d;
    background: var(--template-card-bg);
    font-size: var(--text-xs);
    line-height: 1;
  }

  .metric-label {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .card-metric strong {
    min-width: 0;
    margin-left: auto;
    overflow: hidden;
    color: var(--template-title);
    font-size: 13px;
    font-weight: 500;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .card-menu {
    position: absolute;
    z-index: 4;
    top: 10px;
    right: 10px;
  }

  .menu-trigger {
    display: grid;
    padding: 0;
    border: 0;
    color: var(--template-icon);
    background: transparent;
    box-shadow: none;
    place-items: center;
  }

  .menu-trigger :global(svg) {
    translate: calc(50% - 3px);
  }

  .menu-popover {
    position: absolute;
    top: calc(100% + 6px);
    right: 0;
    display: grid;
    width: 160px;
    overflow: hidden;
    padding: 5px;
    border: 1px solid var(--border);
    border-radius: 12px;
    background: var(--surface);
    box-shadow: 0 16px 38px rgba(15, 23, 42, 0.18);
    animation: menu-in var(--motion-fast) ease-out;
  }

  .menu-popover button {
    display: flex;
    width: 100%;
    min-height: 34px;
    align-items: center;
    gap: 9px;
    padding: 0 9px;
    border: 0;
    border-radius: 8px;
    color: var(--ink-700);
    background: transparent;
    font-size: var(--text-sm);
    text-align: left;
  }

  .menu-popover button:hover,
  .menu-popover button:focus-visible {
    color: var(--brand-600);
    outline: 0;
    background: var(--brand-50);
  }

  .menu-popover button.danger {
    color: var(--red-500);
  }

  .menu-popover button.danger:hover,
  .menu-popover button.danger:focus-visible {
    background: rgba(220, 38, 38, 0.07);
  }

  @keyframes menu-in {
    from {
      opacity: 0;
      transform: translateY(-3px);
    }
  }

  @media (max-width: 680px) {
    .template-gallery {
      grid-template-columns: minmax(0, 1fr);
      gap: 10px;
    }

    .add-card,
    .template-card {
      min-height: 220px;
      border-radius: var(--radius-lg);
    }

    .add-card {
      min-height: 112px;
    }

    .card-footer {
      grid-template-columns: minmax(0, 1fr);
    }

    .card-metric {
      justify-content: space-between;
    }

    .card-metric strong {
      margin-left: auto;
    }
  }
</style>
