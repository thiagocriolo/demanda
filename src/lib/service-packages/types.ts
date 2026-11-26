export type ServiceProjectNature = "one_off" | "recurring";

export type ServiceDeliveryRecurrenceType =
  | "one_off"
  | "daily"
  | "weekly"
  | "monthly"
  | "custom";

export type ServiceDeliveryRecurrenceUnit = "week" | "month";

export type ServicePackageTask = {
  id: string;
  name: string;
  durationMinutes: number;
  sortOrder: number;
};

export type ServicePackageDelivery = {
  id: string;
  name: string;
  description: string;
  priority: string;
  recurrenceType: ServiceDeliveryRecurrenceType;
  recurrenceUnit: ServiceDeliveryRecurrenceUnit | null;
  recurrenceDays: number[];
  sortOrder: number;
  tasks: ServicePackageTask[];
};

export type ServicePackageProject = {
  id: string;
  isInstitutional: boolean;
  name: string;
  briefing: string;
  projectType: ServiceProjectNature;
  durationDays: number | null;
  sortOrder: number;
  deliveries: ServicePackageDelivery[];
};

export type ServicePackageMetrics = {
  /** Total de projetos (incluindo o Institucional). Sempre >= 1. */
  totalProjects: number;
  /** Projetos explicitamente definidos pelo usuário (exclui o Institucional). */
  explicitProjects: number;
  /** Quantidade de projetos pontuais (entre os explícitos + institucional com entregas). */
  oneOffProjects: number;
  /** Quantidade de projetos recorrentes (entre os explícitos + institucional com entregas). */
  recurringProjects: number;
  /** Entregas diretamente no projeto Institucional. */
  institutionalDeliveries: number;
  /** Total de entregas em todo o pacote. */
  totalDeliveries: number;
  /** Total de tarefas em todo o pacote. */
  totalTasks: number;
  /** Soma das durações de todas as tarefas, em minutos. */
  totalMinutes: number;
  /** Valor implícito por hora (em centavos) quando há valor > 0 e horas > 0. */
  hourlyRateCents: number | null;
};

export type ServicePackage = {
  id: string;
  ownerUserId: string;
  name: string;
  description: string;
  icon: string;
  color: string;
  amountCents: number;
  durationMonths: number | null;
  installmentCount: number;
  paymentMethod: string;
  paymentTerms: string;
  sortOrder: number;
  projects: ServicePackageProject[];
  metrics: ServicePackageMetrics;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ServicePackageTaskInput = {
  id?: string;
  name: string;
  durationMinutes: number;
};

export type ServicePackageDeliveryInput = {
  id?: string;
  name: string;
  description: string;
  priority: string;
  recurrenceType: ServiceDeliveryRecurrenceType;
  recurrenceUnit: ServiceDeliveryRecurrenceUnit | null;
  recurrenceDays: number[];
  tasks: ServicePackageTaskInput[];
};

export type ServicePackageProjectInput = {
  id?: string;
  isInstitutional: boolean;
  name: string;
  briefing: string;
  projectType: ServiceProjectNature;
  durationDays: number | null;
  deliveries: ServicePackageDeliveryInput[];
};

export type ServicePackageMutationInput = {
  name: string;
  description: string;
  icon: string;
  color: string;
  amountCents: number;
  durationMonths: number | null;
  installmentCount: number;
  paymentMethod: string;
  paymentTerms: string;
  projects: ServicePackageProjectInput[];
};

export type ServicePackageList = {
  items: ServicePackage[];
  facets: {
    active: number;
    archived: number;
  };
};

export type CustomContractProjectInput = ServicePackageProjectInput & {
  /** Sobrescrita opcional de responsável para este projeto específico. */
  responsibleUserId?: string;
};

export type ContractServicePackageSelection = {
  packageId: string;
  responsibleUserId: string;
  /** IDs dos projetos do serviço incluídos nesta contratação. Se omitido, inclui todos. */
  includedProjectIds?: string[];
  /** Sobrescrita opcional de responsável por projeto do serviço. */
  projectResponsibleOverrides?: Record<string, string>;
  /** Escopo personalizado (projetos, entregas e tarefas editados no modal de contrato). */
  customProjects?: CustomContractProjectInput[];
};

export const MAX_SERVICE_PROJECTS = 100;
export const MAX_EXPLICIT_SERVICE_PROJECTS = 99;

export function summarizeServicePackage(
  projects: ReadonlyArray<{
    isInstitutional: boolean;
    projectType: ServiceProjectNature;
    deliveries: ReadonlyArray<{
      tasks: ReadonlyArray<{ durationMinutes: number }>;
    }>;
  }>,
  amountCents: number,
): ServicePackageMetrics {
  let explicitProjects = 0;
  let oneOffProjects = 0;
  let recurringProjects = 0;
  let institutionalDeliveries = 0;
  let totalDeliveries = 0;
  let totalTasks = 0;
  let totalMinutes = 0;

  for (const project of projects) {
    const deliveryCount = project.deliveries.length;
    if (project.isInstitutional) {
      institutionalDeliveries += deliveryCount;
      if (deliveryCount > 0) {
        oneOffProjects += 1;
      }
    } else {
      explicitProjects += 1;
      if (project.projectType === "recurring") recurringProjects += 1;
      else oneOffProjects += 1;
    }
    totalDeliveries += deliveryCount;
    for (const delivery of project.deliveries) {
      totalTasks += delivery.tasks.length;
      for (const task of delivery.tasks) {
        totalMinutes += task.durationMinutes;
      }
    }
  }

  const totalProjects = Math.max(1, projects.length);
  const hourlyRateCents =
    amountCents > 0 && totalMinutes > 0
      ? Math.round((amountCents * 60) / totalMinutes)
      : null;

  return {
    totalProjects,
    explicitProjects,
    oneOffProjects,
    recurringProjects,
    institutionalDeliveries,
    totalDeliveries,
    totalTasks,
    totalMinutes,
    hourlyRateCents,
  };
}

export function formatServiceMoney(cents: number): string {
  return (cents / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  });
}

export function formatServiceHours(minutes: number): string {
  if (!minutes || minutes <= 0) return "0h";
  const hours = minutes / 60;
  return Number.isInteger(hours)
    ? `${hours}h`
    : `${hours.toFixed(1).replace(".", ",")}h`;
}

export function formatRecurrenceLabel(
  recurrenceType: ServiceDeliveryRecurrenceType,
  recurrenceUnit: ServiceDeliveryRecurrenceUnit | null,
  recurrenceDays: number[],
): string {
  if (recurrenceType === "one_off") return "Única";
  if (recurrenceType === "daily") return "Diária";
  if (recurrenceType === "weekly") return "Semanal";
  if (recurrenceType === "monthly") return "Mensal";
  if (recurrenceUnit === "month") {
    return recurrenceDays.length
      ? `Mensal (${recurrenceDays.join(", ")})`
      : "Personalizada (mês)";
  }
  const labels = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
  return recurrenceDays.length
    ? recurrenceDays.map((day) => labels[day] ?? String(day)).join(", ")
    : "Personalizada (sem.)";
}
