import { isTaskCompleted, parseEntityTasks } from "../entities/tasks";
import type { EntityRecord } from "../entities/types";
import type { ScheduleMap, ScheduleTask } from "./types";

const GLOBAL_WORKSPACE_ID = "global";

export function isCronogramaTaskFromSelectedWorkspace(
  delivery: ScheduleTask,
  workspaceId: string,
): boolean {
  return (
    workspaceId === GLOBAL_WORKSPACE_ID ||
    (delivery.workspaceId ?? "personal") === workspaceId
  );
}

export function isCronogramaTaskMuted(
  delivery: ScheduleTask,
  workspaceId: string,
): boolean {
  return !isCronogramaTaskFromSelectedWorkspace(delivery, workspaceId);
}

export function toScheduleTasks(records: EntityRecord[]): ScheduleTask[] {
  return records.flatMap((record) => {
    const tasks = parseEntityTasks(record);
    return tasks.map((task) => ({
      ...record,
      id: task.id,
      deliveryId: record.id,
      deliveryNome: record.nome || "Entrega sem nome",
      taskId: task.id,
      sequence: task.sequence,
      taskCount: tasks.length,
      nome: task.nome,
      duracao: task.duracao,
      negocio: record.negocio || record.business_name || "",
      status: task.status,
      deliveryStatus: record.status,
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

/** Every pending task without an execution block belongs in the drawer. */
export function nextUnscheduledTasks(
  tasks: ScheduleTask[],
  schedule: ScheduleMap,
): ScheduleTask[] {
  return tasks
    .filter((delivery) => !isTaskCompleted(delivery.status) && !schedule[delivery.id])
    .sort(
      (left, right) =>
        left.deliveryId.localeCompare(right.deliveryId) ||
        left.sequence - right.sequence,
    );
}

/** A gaveta respeita o workspace selecionado; a grade usa a lista completa. */
export function nextUnscheduledTasksForWorkspace(
  tasks: ScheduleTask[],
  schedule: ScheduleMap,
  workspaceId: string,
): ScheduleTask[] {
  return nextUnscheduledTasks(
    tasks.filter((delivery) =>
      isCronogramaTaskFromSelectedWorkspace(delivery, workspaceId),
    ),
    schedule,
  );
}
