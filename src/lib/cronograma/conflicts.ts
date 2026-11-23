import { MINUTES_PER_SLOT, minutesToTime } from "./date";
import { isTaskCompleted } from "../entities/tasks";
import type { ScheduleEntry, ScheduleMap, ScheduleTask } from "./types";

export type ScheduleConflict = {
  delivery: ScheduleTask;
  schedule: ScheduleEntry;
  responsibles: string[];
};

export type SequenceConflict = {
  related?: ScheduleTask;
  message: string;
};

function responsibleKey(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLocaleLowerCase("pt-BR");
}

/** Converte o campo textual em usuários comparáveis, inclusive equipes. */
export function splitResponsibles(value?: string): string[] {
  if (!value) return [];
  const unique = new Map<string, string>();
  for (const name of value.split(/\s*(?:,|;|\+|\be\b)\s*/iu)) {
    const displayName = name.replace(/\s+/g, " ").trim();
    const key = responsibleKey(displayName);
    if (key && !unique.has(key)) unique.set(key, displayName);
  }
  return [...unique.values()];
}

export function schedulesOverlap(
  left: ScheduleEntry,
  right: ScheduleEntry,
): boolean {
  if (left.date !== right.date) return false;
  const leftEnd = left.startMinutes + left.durationSlots * MINUTES_PER_SLOT;
  const rightEnd = right.startMinutes + right.durationSlots * MINUTES_PER_SLOT;
  return left.startMinutes < rightEnd && right.startMinutes < leftEnd;
}

function typedResponsibleIds(delivery: ScheduleTask): string[] | null {
  if (delivery.responsibleUserIds === undefined) return null;
  try {
    const parsed = JSON.parse(delivery.responsibleUserIds) as unknown;
    return Array.isArray(parsed) &&
      parsed.every((value) => typeof value === "string")
      ? [...new Set(parsed)]
      : null;
  } catch {
    return null;
  }
}

function sharedResponsibles(
  candidate: ScheduleTask,
  other: ScheduleTask,
): string[] {
  const candidateIds = typedResponsibleIds(candidate);
  const otherIds = typedResponsibleIds(other);
  if (candidateIds && otherIds) {
    const otherSet = new Set(otherIds);
    const labels = splitResponsibles(candidate.responsavel);
    return candidateIds.flatMap((id, index) =>
      otherSet.has(id) ? [labels[index] ?? "responsável"] : [],
    );
  }

  const candidateNames = splitResponsibles(candidate.responsavel);
  const candidateByKey = new Map(
    candidateNames.map((name) => [responsibleKey(name), name]),
  );
  return splitResponsibles(other.responsavel)
    .map(responsibleKey)
    .filter((key) => candidateByKey.has(key))
    .map((key) => candidateByKey.get(key) as string);
}

export function findScheduleConflict(
  delivery: ScheduleTask,
  candidate: ScheduleEntry,
  deliveries: ScheduleTask[],
  schedule: ScheduleMap,
): ScheduleConflict | undefined {
  const deliveryById = new Map(deliveries.map((item) => [item.id, item]));

  for (const [otherDeliveryId, otherSchedule] of Object.entries(schedule)) {
    if (
      otherDeliveryId === delivery.id ||
      !schedulesOverlap(candidate, otherSchedule)
    ) {
      continue;
    }
    const otherDelivery = deliveryById.get(otherDeliveryId);
    if (!otherDelivery) continue;

    const shared = sharedResponsibles(delivery, otherDelivery);
    if (shared.length) {
      return { delivery: otherDelivery, schedule: otherSchedule, responsibles: shared };
    }
  }
}

export function describeScheduleConflict(conflict: ScheduleConflict): string {
  const names = new Intl.ListFormat("pt-BR", {
    style: "long",
    type: "conjunction",
  }).format(conflict.responsibles);
  const endMinutes =
    conflict.schedule.startMinutes +
    conflict.schedule.durationSlots * MINUTES_PER_SLOT;
  return `Conflito de horário para ${names}: “${conflict.delivery.nome}” já ocupa ${minutesToTime(conflict.schedule.startMinutes)}–${minutesToTime(endMinutes)}.`;
}

