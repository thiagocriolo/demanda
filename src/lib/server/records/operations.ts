import { and, asc, desc, eq, isNull, lt, sql } from "drizzle-orm";
import type { Business } from "$lib/businesses/types";
import type { Project } from "$lib/projects/types";
import type { Task } from "$lib/tasks/types";
import type { Database } from "$lib/server/db/database";
import { projects, tasks } from "$lib/server/db/schema";

export type OperationalTask = {
  id: string;
  name: string;
  projectId: string;
  projectName: string;
  status: string;
  priority: string;
  dueDate: string | null;
  completed: boolean;
};

export type OperationalProject = {
  id: string;
  name: string;
  status: string;
  endDate: string | null;
  openTasks: number;
  completedTasks: number;
};

export type BusinessOperations = {
  metrics: {
    projects: number;
    openTasks: number;
    completedTasks: number;
    overdueTasks: number;
  };
  projects: OperationalProject[];
  tasks: OperationalTask[];
};

export type ProjectOperations = {
  business: { id: string; name: string };
  metrics: {
    openTasks: number;
    completedTasks: number;
    overdueTasks: number;
  };
  tasks: OperationalTask[];
};

export type ContractOperations = {
  business: { id: string; name: string };
  metrics: {
    projects: number;
    activeProjects: number;
    openTasks: number;
    overdueTasks: number;
  };
  projects: OperationalProject[];
  tasks: OperationalTask[];
  firstPaymentOverdue: boolean;
};

export type TaskOperations = {
  project: { id: string; name: string };
  metrics: {
    subtasks: number;
    completedSubtasks: number;
    remainingSubtasks: number;
  };
  nextAction: {
    title: string;
    description: string;
    tone: "urgent" | "attention" | "ready" | "complete";
  };
};

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

async function tasksFor(
  database: Database,
  conditions: ReturnType<typeof and>,
  activeOnly = true,
): Promise<OperationalTask[]> {
  const rows = await database
    .select({
      id: tasks.id,
      name: tasks.name,
      projectId: tasks.projectId,
      projectName: projects.name,
      status: tasks.statusKey,
      priority: tasks.priorityKey,
      dueDate: tasks.dueDate,
      completedAt: tasks.completedAt,
    })
    .from(tasks)
    .innerJoin(
      projects,
      and(
        eq(projects.workspaceId, tasks.workspaceId),
        eq(projects.id, tasks.projectId),
        ...(activeOnly ? [eq(projects.isActive, true)] : []),
      ),
    )
    .where(conditions)
    .orderBy(
      asc(sql`case when ${tasks.dueDate} is null then 1 else 0 end`),
      asc(tasks.dueDate),
      desc(tasks.updatedAt),
    )
    .limit(40);

  return rows.map((row) => ({
    ...row,
    completed: Boolean(row.completedAt),
  }));
}

function metrics(tasks: OperationalTask[]) {
  const currentDay = today();
  return {
    openTasks: tasks.filter(({ completed }) => !completed).length,
    completedTasks: tasks.filter(({ completed }) => completed).length,
    overdueTasks: tasks.filter(
      ({ completed, dueDate }) =>
        !completed && Boolean(dueDate && dueDate < currentDay),
    ).length,
  };
}

export async function getBusinessOperations(
  database: Database,
  business: Business,
): Promise<BusinessOperations> {
  const projectRows = await database
    .select({
      id: projects.id,
      name: projects.name,
      status: projects.statusKey,
      endDate: projects.endDate,
    })
    .from(projects)
    .where(
      and(
        eq(projects.workspaceId, business.workspaceId),
        eq(projects.businessId, business.id),
        eq(projects.isActive, true),
        isNull(projects.archivedAt),
      ),
    )
    .orderBy(
      asc(sql`case when ${projects.endDate} is null then 1 else 0 end`),
      asc(projects.endDate),
      desc(projects.updatedAt),
    )
    .limit(30);
  const taskRows = await tasksFor(
    database,
    and(
      eq(tasks.workspaceId, business.workspaceId),
      eq(tasks.businessId, business.id),
      isNull(tasks.archivedAt),
    ),
  );
  const byProject = new Map<string, { open: number; completed: number }>();
  for (const task of taskRows) {
    const current = byProject.get(task.projectId) ?? { open: 0, completed: 0 };
    if (task.completed) current.completed += 1;
    else current.open += 1;
    byProject.set(task.projectId, current);
  }
  const taskMetrics = metrics(taskRows);

  return {
    metrics: { projects: projectRows.length, ...taskMetrics },
    projects: projectRows.map((project) => {
      const counts = byProject.get(project.id) ?? { open: 0, completed: 0 };
      return {
        ...project,
        openTasks: counts.open,
        completedTasks: counts.completed,
      };
    }),
    tasks: taskRows,
  };
}

