import type { EntityRecord } from "$lib/entities/types";
import type { ScheduleEntry, ScheduleTask } from "$lib/cronograma/types";

export type ScheduledDashboardDelivery = {
  delivery: ScheduleTask;
  entry: ScheduleEntry;
};

export function localIso(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function weekBounds(date: Date): [string, string] {
  const start = new Date(date);
  const weekday = (start.getDay() + 6) % 7;
  start.setDate(start.getDate() - weekday);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  return [localIso(start), localIso(end)];
}

export function recordDate(
  record: EntityRecord,
  kind: "delivery" | "project",
): string {
  const candidates =
    kind === "delivery"
      ? [
          record.dataEntrega,
          record.data_entrega,
          record.dueDate,
          record.due_date,
          record.data,
        ]
      : [record.dataFim, record.delivery_date, record.prazo];
  return (
    candidates.find((value) => /^\d{4}-\d{2}-\d{2}$/.test(value ?? "")) ?? ""
  );
}

export function isComplete(record: EntityRecord): boolean {
  return ["conclusao", "concluido", "concluida", "entregue"].includes(
    (record.status ?? "").toLocaleLowerCase("pt-BR"),
  );
}

export function isScheduleComplete(task: ScheduleTask): boolean {
  return ["conclusao", "concluido", "concluida", "entregue"].includes(
    (task.status ?? "").toLocaleLowerCase("pt-BR"),
  );
}

export function scheduledIn(
  records: EntityRecord[],
  kind: "delivery" | "project",
  start: string,
  end = start,
): number {
  return records.filter((record) => {
    const date = recordDate(record, kind);
    return !isComplete(record) && date >= start && date <= end;
  }).length;
}

export function formatDuration(minutes: number): string {
  if (minutes <= 0) return "0 min";
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  if (!hours) return `${remainder} min`;
  return remainder ? `${hours}h ${remainder}min` : `${hours}h`;
}

export function timeFromMinutes(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return `${String(hours).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`;
}

export function buildSchedulePreview(
  scheduledDeliveries: ScheduledDashboardDelivery[],
  nowMinutes: number,
) {
  const currentSlotStart = Math.floor(nowMinutes / 30) * 30;
  return Array.from({ length: 5 }, (_, index) => {
    const startMinutes = currentSlotStart + (index - 2) * 30;
    const endMinutes = startMinutes + 30;
    const item = scheduledDeliveries.find(
      ({ entry }) =>
        startMinutes >= entry.startMinutes &&
        startMinutes < entry.startMinutes + entry.durationSlots * 30,
    );
    const complete = item ? isScheduleComplete(item.delivery) : false;
    const current = index === 2;
    const state = complete
      ? "done"
      : item
        ? current
          ? "current"
          : startMinutes < currentSlotStart
            ? "missed"
            : "planned"
        : "free";

    return {
      id: `${startMinutes}-${item?.delivery.id ?? "free"}`,
      time: `${timeFromMinutes((startMinutes + 1440) % 1440)}–${timeFromMinutes((endMinutes + 1440) % 1440)}`,
      current,
      state,
      title: item?.delivery.nome ?? "Livre",
      description: item
        ? [item.delivery.deliveryNome, item.delivery.projeto]
            .filter(Boolean)
            .join(" · ")
        : "",
    };
  });
}

export function workdayColor(halfHourSteps: number): string {
  const stops = [
    [46, 86, 255],
    [65, 169, 105],
    [234, 179, 8],
    [220, 38, 38],
  ] as const;
  const position = Math.min(48, Math.max(0, halfHourSteps)) / 16;
  const start = stops[Math.min(2, Math.floor(position))]!;
  const end = stops[Math.min(3, Math.ceil(position))]!;
  const progress = position - Math.floor(position);
  const channels = start.map((channel, index) =>
    Math.round(channel + (end[index]! - channel) * progress),
  );
  return `rgb(${channels.join(" ")})`;
}

export function workdayStyle(hours: number): string {
  const halfHourSteps = Math.min(48, Math.max(0, Math.round(hours * 2)));
  return `--workday-load: ${(halfHourSteps / 48) * 100}%; --workday-color: ${workdayColor(halfHourSteps)}`;
}
