import { isSubtaskCompleted, parseEntitySubtasks } from "../entities/subtasks";
import type { EntityRecord } from "../entities/types";
import type { ScheduleMap, ScheduleTask } from "./types";

const GLOBAL_WORKSPACE_ID = "global";

export function isCronogramaTaskFromSelectedWorkspace(
  task: ScheduleTask,
  workspaceId: string,
): boolean {
  return (
    workspaceId === GLOBAL_WORKSPACE_ID ||
    (task.workspaceId ?? "personal") === workspaceId
  );
}

export function isCronogramaTaskMuted(
  task: ScheduleTask,
  workspaceId: string,
): boolean {
  return !isCronogramaTaskFromSelectedWorkspace(task, workspaceId);
}

export function toScheduleSubtasks(records: EntityRecord[]): ScheduleTask[] {
  return records.flatMap((record) => {
    const subtasks = parseEntitySubtasks(record);
    return subtasks.map((subtask) => ({
      ...record,
      id: subtask.id,
      taskId: record.id,
      taskNome: record.nome || "Tarefa sem nome",
      subtaskId: subtask.id,
      sequence: subtask.sequence,
      subtaskCount: subtasks.length,
      nome: subtask.nome,
      duracao: subtask.duracao,
      status: subtask.status,
      taskStatus: record.status,
      priority: record.prioridade || record.priority || "normal",
      requestedDate:
        record.dataSolicitacao ||
        record.data_solicitacao ||
        record.requestedDate ||
        record.requested_date ||
        record.createdAt,
      dueDate:
        record.dataEntrega ||
        record.data_entrega ||
        record.dueDate ||
        record.due_date,
    }));
  });
}

/** Retorna somente a primeira subtarefa pendente e ainda não alocada de cada tarefa. */
export function nextUnscheduledSubtasks(
  subtasks: ScheduleTask[],
  schedule: ScheduleMap,
): ScheduleTask[] {
  const byTask = new Map<string, ScheduleTask[]>();
  for (const subtask of subtasks) {
    const group = byTask.get(subtask.taskId) ?? [];
    group.push(subtask);
    byTask.set(subtask.taskId, group);
  }

  return [...byTask.values()].flatMap((group) => {
    const next = group
      .sort((left, right) => left.sequence - right.sequence)
      .find(
        (subtask) =>
          !isSubtaskCompleted(subtask.status) && !schedule[subtask.id],
      );
    return next ? [next] : [];
  });
}

/** A gaveta respeita o workspace selecionado; a grade usa a lista completa. */
export function nextUnscheduledSubtasksForWorkspace(
  subtasks: ScheduleTask[],
  schedule: ScheduleMap,
  workspaceId: string,
): ScheduleTask[] {
  return nextUnscheduledSubtasks(
    subtasks.filter((task) =>
      isCronogramaTaskFromSelectedWorkspace(task, workspaceId),
    ),
    schedule,
  );
}
