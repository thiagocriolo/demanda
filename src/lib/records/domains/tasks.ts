import {
  listTasks,
  observeTasks,
  TaskApiError,
  taskToEntityRecord,
} from "../../tasks/client";
import type { TaskList } from "../../tasks/types";
import { resolveResponsibleUser } from "../../workspaces/responsible-user";
import type { RecordsDomain } from "../types";
import { archivedMode, baseCard, dynamicStatusFilterOptions } from "./common";

type TaskFacets = TaskList["facets"];

function taskSteps(serializedSubtasks: string): string {
  try {
    const subtasks = JSON.parse(serializedSubtasks || "[]") as Array<{
      status?: unknown;
    }>;
    if (!Array.isArray(subtasks)) return "0/0";
    const completed = subtasks.filter(({ status }) =>
      ["concluida", "concluido", "conclusao", "done", "completed"].includes(
        String(status ?? "").toLocaleLowerCase("pt-BR"),
      ),
    ).length;
    return `${completed}/${subtasks.length}`;
  } catch {
    return "0/0";
  }
}

export const taskRecordsDomain: RecordsDomain<TaskFacets> = {
  initialFacets: {
    all: 0,
    archived: 0,
    statuses: {},
    priorities: {},
    categories: {},
    projects: {},
  },

  async list(request) {
    const result = await listTasks({
      page: request.page,
      pageSize: request.pageSize,
      query: request.query,
      status:
        request.filter !== "todos" && request.filter !== "arquivado"
          ? request.filter
          : undefined,
      orderBy: request.orderBy,
      archived: archivedMode(request),
      includeInactiveProjects: true,
      signal: request.signal,
    });
    return { ...result, items: result.items.map(taskToEntityRecord) };
  },

  observe: observeTasks,

  errorMessage(cause) {
    return cause instanceof TaskApiError
      ? cause.message
      : "Não foi possível carregar as tarefas.";
  },

  filterOptions(config, facets) {
    return dynamicStatusFilterOptions(
      config,
      facets.statuses,
      facets.all,
      facets.archived,
      "Arquivadas",
    );
  },

  toCard(config, record, workspaceUsers) {
    const responsibleUser = resolveResponsibleUser(record, workspaceUsers);
    return {
      ...baseCard(config, record),
      primary: record.negocio || "Negócio não informado",
      secondary: record.projeto || "Projeto não informado",
      relation: record.categoria || record.descricao || "Tarefa planejada",
      responsible: record.responsavel || "Sem responsável",
      responsibleAvatarUrl: responsibleUser?.avatarUrl,
      steps: taskSteps(record.subtarefas),
    };
  },
};
