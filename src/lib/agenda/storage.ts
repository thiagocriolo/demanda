import { isArchivedRecord } from "$lib/entities/storage";
import {
  isSubtaskCompleted,
  parseEntitySubtasks,
} from "$lib/entities/subtasks";
import type { EntityRecord } from "$lib/entities/types";
import {
  loadActiveWorkspaceId,
  loadWorkspaceUsers,
  type WorkspaceUser,
} from "$lib/workspaces/workspace-storage";
import { belongsToWorkspace } from "$lib/workspaces/project-scope";
import { resolveResponsibleUser } from "$lib/workspaces/responsible-user";
import { isIsoDate } from "./date-utils";
import type {
  AgendaItem,
  AgendaMode,
  AgendaPlacement,
  AgendaSnapshot,
  AgendaTone,
} from "./types";

const projectStatuses: Record<string, { label: string; tone: AgendaTone }> = {
  planejamento: { label: "Planejamento", tone: "gray" },
  andamento: { label: "Em andamento", tone: "blue" },
  execucao: { label: "Execução", tone: "blue" },
  pausado: { label: "Pausado", tone: "amber" },
  alteracao: { label: "Desdobramentos", tone: "amber" },
  concluido: { label: "Concluído", tone: "green" },
  arquivado: { label: "Arquivado", tone: "gray" },
};

const taskStatuses: Record<string, { label: string; tone: AgendaTone }> = {
  planejamento: { label: "Fila", tone: "gray" },
  fila: { label: "A fazer", tone: "blue" },
  conclusao: { label: "Feito", tone: "green" },
  pendente: { label: "Pendente", tone: "gray" },
  producao: { label: "Em produção", tone: "blue" },
  revisao: { label: "Em revisão", tone: "amber" },
  entregue: { label: "Entregue", tone: "green" },
};

function deliveryDate(mode: AgendaMode, record: EntityRecord): string | null {
  const value =
    mode === "projects"
      ? record.dataFim || record.delivery_date || record.prazo
      : record.dataEntrega ||
        record.data_entrega ||
        record.dueDate ||
        record.due_date ||
        record.data;
  return isIsoDate(value) ? value : null;
}

function placementFor(
  placements: Map<string, AgendaPlacement>,
  mode: AgendaMode,
  record: EntityRecord,
  index: number,
): AgendaPlacement {
  return (
    placements.get(record.id) ?? {
      id: record.id,
      date: deliveryDate(mode, record),
      order: index,
      durationMinutes: 60,
      version: 0,
    }
  );
}

function projectItem(
  record: EntityRecord,
  schedule: AgendaPlacement,
): AgendaItem {
  const status = projectStatuses[record.status] ?? projectStatuses.planejamento;
  return {
    id: record.id,
    mode: "projects",
    title: record.nome || "Projeto sem nome",
    date: schedule.date,
    order: schedule.order,
    version: schedule.version,
    status: record.status || "planejamento",
    statusLabel: status.label,
    tone: status.tone,
    client: record.negocio || record.cliente || "Sem negócio",
    relation: record.responsavel || record.servicos || "Sem responsável",
    responsible: record.responsavel || "",
    description:
      record.briefing || record.descricao || "Sem briefing cadastrado",
    durationMinutes: schedule.durationMinutes,
    priority: "normal",
    progress: 0,
    completed: 0,
    total: 0,
  };
}

function taskItem(
  record: EntityRecord,
  index: number,
  schedule: AgendaPlacement,
  workspaceUsers: WorkspaceUser[],
): AgendaItem {
  const status = taskStatuses[record.status] ?? taskStatuses.planejamento;
  const fallbackPriorities: AgendaItem["priority"][] = [
    "normal",
    "alta",
    "normal",
    "baixa",
    "urgente",
  ];
  const subtasks = parseEntitySubtasks(record);
  const completed = subtasks.filter(({ status }) =>
    isSubtaskCompleted(status),
  ).length;
  const responsibleUser = resolveResponsibleUser(record, workspaceUsers);
  return {
    id: record.id,
    mode: "tasks",
    title: record.nome || "Tarefa sem nome",
    date: schedule.date,
    order: schedule.order,
    version: schedule.version,
    status: record.status || "planejamento",
    statusLabel: status.label,
    tone: status.tone,
    client: record.negocio || "Sem negócio",
    relation: record.projeto || "Projeto não informado",
    responsible: record.responsavel || "",
    responsibleAvatarUrl: responsibleUser?.avatarUrl,
    description: record.descricao || "Tarefa planejada",
    durationMinutes:
      schedule.version > 0
        ? schedule.durationMinutes
        : Math.max(
            30,
            Math.round(Number(record.duracao || "1") * 60) ||
              30 + (index % 4) * 30,
          ),
    priority: (["baixa", "normal", "alta", "urgente"] as const).includes(
      record.prioridade as "baixa" | "normal" | "alta" | "urgente",
    )
      ? (record.prioridade as AgendaItem["priority"])
      : fallbackPriorities[index % fallbackPriorities.length],
    progress: subtasks.length
      ? Math.round((completed / subtasks.length) * 100)
      : 0,
    completed,
    total: subtasks.length,
  };
}

export function loadAgendaItems(
  projectRecords: EntityRecord[] = [],
  taskRecords: EntityRecord[] = [],
  snapshot?: AgendaSnapshot,
): Record<AgendaMode, AgendaItem[]> {
  const projectPlacements = new Map(
    (snapshot?.projects ?? []).map((item) => [item.id, item]),
  );
  const taskPlacements = new Map(
    (snapshot?.tasks ?? []).map((item) => [item.id, item]),
  );
  const activeWorkspaceId = loadActiveWorkspaceId();
  const workspaceUsers = loadWorkspaceUsers();
  const participatingProjects = projectRecords.filter(
    (record) => !isArchivedRecord(record),
  );
  const projects = participatingProjects.map((record, index) =>
    projectItem(
      record,
      placementFor(projectPlacements, "projects", record, index),
    ),
  );
  const tasks = taskRecords
    .filter((record) => {
      if (isArchivedRecord(record)) return false;
      const projectId = record.projetoId || record.project_id || "";
      const project = projectId
        ? participatingProjects.find((candidate) => candidate.id === projectId)
        : undefined;
      if (projectId && !project) return false;
      if (!project) return belongsToWorkspace(record, activeWorkspaceId);
      const projectWorkspaceId =
        record.projectWorkspaceId || record.project_workspace_id || "";
      return !projectWorkspaceId || projectWorkspaceId === project.workspaceId;
    })
    .map((record, index) =>
      taskItem(
        record,
        index,
        placementFor(taskPlacements, "tasks", record, index),
        workspaceUsers,
      ),
    );
  return { projects, tasks };
}
