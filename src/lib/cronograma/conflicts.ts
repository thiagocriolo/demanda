import { MINUTES_PER_SLOT, minutesToTime } from "./date";
import { isSubtaskCompleted } from "../entities/subtasks";
import type { ScheduleEntry, ScheduleMap, ScheduleTask } from "./types";

export type ScheduleConflict = {
  task: ScheduleTask;
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

function typedResponsibleIds(task: ScheduleTask): string[] | null {
  if (task.responsibleUserIds === undefined) return null;
  try {
    const parsed = JSON.parse(task.responsibleUserIds) as unknown;
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
  task: ScheduleTask,
  candidate: ScheduleEntry,
  tasks: ScheduleTask[],
  schedule: ScheduleMap,
): ScheduleConflict | undefined {
  const taskById = new Map(tasks.map((item) => [item.id, item]));

  for (const [otherTaskId, otherSchedule] of Object.entries(schedule)) {
    if (
      otherTaskId === task.id ||
      !schedulesOverlap(candidate, otherSchedule)
    ) {
      continue;
    }
    const otherTask = taskById.get(otherTaskId);
    if (!otherTask) continue;

    const shared = sharedResponsibles(task, otherTask);
    if (shared.length) {
      return { task: otherTask, schedule: otherSchedule, responsibles: shared };
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
  return `Conflito de horário para ${names}: “${conflict.task.nome}” já ocupa ${minutesToTime(conflict.schedule.startMinutes)}–${minutesToTime(endMinutes)}.`;
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
  task: ScheduleTask,
  candidate: ScheduleEntry,
  tasks: ScheduleTask[],
  schedule: ScheduleMap,
): SequenceConflict | undefined {
  const siblings = tasks
    .filter((item) => item.taskId === task.taskId && item.id !== task.id)
    .sort((left, right) => left.sequence - right.sequence);

  for (const previous of siblings.filter(
    (item) => item.sequence < task.sequence,
  )) {
    const previousSchedule = schedule[previous.id];
    if (!previousSchedule && !isSubtaskCompleted(previous.status)) {
      return {
        related: previous,
        message: `“${task.nome}” só pode ser alocada depois que “${previous.nome}” for concluída ou programada.`,
      };
    }
    if (previousSchedule && !startsAfterEnd(candidate, previousSchedule)) {
      return {
        related: previous,
        message: `“${task.nome}” deve começar depois do término de “${previous.nome}”.`,
      };
    }
  }

  for (const next of siblings.filter((item) => item.sequence > task.sequence)) {
    const nextSchedule = schedule[next.id];
    if (nextSchedule && !startsAfterEnd(nextSchedule, candidate)) {
      return {
        related: next,
        message: `“${task.nome}” deve terminar antes do início de “${next.nome}”.`,
      };
    }
  }
}

/** Remove alocações legadas que quebram a sequência ou pulam uma etapa pendente. */
export function removeSequenceConflicts(
  tasks: ScheduleTask[],
  schedule: ScheduleMap,
): ScheduleMap {
  const result = { ...schedule };
  const ordered = [...tasks].sort(
    (left, right) =>
      left.taskId.localeCompare(right.taskId) || left.sequence - right.sequence,
  );

  const acceptedByTask = new Map<string, ScheduleEntry>();
  const blockedTasks = new Set<string>();
  for (const task of ordered) {
    const entry = result[task.id];
    if (!entry) {
      if (!isSubtaskCompleted(task.status)) blockedTasks.add(task.taskId);
      continue;
    }
    const previous = acceptedByTask.get(task.taskId);
    if (
      blockedTasks.has(task.taskId) ||
      (previous && !startsAfterEnd(entry, previous))
    ) {
      delete result[task.id];
      if (!isSubtaskCompleted(task.status)) blockedTasks.add(task.taskId);
      continue;
    }
    acceptedByTask.set(task.taskId, entry);
  }
  return result;
}

/**
 * Repara dados legados de forma determinística, mantendo o primeiro compromisso
 * de cada usuário e retirando da grade os compromissos conflitantes seguintes.
 */
export function removeScheduleConflicts(
  tasks: ScheduleTask[],
  schedule: ScheduleMap,
): ScheduleMap {
  const taskById = new Map(tasks.map((task) => [task.id, task]));
  const sorted = Object.entries(schedule).sort(
    ([leftId, left], [rightId, right]) =>
      left.date.localeCompare(right.date) ||
      left.startMinutes - right.startMinutes ||
      leftId.localeCompare(rightId),
  );
  const result: ScheduleMap = {};

  for (const [taskId, entry] of sorted) {
    const task = taskById.get(taskId);
    if (!task || !findScheduleConflict(task, entry, tasks, result)) {
      result[taskId] = entry;
    }
  }
  return result;
}
