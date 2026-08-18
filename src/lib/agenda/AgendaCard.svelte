<script lang="ts">
  import {
    ArrowDown,
    ArrowUp,
    BriefcaseBusiness,
    CalendarClock,
    CheckCheck,
    CircleDot,
    Clock3,
    Ellipsis,
    Flame,
    FolderKanban,
    GripVertical,
    ListTodo,
    Pause,
    Play,
    UserRound,
    X,
  } from "@lucide/svelte";
  import type { AgendaDensity, AgendaItem } from "./types";

  let {
    item,
    density = "comfortable",
    timeLabel = "",
    isDragging = false,
    ondragstart,
    ondragend,
    ondropbefore,
    onunschedule,
    onopen,
  } = $props<{
    item: AgendaItem;
    density?: AgendaDensity;
    timeLabel?: string;
    isDragging?: boolean;
    ondragstart: (event: DragEvent, item: AgendaItem) => void;
    ondragend: () => void;
    ondropbefore: (event: DragEvent, item: AgendaItem) => void;
    onunschedule: (item: AgendaItem) => void;
    onopen?: (item: AgendaItem) => void;
  }>();

  let StatusIcon = $derived(
    item.status === "concluido" || item.status === "entregue"
      ? CheckCheck
      : item.status === "pausado"
        ? Pause
        : item.status === "andamento" || item.status === "producao"
          ? Play
          : item.mode === "tasks"
            ? ListTodo
            : FolderKanban,
  );
  let PriorityIcon = $derived(
    item.priority === "urgente"
      ? Flame
      : item.priority === "alta"
        ? ArrowUp
        : item.priority === "baixa"
          ? ArrowDown
          : CircleDot,
  );

  function initials(value: string): string {
    return value
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0])
      .join("")
      .toLocaleUpperCase("pt-BR");
  }

  function handleDrop(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    ondropbefore(event, item);
  }
</script>

<article
  class:dragging={isDragging}
  class:task={item.mode === "tasks"}
  class:project={item.mode === "projects"}
  class:roomy={density === "roomy"}
  class:comfortable={density === "comfortable"}
  class:compact={density === "compact"}
  class:micro={density === "micro"}
  class={`agenda-card tone-${item.tone}`}
  draggable={true}
  aria-label={`${item.mode === "tasks" ? "Tarefa" : "Projeto"}: ${item.title}. Arraste para reagendar.`}
  data-agenda-card={item.id}
  ondragstart={(event) => ondragstart(event, item)}
  {ondragend}
  ondragover={(event) => event.preventDefault()}
  ondrop={handleDrop}
