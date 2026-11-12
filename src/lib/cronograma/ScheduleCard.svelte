<script lang="ts">
  import {
    AlignLeft,
    BriefcaseBusiness,
    CheckCircle2,
    Circle,
    Clock3,
    FolderKanban,
    ListTodo,
    LoaderCircle,
  } from "@lucide/svelte";
  import { formatDuration, scheduleCardLevel } from "./date";
  import type { ScheduleEntry, ScheduleTask } from "./types";

  let {
    task,
    schedule,
    compact = false,
    dragging = false,
    muted = false,
    style,
    onpointerstart,
    onopen,
  } = $props<{
    task: ScheduleTask;
    schedule?: ScheduleEntry;
    compact?: boolean;
    dragging?: boolean;
    muted?: boolean;
    style?: string;
    onpointerstart: (event: PointerEvent) => void;
    onopen: () => void;
  }>();

  const statusDetails = {
    pendente: { label: "Pendente", icon: Circle, tone: "gray" },
    planejamento: { label: "Planejamento", icon: Circle, tone: "gray" },
    fila: { label: "A fazer", icon: Circle, tone: "gray" },
    producao: { label: "Em produção", icon: LoaderCircle, tone: "blue" },
    revisao: { label: "Em revisão", icon: LoaderCircle, tone: "amber" },
    conclusao: { label: "Concluída", icon: CheckCircle2, tone: "green" },
    concluida: { label: "Concluída", icon: CheckCircle2, tone: "green" },
    concluido: { label: "Concluída", icon: CheckCircle2, tone: "green" },
    entregue: { label: "Entregue", icon: CheckCircle2, tone: "green" },
  } as const;

  let status = $derived(
    statusDetails[task.status as keyof typeof statusDetails] ??
      statusDetails.pendente,
  );
  let StatusIcon = $derived(status.icon);
  let visualLevel = $derived(scheduleCardLevel(schedule?.durationSlots ?? 2));
  let businessName = $derived(task.negocio?.trim() || "Negócio não informado");

  function handleKeydown(event: KeyboardEvent): void {
    if (muted) return;
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    onopen();
  }

  function handlePointerdown(event: PointerEvent): void {
    if (muted) return;
    onpointerstart(event);
  }
</script>

<button
  type="button"
  class:compact
  class:attached={!compact && !!schedule}
  class:dragging
  class:muted
  class={`task-card tone-${status.tone}`}
  {style}
  aria-label={`${task.nome}. Negócio: ${businessName}. Status: ${status.label}`}
  aria-disabled={muted}
  data-task-id={task.id}
  data-schedule-card
  data-card-level={!compact && schedule ? visualLevel : undefined}
  data-schedule-lines={!compact ? schedule?.durationSlots : undefined}
  onpointerdown={handlePointerdown}
  onkeydown={handleKeydown}
