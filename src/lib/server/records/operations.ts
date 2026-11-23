import { and, asc, desc, eq, isNull, lt, sql } from "drizzle-orm";
import type { Business } from "$lib/businesses/types";
import type { Project } from "$lib/projects/types";
import type { Delivery } from "$lib/deliveries/types";
import type { Database } from "$lib/server/db/database";
import { projects, deliveries } from "$lib/server/db/schema";

export type OperationalDelivery = {
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
  openDeliveries: number;
  completedDeliveries: number;
};

export type BusinessOperations = {
  metrics: {
    projects: number;
    openDeliveries: number;
    completedDeliveries: number;
    overdueDeliveries: number;
  };
  projects: OperationalProject[];
  deliveries: OperationalDelivery[];
};

export type ProjectOperations = {
  business: { id: string; name: string };
  metrics: {
    openDeliveries: number;
    completedDeliveries: number;
    overdueDeliveries: number;
  };
  deliveries: OperationalDelivery[];
};

export type ContractOperations = {
  business: { id: string; name: string };
  metrics: {
    projects: number;
    activeProjects: number;
    openDeliveries: number;
    overdueDeliveries: number;
  };
  projects: OperationalProject[];
  deliveries: OperationalDelivery[];
  firstPaymentOverdue: boolean;
};

export type DeliveryOperations = {
  project: { id: string; name: string };
  metrics: {
    tasks: number;
    completedTasks: number;
    remainingTasks: number;
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

async function deliveriesFor(
  database: Database,
  conditions: ReturnType<typeof and>,
  activeOnly = true,
): Promise<OperationalDelivery[]> {
  const rows = await database
    .select({
      id: deliveries.id,
      name: deliveries.name,
      projectId: deliveries.projectId,
      projectName: projects.name,
      status: deliveries.statusKey,
      priority: deliveries.priorityKey,
      dueDate: deliveries.dueDate,
      completedAt: deliveries.completedAt,
    })
    .from(deliveries)
    .innerJoin(
      projects,
      and(
        eq(projects.workspaceId, deliveries.workspaceId),
        eq(projects.id, deliveries.projectId),
        ...(activeOnly ? [eq(projects.isActive, true)] : []),
      ),
    )
    .where(conditions)
    .orderBy(
      asc(sql`case when ${deliveries.dueDate} is null then 1 else 0 end`),
      asc(deliveries.dueDate),
      desc(deliveries.updatedAt),
    )
    .limit(40);

  return rows.map((row) => ({
    ...row,
    completed: Boolean(row.completedAt),
  }));
}

function metrics(deliveries: OperationalDelivery[]) {
  const currentDay = today();
  return {
    openDeliveries: deliveries.filter(({ completed }) => !completed).length,
    completedDeliveries: deliveries.filter(({ completed }) => completed).length,
    overdueDeliveries: deliveries.filter(
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
  const deliveryRows = await deliveriesFor(
    database,
    and(
      eq(deliveries.workspaceId, business.workspaceId),
      eq(deliveries.businessId, business.id),
      isNull(deliveries.archivedAt),
    ),
  );
  const byProject = new Map<string, { open: number; completed: number }>();
  for (const delivery of deliveryRows) {
    const current = byProject.get(delivery.projectId) ?? { open: 0, completed: 0 };
    if (delivery.completed) current.completed += 1;
    else current.open += 1;
    byProject.set(delivery.projectId, current);
  }
  const deliveryMetrics = metrics(deliveryRows);

  return {
    metrics: { projects: projectRows.length, ...deliveryMetrics },
    projects: projectRows.map((project) => {
      const counts = byProject.get(project.id) ?? { open: 0, completed: 0 };
      return {
        ...project,
        openDeliveries: counts.open,
        completedDeliveries: counts.completed,
      };
    }),
    deliveries: deliveryRows,
  };
}

export async function getProjectOperations(
  database: Database,
  project: Project,
): Promise<ProjectOperations> {
  const deliveryRows = await deliveriesFor(
    database,
    and(
      eq(deliveries.workspaceId, project.workspaceId),
      eq(deliveries.projectId, project.id),
      isNull(deliveries.archivedAt),
    ),
    false,
  );
  return {
    business: { id: project.business.id, name: project.business.name },
    metrics: metrics(deliveryRows),
    deliveries: deliveryRows,
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
  const deliveryRows = await deliveriesFor(
    database,
    and(
      eq(deliveries.workspaceId, contract.workspaceId),
      eq(projects.contractId, contract.id),
      isNull(deliveries.archivedAt),
    ),
    false,
  );
  const byProject = new Map<string, { open: number; completed: number }>();
  for (const delivery of deliveryRows) {
    const current = byProject.get(delivery.projectId) ?? { open: 0, completed: 0 };
    if (delivery.completed) current.completed += 1;
    else current.open += 1;
    byProject.set(delivery.projectId, current);
  }
  const deliveryMetrics = metrics(deliveryRows);

  return {
    business: { id: contract.businessId, name: contract.businessName },
    metrics: {
      projects: projectRows.length,
      activeProjects: projectRows.filter(({ isActive }) => isActive).length,
      openDeliveries: deliveryMetrics.openDeliveries,
      overdueDeliveries: deliveryMetrics.overdueDeliveries,
    },
    projects: projectRows.map(({ isActive: _isActive, ...project }) => {
      const counts = byProject.get(project.id) ?? { open: 0, completed: 0 };
      return {
        ...project,
        openDeliveries: counts.open,
        completedDeliveries: counts.completed,
      };
    }),
    deliveries: deliveryRows,
    firstPaymentOverdue: Boolean(
      contract.firstDueDate && contract.firstDueDate < today(),
    ),
  };
}

export function getDeliveryOperations(delivery: Delivery): DeliveryOperations {
  const total = delivery.tasks.length;
  const completed = delivery.tasks.filter(
    (task) => task.status === "concluida",
  ).length;
  const remaining = total - completed;
  const currentDay = today();

  if (delivery.completedAt) {
    return {
      metrics: {
        tasks: total,
        completedTasks: completed,
        remainingTasks: remaining,
      },
      project: { id: delivery.project.id, name: delivery.project.name },
      nextAction: {
        tone: "complete",
        title: "Entrega concluída",
        description:
          "Revise o resultado final e registre qualquer aprendizado relevante.",
      },
    };
  }
  if (delivery.dueDate && delivery.dueDate < currentDay) {
    return {
      metrics: {
        tasks: total,
        completedTasks: completed,
        remainingTasks: remaining,
      },
      project: { id: delivery.project.id, name: delivery.project.name },
      nextAction: {
        tone: "urgent",
        title: "Prazo vencido",
        description:
          "Replaneje a entrega com o responsável e comunique o novo combinado.",
      },
    };
  }
  if (delivery.dueDate === currentDay) {
    return {
      metrics: {
        tasks: total,
        completedTasks: completed,
        remainingTasks: remaining,
      },
      project: { id: delivery.project.id, name: delivery.project.name },
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
        tasks: total,
        completedTasks: completed,
        remainingTasks: remaining,
      },
      project: { id: delivery.project.id, name: delivery.project.name },
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
      tasks: total,
      completedTasks: completed,
      remainingTasks: remaining,
    },
    project: { id: delivery.project.id, name: delivery.project.name },
    nextAction: {
      tone: "ready",
      title: "Defina o próximo avanço",
      description:
        "Use os comentários para alinhar responsáveis, prazo e critério de conclusão.",
    },
  };
}
