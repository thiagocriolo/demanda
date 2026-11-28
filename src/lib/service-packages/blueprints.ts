import type { DeliveryTemplate, ServiceTemplate } from "$lib/settings/types";
import type { Project } from "$lib/projects/types";
import type {
  ServicePackageDeliveryInput,
  ServicePackageProjectInput,
} from "./types";

export function deliveryTemplateBlueprint(
  template: DeliveryTemplate,
): ServicePackageDeliveryInput {
  return {
    name: template.name,
    description: template.briefing,
    priority: template.priority || "normal",
    recurrenceType: "one_off",
    recurrenceUnit: null,
    recurrenceDays: [],
    tasks: template.tasks.map((task) => ({
      name: task.nome,
      durationMinutes: Math.round(Number(task.duracao.replace(",", ".")) * 60),
    })),
  };
}

export function projectTemplateBlueprint(
  template: ServiceTemplate,
  deliveries: DeliveryTemplate[],
): ServicePackageProjectInput {
  const recurring = /recorr|rotina/iu.test(template.contractType);
  return {
    isInstitutional: false,
    name: template.name,
    briefing: template.briefing,
    projectType: recurring ? "recurring" : "one_off",
    durationDays: template.duration ? Number(template.duration) : null,
    deliveries: template.deliveries.map((reference) => {
      const source = deliveries.find(({ id }) => id === reference.templateId);
      if (!source)
        throw new Error(
          `O modelo da entrega "${reference.name}" não está disponível.`,
        );
      const blueprint = deliveryTemplateBlueprint(source);
      return {
        ...blueprint,
        name: reference.name || source.name,
        recurrenceType: recurring
          ? (reference.frequency ?? "one_off")
          : "one_off",
        recurrenceUnit:
          recurring && reference.frequency === "custom"
            ? (reference.customUnit ?? "week")
            : null,
        recurrenceDays: recurring ? [...(reference.recurrenceDays ?? [])] : [],
      };
    }),
  };
}

/** Copies structure only: identity, execution dates, people and progress stay at the source. */
export function copyDeliveryBlueprint(
  source: ServicePackageDeliveryInput,
): ServicePackageDeliveryInput {
  return {
    name: source.name,
    description: source.description,
    priority: source.priority,
    recurrenceType: source.recurrenceType,
    recurrenceUnit: source.recurrenceUnit,
    recurrenceDays: [...source.recurrenceDays],
    tasks: source.tasks.map(({ name, durationMinutes }) => ({
      name,
      durationMinutes,
    })),
  };
}

export function copyProjectBlueprint(
  source: ServicePackageProjectInput,
): ServicePackageProjectInput {
  return {
    isInstitutional: false,
    name: source.name,
    briefing: source.briefing,
    projectType: source.projectType,
    durationDays: source.durationDays,
    deliveries: source.deliveries.map(copyDeliveryBlueprint),
  };
}

export function realProjectBlueprint(
  project: Project,
  deliveries: ServicePackageDeliveryInput[],
): ServicePackageProjectInput {
  const days = project.endDate
    ? (Date.parse(`${project.endDate}T00:00:00Z`) -
        Date.parse(`${project.startDate}T00:00:00Z`)) /
      86_400_000
    : 0;
  return {
    isInstitutional: false,
    name: project.name,
    briefing: project.briefing,
    projectType: project.isInstitutional ? "one_off" : project.contractType,
    durationDays:
      Number.isInteger(days) && days > 0 ? Math.min(3650, days) : null,
    deliveries: deliveries.map(copyDeliveryBlueprint),
  };
}
