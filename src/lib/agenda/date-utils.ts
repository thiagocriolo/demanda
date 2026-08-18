import type { AgendaView } from "./types";

const DAY_MS = 86_400_000;

export function fromIso(value: string): Date {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day, 12);
}

export function toIso(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function isIsoDate(value: string | null | undefined): value is string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  return toIso(fromIso(value)) === value;
}

export function todayIso(): string {
  return toIso(new Date());
}

export function addDays(value: string, amount: number): string {
  const date = fromIso(value);
  date.setDate(date.getDate() + amount);
  return toIso(date);
}

export function addMonths(value: string, amount: number): string {
  const date = fromIso(value);
  date.setDate(1);
  date.setMonth(date.getMonth() + amount);
  return toIso(date);
}

export function startOfWeek(value: string): string {
  const date = fromIso(value);
  const offset = (date.getDay() + 6) % 7;
  date.setDate(date.getDate() - offset);
  return toIso(date);
}

export function startOfMonth(value: string): string {
  const date = fromIso(value);
  date.setDate(1);
  return toIso(date);
}

export function monthGridStart(value: string): string {
  return startOfWeek(startOfMonth(value));
}

export function daysBetween(start: string, end: string): number {
  return Math.round(
    (fromIso(end).getTime() - fromIso(start).getTime()) / DAY_MS,
  );
}

export function isSameMonth(left: string, right: string): boolean {
  return left.slice(0, 7) === right.slice(0, 7);
}

export function shiftCursor(
  value: string,
  view: AgendaView,
  direction: -1 | 1,
): string {
  if (view === "daily") return addDays(value, direction);
  if (view === "weekly") return addDays(startOfWeek(value), direction * 7);
  return addMonths(startOfMonth(value), direction);
}

const weekdayLong = new Intl.DateTimeFormat("pt-BR", { weekday: "long" });
const weekdayShort = new Intl.DateTimeFormat("pt-BR", { weekday: "short" });
const dayMonth = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "short",
});
const numericDate = new Intl.DateTimeFormat("pt-BR");
const monthYear = new Intl.DateTimeFormat("pt-BR", {
  month: "long",
  year: "numeric",
});

export function capitalize(value: string): string {
  return value
    ? value.charAt(0).toLocaleUpperCase("pt-BR") + value.slice(1)
    : "";
}

export function formatWeekday(value: string, short = false): string {
  return capitalize(
    (short ? weekdayShort : weekdayLong)
      .format(fromIso(value))
      .replace(".", ""),
  );
}

export function formatDayMonth(value: string): string {
  return capitalize(dayMonth.format(fromIso(value)).replace(".", ""));
}

export function formatDate(value: string): string {
  return numericDate.format(fromIso(value));
}

export function formatMonthYear(value: string): string {
  return capitalize(monthYear.format(fromIso(value)));
}

export function formatPeriod(value: string, view: AgendaView): string {
  if (view === "daily") return formatDate(value);
  if (view === "weekly") {
    const start = startOfWeek(value);
    const end = addDays(start, 6);
    return `${formatDayMonth(start)} — ${formatDayMonth(end)}`;
  }
  return formatMonthYear(value);
}
