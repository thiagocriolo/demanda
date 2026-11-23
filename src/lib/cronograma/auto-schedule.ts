import { isTaskCompleted } from "../entities/tasks";
import type { WorkShift } from "../settings/types";
import { findScheduleConflict, findSequenceConflict } from "./conflicts";
import {
  MAX_DURATION_SLOTS,
  MINUTES_PER_SLOT,
  isoDate,
  parseIsoDate,
  timeToMinutes,
} from "./date";
import type { ScheduleEntry, ScheduleMap, ScheduleTask } from "./types";

export type AutoScheduleInput = {
  deliveries: ScheduleTask[];
  candidateDeliveryIds: Iterable<string>;
  schedules: ScheduleMap;
  days: string[];
  shifts: WorkShift[];
  now?: Date;
};

export type AutoScheduleResult = {
  schedule: ScheduleMap;
  changedDeliveryIds: string[];
  scheduledDeliveryIds: string[];
  unscheduledDeliveryIds: string[];
};

const PRIORITY_WEIGHT: Record<string, number> = {
  urgente: 500,
  emergente: 440,
  alta: 320,
  normal: 160,
  media: 160,
  baixa: 40,
};

const STATUS_WEIGHT: Record<string, number> = {
  producao: 600,
  fazendo: 600,
  "em andamento": 600,
  revisao: 520,
  "em revisao": 520,
  fila: 360,
  "a fazer": 360,
  pendente: 300,
  planejamento: 220,
};

