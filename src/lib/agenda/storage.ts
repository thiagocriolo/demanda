import { isArchivedRecord } from "$lib/entities/storage";
import {
  isTaskCompleted,
  parseEntityTasks,
} from "$lib/entities/tasks";
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

const deliveryStatuses: Record<string, { label: string; tone: AgendaTone }> = {
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
    workspaceId: record.workspaceId,
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

function deliveryItem(
  record: EntityRecord,
  index: number,
  schedule: AgendaPlacement,
  workspaceUsers: WorkspaceUser[],
): AgendaItem {
  const status = deliveryStatuses[record.status] ?? deliveryStatuses.planejamento;
  const fallbackPriorities: AgendaItem["priority"][] = [
    "normal",
    "alta",
    "normal",
    "baixa",
    "urgente",
  ];
  const tasks = parseEntityTasks(record);
  const completed = tasks.filter(({ status }) =>
    isTaskCompleted(status),
  ).length;
  const responsibleUser = resolveResponsibleUser(record, workspaceUsers);
  return {
    id: record.id,
    workspaceId: record.workspaceId,
    mode: "deliveries",
    title: record.nome || "Entrega sem nome",
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
    description: record.descricao || "Entrega planejada",
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
    progress: tasks.length
      ? Math.round((completed / tasks.length) * 100)
      : 0,
    completed,
    total: tasks.length,
  };
}

function isInstitutionalProjectRecord(record: EntityRecord): boolean {
  return (
    record.isInstitutional === "true" ||
    record.__projectInstitutional === "true"
  );
}

function isRecurringContractRecord(record: EntityRecord): boolean {
  const contractType = (
    record.contract_type ||
    record.contractType ||
    record.tipoContrato ||
    ""
  )
    .trim()
    .toLowerCase();
  return contractType === "recurring" || contractType === "recorrente";
}

export function loadAgendaItems(
  projectRecords: EntityRecord[] = [],
  deliveryRecords: EntityRecord[] = [],
  snapshot?: AgendaSnapshot,
): Record<AgendaMode, AgendaItem[]> {
  const projectPlacements = new Map(
    (snapshot?.projects ?? []).map((item) => [item.id, item]),
  );
  const deliveryPlacements = new Map(
    (snapshot?.deliveries ?? []).map((item) => [item.id, item]),
  );
  const activeWorkspaceId = loadActiveWorkspaceId();
  const workspaceUsers = loadWorkspaceUsers();
  const activeProjects = projectRecords.filter(
    (record) => !isArchivedRecord(record),
  );
  const participatingProjects = activeProjects.filter(
    (record) => !isInstitutionalProjectRecord(record),
  );
  const deliveryProjects = activeProjects.filter(
    (record) => !isRecurringContractRecord(record),
  );
  const projects = participatingProjects.map((record, index) =>
    projectItem(
      record,
      placementFor(projectPlacements, "projects", record, index),
    ),
  );
  const deliveries = deliveryRecords
    .filter((record) => {
      if (isArchivedRecord(record)) return false;
      const projectId = record.projetoId || record.project_id || "";
      const project = projectId
        ? deliveryProjects.find((candidate) => candidate.id === projectId)
        : undefined;
      if (projectId && !project) return false;
      if (!project) return belongsToWorkspace(record, activeWorkspaceId);
      const projectWorkspaceId =
        record.projectWorkspaceId || record.project_workspace_id || "";
      return !projectWorkspaceId || projectWorkspaceId === project.workspaceId;
    })
    .map((record, index) =>
      deliveryItem(
        record,
        index,
        placementFor(deliveryPlacements, "deliveries", record, index),
        workspaceUsers,
      ),
    );
  return { projects, deliveries };
}