>
  <div class="card-body">
    <header>
      <h3>{task.nome}</h3>
      <span
        class="business"
        title={businessName}
        aria-label={`Negócio: ${businessName}`}
      >
        <BriefcaseBusiness size={13} strokeWidth={2.1} aria-hidden="true" />
        <span>{businessName}</span>
      </span>
    </header>

    <p class="meta task-name">
      <ListTodo size={13} aria-hidden="true" />
      <span>{task.taskNome}</span>
    </p>

    {#if task.projeto}
      <p class="meta project">
        <FolderKanban size={13} aria-hidden="true" />
        <span>{task.projeto}</span>
      </p>
    {/if}

    <p class="meta status-detail" title={status.label}>
      <StatusIcon size={13} strokeWidth={2.1} aria-hidden="true" />
      <span>{status.label}</span>
    </p>

    {#if task.descricao}
      <p class="meta description">
        <AlignLeft size={13} aria-hidden="true" />
        <span>{task.descricao}</span>
      </p>
    {/if}

    {#if schedule}
      <footer>
        <span class="footer-fact">
          <Clock3 size={13} />
          <span class="footer-copy">
            <small>Início</small>
            <strong
              >{String(Math.floor(schedule.startMinutes / 60)).padStart(
                2,
                "0",
              )}:{String(schedule.startMinutes % 60).padStart(2, "0")}</strong
            >
          </span>
        </span>
        <span class="footer-fact">
          <span class="footer-copy">
            <small>Duração</small>
            <strong>{formatDuration(schedule.durationSlots)}</strong>
          </span>
        </span>
      </footer>
    {/if}
  </div>
</button>

<style>
  .task-card {
    container: schedule-card / size;
    min-width: 0;
    overflow: hidden;
    border: 1px solid rgba(46, 86, 255, 0.3);
    border-radius: 2px;
    color: var(--ink-800);
    background: linear-gradient(145deg, #ffffff, #f4f7ff);
    cursor: grab;
    font: inherit;
    text-align: left;
    touch-action: none;
    user-select: none;
    transition:
      opacity var(--motion-fast),
      border-color var(--motion-fast),
      background var(--motion-fast);
  }
  .task-card:hover,
  .task-card:focus-visible {
    z-index: 8 !important;
    border-color: var(--brand-600);
    background: #ffffff;
  }
  .task-card::before {
    position: absolute;
    z-index: 10;
    right: 0;
    bottom: 0;
    left: 0;
    height: 16px;
    background: linear-gradient(180deg, transparent, rgba(15, 23, 42, 0.09));
    cursor: ns-resize;
    content: "";
    opacity: 0;
    pointer-events: auto;
  }
  .task-card::after {
    position: absolute;
    bottom: 4px;
    left: 50%;
    width: 28px;
    height: 4px;
    border-radius: var(--radius-pill);
    background: repeating-linear-gradient(
      90deg,
      rgba(15, 23, 42, 0.34) 0 2px,
      transparent 2px 4px
    );
    content: "";
    opacity: 0.58;
    pointer-events: none;
    transform: translateX(-50%);
  }
  .task-card:hover::before,
  .task-card:focus-visible::before {
    opacity: 1;
  }
  .task-card.dragging {
    border-style: dashed;
    opacity: 0.26;
    pointer-events: none;
  }
  .task-card.muted {
    border-color: rgba(148, 163, 184, 0.38);
    background: #ffffff;
    cursor: default;
  }
  .task-card.muted:hover,
  .task-card.muted:focus-visible {
    border-color: rgba(148, 163, 184, 0.38);
    background: #ffffff;
  }
  .task-card.muted::before,
  .task-card.muted::after {
    display: none;
  }
  .task-card.muted .card-body {
    opacity: 0.5;
  }
  .card-body {
    display: grid;
    min-width: 0;
    gap: 5px;
    padding: 8px 9px 18px;
  }
  header {
    display: flex;
    min-width: 0;
    align-items: flex-start;
    gap: 6px;
  }
  h3 {
    display: -webkit-box;
    min-width: 0;
    flex: 1;
    overflow: hidden;
    color: var(--ink-950);
    font-size: 14px;
    font-weight: 600;
    line-height: 1.16;
    line-clamp: 2;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
  }
  .business {
    display: inline-flex;
    max-width: 48%;
    min-width: 0;
    height: 22px;
    flex: 0 0 auto;
    align-items: center;
    justify-content: center;
    gap: 4px;
    padding: 0 6px;
    border: 1px solid rgba(100, 116, 139, 0.2);
    border-radius: var(--radius-pill);
    color: var(--ink-500);
    background: rgba(255, 255, 255, 0.75);
    font-size: 10px;
    font-weight: 600;
    white-space: nowrap;
  }
  .business span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .meta {
    display: none;
    min-width: 0;
    align-items: center;
    gap: 5px;
    color: var(--ink-500);
    font-size: var(--text-xs);
    line-height: 1.2;
  }
  .meta span {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .status-detail {
    color: var(--ink-600);
    font-weight: 600;
  }
  .tone-blue .status-detail {
    color: #3155c9;
  }
  .tone-amber .status-detail {
    color: #9a6700;
  }
  .tone-green .status-detail {
    color: #28764d;
  }
  footer {
    display: none;
    align-items: center;
    justify-content: space-between;
    gap: 6px;
    color: var(--ink-500);
    font-size: var(--text-xs);
    font-weight: 600;
  }
  .footer-fact {
    display: inline-flex;
    min-width: 0;
    flex: 1;
    align-items: center;
    gap: 4px;
    padding: 5px 6px;
    border: 1px solid rgba(148, 163, 184, 0.28);
    border-radius: 6px;
    background: rgba(255, 255, 255, 0.62);
  }
  .footer-copy {
    display: grid;
    min-width: 0;
    gap: 1px;
  }
  .footer-copy small {
    display: none;
    color: var(--ink-400);
    font-size: 9px;
    font-weight: 500;
    line-height: 1;
    text-transform: uppercase;
  }
  .footer-copy strong {
    overflow: hidden;
    color: var(--ink-600);
    font-size: var(--text-xs);
    font-weight: 600;
    line-height: 1.1;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .tone-blue {
    border-color: rgba(46, 86, 255, 0.34);
    background: linear-gradient(145deg, #ffffff, #eef2ff);
  }
  .tone-amber {
    border-color: rgba(234, 179, 8, 0.38);
    background: linear-gradient(145deg, #ffffff, #fffae8);
  }
  .tone-green {
    border-color: rgba(93, 172, 131, 0.4);
    background: linear-gradient(145deg, #ffffff, #edf8f2);
  }
  .task-card.attached {
    border: 0;
    border-radius: 0;
  }
  .task-card.attached .meta {
    min-height: 30px;
    padding: 6px 7px;
    border: 1px solid rgba(148, 163, 184, 0.24);
    border-radius: 5px;
    background: rgba(255, 255, 255, 0.5);
  }
  .task-card.attached .description {
    align-items: flex-start;
  }
  .task-card.attached[data-schedule-lines="1"]::after {
    display: none;
  }
  .task-card.attached[data-schedule-lines="1"] .card-body {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    padding: 0 7px;
  }
  .task-card.attached[data-schedule-lines="1"] header {
    width: 100%;
    align-items: center;
  }
  .task-card.attached[data-schedule-lines="1"] h3 {
    font-size: 11px;
    line-height: 1.15;
    line-clamp: 1;
    -webkit-line-clamp: 1;
  }
  .task-card.attached .description span {
    display: -webkit-box;
    white-space: normal;
    line-clamp: 1;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 1;
  }
  .task-card.attached[data-card-level="3"] .card-body {
    gap: 3px;
    padding: 6px 8px 12px;
  }
  .task-card.attached[data-card-level="3"] header,
  .task-card.attached[data-card-level="4"] header {
    align-items: flex-start;
    flex-direction: column;
    gap: 3px;
  }
  .task-card.attached:is(
      [data-card-level="3"],
      [data-card-level="4"]
    )
    .business {
    max-width: 100%;
  }
  .task-card.attached[data-card-level="3"] h3 {
    font-size: 12px;
    line-clamp: 1;
    -webkit-line-clamp: 1;
  }
  .task-card.attached[data-card-level="4"] .card-body {
    display: flex;
    min-height: 100%;
    box-sizing: border-box;
    flex-direction: column;
    gap: 5px;
    padding: 8px 9px 11px;
  }
  .task-card.attached:is(
      [data-card-level="4"],
      [data-card-level="5"],
      [data-card-level="6"],
      [data-card-level="7"],
      [data-card-level="8"],
      [data-card-level="9"],
      [data-card-level="10"]
    )
    header {
    display: contents;
  }
  .task-card.attached:is(
      [data-card-level="4"],
      [data-card-level="5"],
      [data-card-level="6"]
    )
    h3 {
    font-size: 14px;
    line-clamp: 1;
    -webkit-line-clamp: 1;
  }
  .task-card.attached:is([data-card-level="5"], [data-card-level="6"])
    .card-body {
    display: flex;
    min-height: 100%;
    box-sizing: border-box;
    flex-direction: column;
    gap: 9px;
    padding: 12px 11px 18px;
  }
  .task-card.attached:is([data-card-level="5"], [data-card-level="6"]) h3 {
    font-size: 16px;
  }
  .task-card.attached:is([data-card-level="7"], [data-card-level="8"])
    .card-body {
    display: flex;
    min-height: 100%;
    box-sizing: border-box;
    flex-direction: column;
    gap: 10px;
    padding: 14px 13px 18px;
  }
  .task-card.attached:is([data-card-level="7"], [data-card-level="8"]) h3 {
    font-size: 18px;
  }
  .task-card.attached:is([data-card-level="9"], [data-card-level="10"])
    .card-body {
    display: flex;
    min-height: 100%;
    box-sizing: border-box;
    flex-direction: column;
    gap: 12px;
    padding: 16px 15px 18px;
  }
  .task-card.attached:is([data-card-level="9"], [data-card-level="10"]) h3 {
    font-size: 20px;
  }
  .task-card.attached:is(
      [data-card-level="4"],
      [data-card-level="5"],
      [data-card-level="6"],
      [data-card-level="7"],
      [data-card-level="8"],
      [data-card-level="9"],
      [data-card-level="10"]
    )
    .task-name,
  .task-card.attached:is(
      [data-card-level="4"],
      [data-card-level="5"],
      [data-card-level="6"],
      [data-card-level="7"],
      [data-card-level="8"],
      [data-card-level="9"],
      [data-card-level="10"]
    )
    .business,
  .task-card.attached:is(
      [data-card-level="5"],
      [data-card-level="6"],
      [data-card-level="7"],
      [data-card-level="8"],
      [data-card-level="9"],
      [data-card-level="10"]
    )
    .project,
  .task-card.attached:is(
      [data-card-level="8"],
      [data-card-level="9"],
      [data-card-level="10"]
    )
    .description,
  .task-card.attached:is(
      [data-card-level="6"],
      [data-card-level="7"],
      [data-card-level="8"],
      [data-card-level="9"],
      [data-card-level="10"]
    )
    .status-detail,
  .task-card.attached:is(
      [data-card-level="7"],
      [data-card-level="8"],
      [data-card-level="9"],
      [data-card-level="10"]
    )
    footer {
    display: flex;
  }
  .task-card.attached:is(
      [data-card-level="4"],
      [data-card-level="5"],
      [data-card-level="6"],
      [data-card-level="7"],
      [data-card-level="8"],
      [data-card-level="9"],
      [data-card-level="10"]
    )
    h3 {
    width: 100%;
    flex: 0 0 auto;
    order: 1;
  }
  .task-card.attached:is(
      [data-card-level="4"],
      [data-card-level="5"],
      [data-card-level="6"],
      [data-card-level="7"],
      [data-card-level="8"],
      [data-card-level="9"],
      [data-card-level="10"]
    )
    .business {
    width: 100%;
    min-height: 30px;
    max-width: none;
    height: auto;
    box-sizing: border-box;
    flex: 0 0 auto;
    justify-content: flex-start;
    gap: 5px;
    padding: 6px 7px;
    border-color: rgba(148, 163, 184, 0.24);
    border-radius: 5px;
    color: var(--ink-500);
    background: rgba(255, 255, 255, 0.5);
    font-size: var(--text-xs);
    font-weight: 400;
    order: 5;
  }
  .task-card.attached .status-detail {
    order: 2;
  }
  .task-card.attached .task-name {
    order: 3;
  }
  .task-card.attached .project {
    order: 4;
  }
  .task-card.attached footer {
    order: 6;
  }
  .task-card.attached .description {
    order: 7;
  }
  .task-card.attached:is(
      [data-card-level="8"],
      [data-card-level="9"],
      [data-card-level="10"]
    )
    .footer-copy
    small {
    display: block;
  }
  .task-card.attached:is([data-card-level="9"], [data-card-level="10"])
    .description
    span {
    line-clamp: 2;
    -webkit-line-clamp: 2;
  }
  .task-card.compact {
    position: relative;
    width: clamp(204px, 21vw, 258px);
    height: 88px;
    flex: 0 0 clamp(204px, 21vw, 258px);
    scroll-snap-align: start;
    border-radius: 9px;
  }
  .task-card.compact::before,
  .task-card.compact::after {
    display: none;
  }
  .task-card.compact .card-body {
    padding: 9px;
  }
  .task-card.compact .project {
    display: flex;
  }
</style>