function startsAfterEnd(
  candidate: ScheduleEntry,
  previous: ScheduleEntry,
): boolean {
  if (candidate.date !== previous.date) return candidate.date > previous.date;
  return (
    candidate.startMinutes >=
    previous.startMinutes + previous.durationSlots * MINUTES_PER_SLOT
  );
}

export function findSequenceConflict(
  delivery: ScheduleTask,
  candidate: ScheduleEntry,
  deliveries: ScheduleTask[],
  schedule: ScheduleMap,
): SequenceConflict | undefined {
  const siblings = deliveries
    .filter((item) => item.deliveryId === delivery.deliveryId && item.id !== delivery.id)
    .sort((left, right) => left.sequence - right.sequence);

  for (const previous of siblings.filter(
    (item) => item.sequence < delivery.sequence,
  )) {
    const previousSchedule = schedule[previous.id];
    if (!previousSchedule && !isTaskCompleted(previous.status)) {
      return {
        related: previous,
        message: `“${delivery.nome}” só pode ser alocada depois que “${previous.nome}” for concluída ou programada.`,
      };
    }
    if (previousSchedule && !startsAfterEnd(candidate, previousSchedule)) {
      return {
        related: previous,
        message: `“${delivery.nome}” deve começar depois do término de “${previous.nome}”.`,
      };
    }
  }

  for (const next of siblings.filter((item) => item.sequence > delivery.sequence)) {
    const nextSchedule = schedule[next.id];
    if (nextSchedule && !startsAfterEnd(nextSchedule, candidate)) {
      return {
        related: next,
        message: `“${delivery.nome}” deve terminar antes do início de “${next.nome}”.`,
      };
    }
  }
}

/** Remove alocações legadas que quebram a sequência ou pulam uma etapa pendente. */
export function removeSequenceConflicts(
  deliveries: ScheduleTask[],
  schedule: ScheduleMap,
): ScheduleMap {
  const result = { ...schedule };
  const ordered = [...deliveries].sort(
    (left, right) =>
      left.deliveryId.localeCompare(right.deliveryId) || left.sequence - right.sequence,
  );

  const acceptedByDelivery = new Map<string, ScheduleEntry>();
  const blockedDeliveries = new Set<string>();
  for (const delivery of ordered) {
    const entry = result[delivery.id];
    if (!entry) {
      if (!isTaskCompleted(delivery.status)) blockedDeliveries.add(delivery.deliveryId);
      continue;
    }
    const previous = acceptedByDelivery.get(delivery.deliveryId);
    if (
      blockedDeliveries.has(delivery.deliveryId) ||
      (previous && !startsAfterEnd(entry, previous))
    ) {
      delete result[delivery.id];
      if (!isTaskCompleted(delivery.status)) blockedDeliveries.add(delivery.deliveryId);
      continue;
    }
    acceptedByDelivery.set(delivery.deliveryId, entry);
  }
  return result;
}

/**
 * Repara dados legados de forma determinística, mantendo o primeiro compromisso
 * de cada usuário e retirando da grade os compromissos conflitantes seguintes.
 */
export function removeScheduleConflicts(
  deliveries: ScheduleTask[],
  schedule: ScheduleMap,
): ScheduleMap {
  const deliveryById = new Map(deliveries.map((delivery) => [delivery.id, delivery]));
  const sorted = Object.entries(schedule).sort(
    ([leftId, left], [rightId, right]) =>
      left.date.localeCompare(right.date) ||
      left.startMinutes - right.startMinutes ||
      leftId.localeCompare(rightId),
  );
  const result: ScheduleMap = {};

  for (const [deliveryId, entry] of sorted) {
    const delivery = deliveryById.get(deliveryId);
    if (!delivery || !findScheduleConflict(delivery, entry, deliveries, result)) {
      result[deliveryId] = entry;
    }
  }
  return result;
}