>
  <header class="card-head">
    <span class="drag-handle" aria-hidden="true"
      ><GripVertical size={15} /></span
    >
    <div class="head-copy">
      <strong>{item.title}</strong>
      <span class="status"
        ><StatusIcon size={12} /><span>{item.statusLabel}</span></span
      >
    </div>
    <span class="card-actions">
      {#if onopen}
        <button
          class="details"
          type="button"
          title="Ver detalhes"
          aria-label={`Ver detalhes de ${item.title}`}
          onclick={(event) => {
            event.stopPropagation();
            onopen?.(item);
          }}><Ellipsis size={15} /></button
        >
      {/if}
      {#if item.date}
        <button
          class="unschedule"
          type="button"
          title="Remover da agenda"
          aria-label={`Remover ${item.title} da agenda`}
          onclick={(event) => {
            event.stopPropagation();
            onunschedule(item);
          }}><X size={14} /></button
        >
      {/if}
    </span>
  </header>

  <div class="card-details">
    <span class="meta primary">
      {#if item.mode === "tasks"}<FolderKanban
          size={14}
        />{:else}<BriefcaseBusiness size={14} />{/if}
      <span>{item.client}</span>
    </span>
    <span class="meta secondary"
      ><UserRound size={14} /><span>{item.relation}</span></span
    >
    <p class="description">{item.description}</p>
  </div>

  {#if item.mode === "projects"}
    <div class="progress" aria-label={`Progresso: ${item.progress}%`}>
      <span class="progress-copy"
        ><span>Progresso</span><strong>{item.progress}%</strong></span
      >
      <span class="progress-track"
        ><span style={`width: ${item.progress}%`}></span></span
      >
    </div>
  {:else}
    <div class="task-facts">
      <span class="priority"><PriorityIcon size={13} />{item.priority}</span>
      <span
        ><Clock3 size={13} />{Math.round(item.durationMinutes / 30) / 2}h</span
      >
    </div>
  {/if}

  <footer>
    {#if timeLabel}<span><CalendarClock size={14} />{timeLabel}</span>{/if}
    {#if item.mode === "projects"}
      <span>{item.completed}/{item.total} tarefas</span>
    {:else}
      <span class="responsible"
        ><span class="avatar">{initials(item.responsible || "SR")}</span
        >{item.completed}/{item.total} etapas</span
      >
    {/if}
  </footer>
</article>

<style>
  .agenda-card {
    --tone: var(--ink-500);
    position: relative;
    display: flex;
    width: 100%;
    min-width: 0;
    min-height: 100%;
    flex-direction: column;
    gap: 9px;
    padding: 12px;
    border: 1px solid color-mix(in srgb, var(--tone) 26%, var(--border));
    border-radius: 14px;
    color: var(--ink-700);
    background: linear-gradient(
      180deg,
      #ffffff 0%,
      color-mix(in srgb, var(--tone) 4%, #ffffff) 100%
    );
    cursor: grab;
    transition:
      opacity var(--motion-fast),
      border-color var(--motion-fast),
      box-shadow var(--motion-fast),
      transform var(--motion-fast);
  }
  .agenda-card:hover {
    border-color: color-mix(in srgb, var(--tone) 48%, var(--border));
    box-shadow: 0 8px 20px rgba(15, 23, 42, 0.08);
    transform: translateY(-1px);
  }
  .agenda-card:active {
    cursor: grabbing;
  }
  .agenda-card.dragging {
    opacity: 0.28;
  }
  .tone-blue {
    --tone: var(--brand-600);
  }
  .tone-green {
    --tone: var(--green-500);
  }
  .tone-amber {
    --tone: var(--amber-500);
  }
  .tone-red {
    --tone: var(--red-500);
  }
  .tone-gray {
    --tone: var(--ink-500);
  }
  .card-head {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: start;
    gap: 6px;
  }
  .drag-handle {
    display: grid;
    width: 18px;
    height: 25px;
    place-items: center;
    color: var(--ink-400);
  }
  .head-copy {
    display: grid;
    min-width: 0;
    gap: 6px;
  }
  .head-copy strong {
    min-width: 0;
    overflow: hidden;
    color: var(--ink-800);
    font-size: 14px;
    font-weight: 600;
    line-height: 1.22;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .status,
  .priority,
  .task-facts span {
    display: inline-flex;
    width: fit-content;
    align-items: center;
    gap: 4px;
    white-space: nowrap;
  }
  .status {
    padding: 3px 7px;
    border: 1px solid color-mix(in srgb, var(--tone) 32%, var(--border));
    border-radius: var(--radius-pill);
    color: color-mix(in srgb, var(--tone) 78%, var(--ink-800));
    background: color-mix(in srgb, var(--tone) 9%, #fff);
    font-size: 10px;
    font-weight: 600;
    line-height: 1;
    text-transform: uppercase;
  }
  .card-actions {
    display: flex;
    align-items: center;
    gap: 2px;
  }
  .unschedule,
  .details {
    display: grid;
    width: 26px;
    height: 26px;
    padding: 0;
    border: 0;
    border-radius: 7px;
    color: var(--ink-400);
    background: transparent;
    opacity: 0;
    place-items: center;
    transition:
      opacity var(--motion-fast),
      background var(--motion-fast);
  }
  .agenda-card:hover :is(.unschedule, .details),
  :is(.unschedule, .details):focus-visible {
    opacity: 1;
  }
  .unschedule:hover {
    color: var(--red-500);
    background: color-mix(in srgb, var(--red-500) 9%, transparent);
  }
  .details:hover {
    color: var(--brand-600);
    background: var(--brand-50);
  }
  .card-details {
    display: grid;
    gap: 7px;
  }
  .meta {
    display: flex;
    min-width: 0;
    min-height: 31px;
    align-items: center;
    gap: 7px;
    padding: 6px 8px;
    border: 1px solid var(--border);
    border-radius: 8px;
    color: var(--ink-500);
    background: rgba(255, 255, 255, 0.58);
    font-size: 11px;
  }
  .meta > span {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .description {
    display: -webkit-box;
    overflow: hidden;
    color: var(--ink-500);
    font-size: 11px;
    line-height: 1.35;
    line-clamp: 2;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
  }
  .progress {
    display: grid;
    gap: 6px;
    margin-top: auto;
  }
  .progress-copy {
    display: flex;
    align-items: center;
    justify-content: space-between;
    color: var(--ink-500);
    font-size: 10px;
  }
  .progress-copy strong {
    color: var(--ink-700);
  }
  .progress-track {
    height: 6px;
    overflow: hidden;
    border-radius: var(--radius-pill);
    background: var(--surface-hover);
  }
  .progress-track span {
    display: block;
    height: 100%;
    border-radius: inherit;
    background: var(--tone);
  }
  .task-facts {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    margin-top: auto;
    color: var(--ink-500);
    font-size: 10px;
  }
  .priority {
    color: var(--ink-700);
    text-transform: capitalize;
  }
  footer {
    display: flex;
    min-height: 26px;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding-top: 8px;
    border-top: 1px solid var(--border);
    color: var(--ink-500);
    font-size: 10px;
  }
  footer > span,
  .responsible {
    display: inline-flex;
    min-width: 0;
    align-items: center;
    gap: 5px;
    white-space: nowrap;
  }
  .avatar {
    display: grid;
    width: 22px;
    height: 22px;
    border: 1px solid color-mix(in srgb, var(--tone) 24%, var(--border));
    border-radius: 50%;
    color: var(--tone);
    background: color-mix(in srgb, var(--tone) 8%, #fff);
    font-size: 8px;
    font-weight: 600;
    place-items: center;
  }
  .compact,
  .micro {
    gap: 7px;
    padding: 9px;
    border-radius: 11px;
  }
  .compact .description,
  .compact .secondary,
  .compact .progress-copy,
  .compact footer,
  .compact .task-facts,
  .micro .card-details,
  .micro .progress,
  .micro .task-facts,
  .micro footer {
    display: none;
  }
  .compact .head-copy strong {
    font-size: 12px;
  }
  .micro {
    min-height: 48px;
    justify-content: center;
  }
  .micro .card-head {
    align-items: center;
  }
  .micro .head-copy {
    grid-template-columns: auto minmax(0, 1fr);
    align-items: center;
  }
  .micro .head-copy strong {
    grid-column: 2;
    grid-row: 1;
    font-size: 10px;
  }
  .micro .status {
    grid-column: 1;
    grid-row: 1;
    width: 22px;
    height: 22px;
    padding: 0;
    justify-content: center;
  }
  .micro .status span,
  .micro .drag-handle,
  .micro .card-actions {
    display: none;
  }
  @container (max-width: 220px) {
    .agenda-card:not(.roomy) .description,
    .agenda-card:not(.roomy) .secondary,
    .agenda-card:not(.roomy) footer {
      display: none;
    }
  }
  @container (max-width: 175px) {
    .agenda-card:not(.roomy) .card-details,
    .agenda-card:not(.roomy) .progress,
    .agenda-card:not(.roomy) .task-facts {
      display: none;
    }
    .agenda-card:not(.roomy) .status span {
      display: none;
    }
  }
</style>