export async function getProjectOperations(
  database: Database,
  project: Project,
): Promise<ProjectOperations> {
  const taskRows = await tasksFor(
    database,
    and(
      eq(tasks.workspaceId, project.workspaceId),
      eq(tasks.projectId, project.id),
      isNull(tasks.archivedAt),
    ),
    false,
  );
  return {
    business: { id: project.business.id, name: project.business.name },
    metrics: metrics(taskRows),
    tasks: taskRows,
  };
}

/**
 * Commercial agreements can fund several projects. Keep this read model here
 * so the contract page presents the same operational vocabulary as business
 * and project pages without duplicating workspace-scoped queries in routes.
 */
export async function getContractOperations(
  database: Database,
  contract: {
    id: string;
    workspaceId: string;
    businessId: string;
    businessName: string;
    firstDueDate: string | null;
  },
): Promise<ContractOperations> {
  const projectRows = await database
    .select({
      id: projects.id,
      name: projects.name,
      status: projects.statusKey,
      endDate: projects.endDate,
      isActive: projects.isActive,
    })
    .from(projects)
    .where(
      and(
        eq(projects.workspaceId, contract.workspaceId),
        eq(projects.contractId, contract.id),
        isNull(projects.archivedAt),
      ),
    )
    .orderBy(
      asc(sql`case when ${projects.endDate} is null then 1 else 0 end`),
      asc(projects.endDate),
      desc(projects.updatedAt),
    )
    .limit(30);
  const taskRows = await tasksFor(
    database,
    and(
      eq(tasks.workspaceId, contract.workspaceId),
      eq(projects.contractId, contract.id),
      isNull(tasks.archivedAt),
    ),
    false,
  );
  const byProject = new Map<string, { open: number; completed: number }>();
  for (const task of taskRows) {
    const current = byProject.get(task.projectId) ?? { open: 0, completed: 0 };
    if (task.completed) current.completed += 1;
    else current.open += 1;
    byProject.set(task.projectId, current);
  }
  const taskMetrics = metrics(taskRows);

  return {
    business: { id: contract.businessId, name: contract.businessName },
    metrics: {
      projects: projectRows.length,
      activeProjects: projectRows.filter(({ isActive }) => isActive).length,
      openTasks: taskMetrics.openTasks,
      overdueTasks: taskMetrics.overdueTasks,
    },
    projects: projectRows.map(({ isActive: _isActive, ...project }) => {
      const counts = byProject.get(project.id) ?? { open: 0, completed: 0 };
      return {
        ...project,
        openTasks: counts.open,
        completedTasks: counts.completed,
      };
    }),
    tasks: taskRows,
    firstPaymentOverdue: Boolean(
      contract.firstDueDate && contract.firstDueDate < today(),
    ),
  };
}

export function getTaskOperations(task: Task): TaskOperations {
  const total = task.subtasks.length;
  const completed = task.subtasks.filter(
    (subtask) => subtask.status === "concluida",
  ).length;
  const remaining = total - completed;
  const currentDay = today();

  if (task.completedAt) {
    return {
      metrics: {
        subtasks: total,
        completedSubtasks: completed,
        remainingSubtasks: remaining,
      },
      project: { id: task.project.id, name: task.project.name },
      nextAction: {
        tone: "complete",
        title: "Entrega concluída",
        description:
          "Revise o resultado final e registre qualquer aprendizado relevante.",
      },
    };
  }
  if (task.dueDate && task.dueDate < currentDay) {
    return {
      metrics: {
        subtasks: total,
        completedSubtasks: completed,
        remainingSubtasks: remaining,
      },
      project: { id: task.project.id, name: task.project.name },
      nextAction: {
        tone: "urgent",
        title: "Prazo vencido",
        description:
          "Replaneje a entrega com o responsável e comunique o novo combinado.",
      },
    };
  }
  if (task.dueDate === currentDay) {
    return {
      metrics: {
        subtasks: total,
        completedSubtasks: completed,
        remainingSubtasks: remaining,
      },
      project: { id: task.project.id, name: task.project.name },
      nextAction: {
        tone: "attention",
        title: "Entrega para hoje",
        description: "Confirme o que falta concluir antes de encerrar o dia.",
      },
    };
  }
  if (remaining > 0) {
    return {
      metrics: {
        subtasks: total,
        completedSubtasks: completed,
        remainingSubtasks: remaining,
      },
      project: { id: task.project.id, name: task.project.name },
      nextAction: {
        tone: "ready",
        title: `${remaining} etapa${remaining === 1 ? "" : "s"} pendente${remaining === 1 ? "" : "s"}`,
        description:
          "Avance na próxima etapa para manter a entrega no ritmo planejado.",
      },
    };
  }
  return {
    metrics: {
      subtasks: total,
      completedSubtasks: completed,
      remainingSubtasks: remaining,
    },
    project: { id: task.project.id, name: task.project.name },
    nextAction: {
      tone: "ready",
      title: "Defina o próximo avanço",
      description:
        "Use os comentários para alinhar responsáveis, prazo e critério de conclusão.",
    },
  };
}
