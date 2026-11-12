import type { ScheduleEntry, WeekDay } from "./types";

export const MINUTES_PER_SLOT = 30;
export const MIN_DURATION_SLOTS = 1;
export const MAX_DURATION_SLOTS = 16;

function localDate(year: number, month: number, day: number): Date {
  return new Date(year, month, day, 12, 0, 0, 0);
}

export function isoDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function parseIsoDate(value: string | null | undefined): Date | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split("-").map(Number);
  const parsed = localDate(year, month - 1, day);
  return isoDate(parsed) === value ? parsed : null;
}

export function startOfWeek(value = new Date()): Date {
  const date = localDate(
    value.getFullYear(),
    value.getMonth(),
    value.getDate(),
  );
  const weekday = date.getDay();
  const offset = weekday === 0 ? -6 : 1 - weekday;
  date.setDate(date.getDate() + offset);
  return date;
}

export function addDays(value: Date, amount: number): Date {
  const next = localDate(
    value.getFullYear(),
    value.getMonth(),
    value.getDate(),
  );
  next.setDate(next.getDate() + amount);
  return next;
}

export function resolveWeekStart(value: string | null, now = new Date()): Date {
  // A data na URL representa o primeiro dia efetivamente visível. Quando não
  // há uma data escolhida, a visualização inicial continua começando na segunda.
  return parseIsoDate(value) ?? startOfWeek(now);
}

export function buildWeekDays(
  weekStart: Date,
  now = new Date(),
  includeSaturday = true,
  count = includeSaturday ? 6 : 5,
): WeekDay[] {
  const full = [
    "Segunda-feira",
    "Terça-feira",
    "Quarta-feira",
    "Quinta-feira",
    "Sexta-feira",
    "Sábado",
  ];
  const medium = ["Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
  const short = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
  const todayIso = isoDate(now);

  return Array.from({ length: count }, (_, index) => {
    const date = addDays(weekStart, index);
    const iso = isoDate(date);
    const weekday = date.getDay();
    const labelIndex = weekday === 0 ? 0 : weekday - 1;
    return {
      index,
      date,
      iso,
      fullLabel: weekday === 0 ? "Domingo" : full[labelIndex]!,
      mediumLabel: weekday === 0 ? "Domingo" : medium[labelIndex]!,
      shortLabel: weekday === 0 ? "Dom" : short[labelIndex]!,
      dateLabel: `${String(date.getDate()).padStart(2, "0")}.${String(
        date.getMonth() + 1,
      ).padStart(2, "0")}`,
      isToday: iso === todayIso,
    };
  });
}

export function formatWeekLabel(
  weekStart: Date,
  includeSaturday = true,
): string {
  const end = addDays(weekStart, includeSaturday ? 5 : 4);
  const startLabel = weekStart.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
  });
  const endLabel = end.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
  });
  return `${startLabel} a ${endLabel}`;
}

export function minutesToTime(totalMinutes: number): string {
  const normalized = Math.max(0, Math.min(24 * 60, Math.round(totalMinutes)));
  const hours = Math.floor(normalized / 60);
  const minutes = normalized % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

export function timeToMinutes(value: string): number | null {
  if (!/^\d{2}:\d{2}$/.test(value)) return null;
  const [hours, minutes] = value.split(":").map(Number);
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
  return hours * 60 + minutes;
}

export function formatDuration(durationSlots: number): string {
  const totalMinutes = durationSlots * MINUTES_PER_SLOT;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return minutes === 0
    ? `${hours}h`
    : `${hours}h${String(minutes).padStart(2, "0")}`;
}

/** Traduz a altura acoplada à grade para um dos dez modelos visuais. */
export function scheduleCardLevel(durationSlots: number): number {
  const lines = Math.max(
    MIN_DURATION_SLOTS,
    Math.min(MAX_DURATION_SLOTS, Math.round(durationSlots)),
  );
  if (lines === 1) return 2;
  if (lines === 2) return 3;
  if (lines <= 4) return 4;
  return Math.min(10, lines);
}

export function layoutScheduleGroup<T extends { schedule: ScheduleEntry }>(
  items: T[],
): Array<T & { lane: number; laneCount: number }> {
  const sorted = [...items].sort((left, right) => {
    if (left.schedule.startMinutes !== right.schedule.startMinutes) {
      return left.schedule.startMinutes - right.schedule.startMinutes;
    }
    return left.schedule.durationSlots - right.schedule.durationSlots;
  });

  const result: Array<T & { lane: number; laneCount: number }> = [];
  let group: Array<T & { lane: number }> = [];
  let groupEnd = -1;

  const flush = () => {
    if (!group.length) return;
    const activeLaneEnds: Array<number | undefined> = [];
    let laneCount = 1;

    const laidOut = group.map((item) => {
      activeLaneEnds.forEach((end, lane) => {
        if (end !== undefined && end <= item.schedule.startMinutes) {
          activeLaneEnds[lane] = undefined;
        }
      });

      let lane = 0;
      while (activeLaneEnds[lane] !== undefined) lane += 1;
      const end =
        item.schedule.startMinutes +
        item.schedule.durationSlots * MINUTES_PER_SLOT;
      activeLaneEnds[lane] = end;
      laneCount = Math.max(laneCount, lane + 1);
      return { ...item, lane };
    });

    result.push(...laidOut.map((item) => ({ ...item, laneCount })));
    group = [];
    groupEnd = -1;
  };

  for (const item of sorted) {
    const end =
      item.schedule.startMinutes +
      item.schedule.durationSlots * MINUTES_PER_SLOT;
    if (group.length && item.schedule.startMinutes >= groupEnd) flush();
    group.push({ ...item, lane: 0 });
    groupEnd = Math.max(groupEnd, end);
  }
  flush();

  return result;
}