function normalized(value?: string): string {
  return (value ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .trim()
    .toLocaleLowerCase("pt-BR");
}

function dateOnly(value?: string): string | undefined {
  const candidate = value?.slice(0, 10);
  return parseIsoDate(candidate)?.toISOString().slice(0, 10);
}

function dayDistance(left: string, right: string): number {
  const leftDate = parseIsoDate(left);
  const rightDate = parseIsoDate(right);
  if (!leftDate || !rightDate) return 0;
  return Math.round((leftDate.getTime() - rightDate.getTime()) / 86_400_000);
}

/**
 * Pontuação explicável usada pela heurística. Prazos vencidos e próximos,
 * trabalho já iniciado, prioridade declarada e tempo de espera têm pesos
 * decrescentes nessa ordem.
 */
export function autoScheduleScore(delivery: ScheduleTask, today: string): number {
  const dueDate = dateOnly(delivery.dueDate);
  const requestedDate = dateOnly(delivery.requestedDate || delivery.createdAt);
  const daysToDue = dueDate ? dayDistance(dueDate, today) : undefined;
  const waitingDays = requestedDate
    ? Math.max(0, dayDistance(today, requestedDate))
    : 0;
  const deadlineWeight =
    daysToDue === undefined
      ? 0
      : daysToDue < 0
        ? 1_000 + Math.min(400, Math.abs(daysToDue) * 20)
        : Math.max(0, 700 - daysToDue * 45);

  return (
    deadlineWeight +
    (STATUS_WEIGHT[normalized(delivery.deliveryStatus)] ?? 0) +
    (PRIORITY_WEIGHT[normalized(delivery.priority)] ?? PRIORITY_WEIGHT.normal) +
    Math.min(180, waitingDays * 3)
  );
}

function durationSlots(delivery: ScheduleTask): number {
  const parsed = Math.round(Number(delivery.duracao) * (60 / MINUTES_PER_SLOT));
  if (!Number.isFinite(parsed)) return 2;
  return Math.max(1, Math.min(MAX_DURATION_SLOTS, parsed));
}

function normalizedShifts(shifts: WorkShift[]): Array<{
  start: number;
  end: number;
}> {
  return shifts
    .flatMap((shift) => {
      const start = timeToMinutes(shift.start);
      const end = timeToMinutes(shift.end);
      return start !== null && end !== null && end > start
        ? [{ start, end }]
        : [];
    })
    .sort((left, right) => left.start - right.start);
}

function roundUpToSlot(minutes: number): number {
  return Math.ceil(minutes / MINUTES_PER_SLOT) * MINUTES_PER_SLOT;
}

function entriesEqual(
  left: ScheduleEntry | undefined,
  right: ScheduleEntry | undefined,
): boolean {
  return (
    left?.date === right?.date &&
    left?.startMinutes === right?.startMinutes &&
    left?.durationSlots === right?.durationSlots
  );
}

function deliveryComparator(today: string) {
  return (left: ScheduleTask, right: ScheduleTask): number => {
    const scoreDifference =
      autoScheduleScore(right, today) - autoScheduleScore(left, today);
    if (scoreDifference) return scoreDifference;

    const leftDue = dateOnly(left.dueDate) ?? "9999-12-31";
    const rightDue = dateOnly(right.dueDate) ?? "9999-12-31";
    return (
      leftDue.localeCompare(rightDue) ||
      (
        dateOnly(left.requestedDate || left.createdAt) ?? "9999-12-31"
      ).localeCompare(
        dateOnly(right.requestedDate || right.createdAt) ?? "9999-12-31",
      ) ||
      left.deliveryId.localeCompare(right.deliveryId) ||
      left.sequence - right.sequence ||
      left.id.localeCompare(right.id)
    );
  };
}

function placeDelivery(
  delivery: ScheduleTask,
  allDeliveries: ScheduleTask[],
  schedule: ScheduleMap,
  days: string[],
  shifts: Array<{ start: number; end: number }>,
  today: string,
  currentMinutes: number,
): ScheduleEntry | undefined {
  const slots = durationSlots(delivery);
  const durationMinutes = slots * MINUTES_PER_SLOT;
  const requestedDate = dateOnly(delivery.requestedDate || delivery.createdAt);

  for (const date of days) {
    if (date < today || (requestedDate && date < requestedDate)) continue;
    for (const shift of shifts) {
      const earliest =
        date === today
          ? Math.max(shift.start, roundUpToSlot(currentMinutes))
          : shift.start;
      for (
        let startMinutes = earliest;
        startMinutes + durationMinutes <= shift.end;
        startMinutes += MINUTES_PER_SLOT
      ) {
        const candidate: ScheduleEntry = {
          date,
          startMinutes,
          durationSlots: slots,
        };
        if (
          !findScheduleConflict(delivery, candidate, allDeliveries, schedule) &&
          !findSequenceConflict(delivery, candidate, allDeliveries, schedule)
        ) {
          return candidate;
        }
      }
    }
  }
}

function plan(
  candidates: ScheduleTask[],
  allDeliveries: ScheduleTask[],
  base: ScheduleMap,
  days: string[],
  shifts: Array<{ start: number; end: number }>,
  today: string,
  currentMinutes: number,
): { schedule: ScheduleMap; scheduledIds: string[] } {
  const schedule = { ...base };
  const scheduledIds: string[] = [];
  for (const delivery of candidates) {
    const entry = placeDelivery(
      delivery,
      allDeliveries,
      schedule,
      days,
      shifts,
      today,
      currentMinutes,
    );
    if (!entry) continue;
    schedule[delivery.id] = entry;
    scheduledIds.push(delivery.id);
  }
  return { schedule, scheduledIds };
}

/**
 * Reorganiza a semana sem tocar em blocos fora dela. A busca é determinística,
 * respeita dependências, responsáveis, jornada e intervalos configurados.
 */
export function autoScheduleWeek(input: AutoScheduleInput): AutoScheduleResult {
  const now = input.now ?? new Date();
  const today = isoDate(now);
  const days = [...new Set(input.days)].sort();
  const daySet = new Set(days);
  const candidateIds = new Set(input.candidateDeliveryIds);
  const shifts = normalizedShifts(input.shifts);
  const currentMinutes = now.getHours() * 60 + now.getMinutes();

  if (!days.length || !shifts.length) {
    return {
      schedule: { ...input.schedules },
      changedDeliveryIds: [],
      scheduledDeliveryIds: [],
      unscheduledDeliveryIds: [...candidateIds],
    };
  }

  const candidates = input.deliveries
    .filter(
      (delivery) => candidateIds.has(delivery.id) && !isTaskCompleted(delivery.status),
    )
    .sort(deliveryComparator(today));
  const movableIds = new Set(
    candidates
      .filter((delivery) => {
        const entry = input.schedules[delivery.id];
        return !entry || daySet.has(entry.date);
      })
      .map((delivery) => delivery.id),
  );
  const movable = candidates.filter((delivery) => movableIds.has(delivery.id));
  const originalScheduledIds = movable
    .filter((delivery) => !!input.schedules[delivery.id])
    .map((delivery) => delivery.id);
  const fixed = Object.fromEntries(
    Object.entries(input.schedules).filter(
      ([deliveryId]) => !movableIds.has(deliveryId),
    ),
  );

  let result = plan(
    movable,
    input.deliveries,
    fixed,
    days,
    shifts,
    today,
    currentMinutes,
  );

  // Em uma combinação rara de durações, a heurística gulosa pode fragmentar
  // a jornada. Nesse caso, preserva todos os blocos manuais já existentes e
  // usa apenas os espaços livres para novos cards.
  if (originalScheduledIds.some((deliveryId) => !result.schedule[deliveryId])) {
    const preserved = { ...fixed };
    for (const deliveryId of originalScheduledIds) {
      preserved[deliveryId] = input.schedules[deliveryId]!;
    }
    result = plan(
      movable.filter((delivery) => !input.schedules[delivery.id]),
      input.deliveries,
      preserved,
      days,
      shifts,
      today,
      currentMinutes,
    );
    result.scheduledIds.push(...originalScheduledIds);
  }

  const scheduledDeliveryIds = movable
    .filter((delivery) => !!result.schedule[delivery.id])
    .map((delivery) => delivery.id);
  const unscheduledDeliveryIds = movable
    .filter((delivery) => !result.schedule[delivery.id])
    .map((delivery) => delivery.id);
  const changedDeliveryIds = scheduledDeliveryIds.filter(
    (deliveryId) => !entriesEqual(input.schedules[deliveryId], result.schedule[deliveryId]),
  );

  return {
    schedule: result.schedule,
    changedDeliveryIds,
    scheduledDeliveryIds,
    unscheduledDeliveryIds,
  };
}
