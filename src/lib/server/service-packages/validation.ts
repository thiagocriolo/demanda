import { z } from "zod";
import { INSTITUTIONAL_PROJECT_NAME } from "../../projects/institutional";
import {
  MAX_SERVICE_PROJECTS,
  type ServiceDeliveryRecurrenceType,
  type ServiceDeliveryRecurrenceUnit,
  type ServicePackageMutationInput,
  type ServicePackageProjectInput,
} from "../../service-packages/types";

const priorityKeySchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9][a-z0-9_-]{0,63}$/u)
  .default("normal");

const taskInputSchema = z
  .object({
    id: z.string().uuid().optional(),
    name: z.string().trim().min(1).max(120),
    durationMinutes: z
      .number()
      .int()
      .min(30)
      .max(10_080)
      .refine((value) => value % 30 === 0, {
        message: "A duração da tarefa deve ser múltipla de 30 minutos.",
      }),
  })
  .strict();

const deliveryInputSchema = z
  .object({
    id: z.string().uuid().optional(),
    name: z.string().trim().min(1).max(140),
    description: z.string().trim().max(2_000).default(""),
    priority: priorityKeySchema,
    recurrenceType: z
      .enum(["one_off", "daily", "weekly", "monthly", "custom"])
      .default("one_off"),
    recurrenceUnit: z.enum(["week", "month"]).nullable().default(null),
    recurrenceDays: z.array(z.number().int().min(0).max(31)).max(31).default([]),
    tasks: z.array(taskInputSchema).max(30).default([]),
  })
  .strict();

const projectInputSchema = z
  .object({
    id: z.string().uuid().optional(),
    isInstitutional: z.boolean().default(false),
    name: z.string().trim().max(140).default(""),
    briefing: z.string().trim().max(2_000).default(""),
    projectType: z.enum(["one_off", "recurring"]).default("one_off"),
    durationDays: z.number().int().min(1).max(3_650).nullable().default(null),
    deliveries: z.array(deliveryInputSchema).max(100).default([]),
  })
  .strict();

export const servicePackageMutationSchema = z
  .object({
    name: z.string().trim().min(1).max(140),
    description: z.string().trim().max(2_000).default(""),
    icon: z.string().trim().min(1).max(80).default("package"),
    color: z.string().trim().min(1).max(32).default("blue"),
    amountCents: z
      .number()
      .int()
      .min(0)
      .max(Number.MAX_SAFE_INTEGER)
      .default(0),
    durationMonths: z.number().int().min(1).max(120).nullable().default(null),
    installmentCount: z.number().int().min(1).max(99).default(1),
    paymentMethod: z.string().trim().max(120).default(""),
    paymentTerms: z.string().trim().max(2_000).default(""),
    projects: z.array(projectInputSchema).max(MAX_SERVICE_PROJECTS).default([]),
  })
  .strict()
  .superRefine((value, ctx) => {
    const institutional = value.projects.filter((item) => item.isInstitutional);
    if (institutional.length > 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "O serviço pode ter apenas um projeto Institucional.",
        path: ["projects"],
      });
    }
    const explicitCount = value.projects.length - institutional.length;
    if (explicitCount + 1 > MAX_SERVICE_PROJECTS) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Um serviço pode ter no máximo ${MAX_SERVICE_PROJECTS} projetos.`,
        path: ["projects"],
      });
    }
    value.projects.forEach((project, index) => {
      if (!project.isInstitutional && !project.name.trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Informe o nome do projeto.",
          path: ["projects", index, "name"],
        });
      }
    });
  });

export const servicePackageListQuerySchema = z
  .object({
    archived: z.enum(["exclude", "include", "only"]).default("exclude"),
    query: z.string().trim().max(100).default(""),
  })
  .strict();

export const servicePackagePatchSchema = z
  .object({
    action: z.enum(["archive", "restore", "duplicate"]),
  })
  .strict();

const customContractProjectInputSchema = projectInputSchema
  .extend({
    responsibleUserId: z.string().uuid().optional(),
  })
  .strict()
  .superRefine((project, ctx) => {
    if (!project.isInstitutional && !project.name.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Informe o nome do projeto.",
        path: ["name"],
      });
    }
  });

export const contractServicePackageSelectionSchema = z
  .object({
    packageId: z.string().uuid(),
    responsibleUserId: z.string().uuid(),
    includedProjectIds: z
      .array(z.string().uuid())
      .max(MAX_SERVICE_PROJECTS)
      .optional(),
    projectResponsibleOverrides: z
      .record(z.string().uuid(), z.string().uuid())
      .optional(),
    customProjects: z
      .array(customContractProjectInputSchema)
      .max(MAX_SERVICE_PROJECTS)
      .optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (!value.customProjects) return;
    const institutionalCount = value.customProjects.filter(
      (project) => project.isInstitutional,
    ).length;
    if (institutionalCount > 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "O contrato pode ter apenas um projeto Institucional.",
        path: ["customProjects"],
      });
    }
  });

export function normalizeRecurrenceRule(
  projectType: "one_off" | "recurring",
  recurrenceType: ServiceDeliveryRecurrenceType,
  recurrenceUnit: ServiceDeliveryRecurrenceUnit | null,
  recurrenceDays: number[],
): {
  recurrenceType: ServiceDeliveryRecurrenceType;
  recurrenceUnit: ServiceDeliveryRecurrenceUnit | null;
  recurrenceDays: number[];
} {
  if (projectType !== "recurring") {
    return {
      recurrenceType: "one_off",
      recurrenceUnit: null,
      recurrenceDays: [],
    };
  }
  if (recurrenceType === "weekly") {
    return {
      recurrenceType: "weekly",
      recurrenceUnit: null,
      recurrenceDays: [0],
    };
  }
  if (recurrenceType === "monthly") {
    return {
      recurrenceType: "monthly",
      recurrenceUnit: null,
      recurrenceDays: [1],
    };
  }
  if (recurrenceType === "custom") {
    const unit: ServiceDeliveryRecurrenceUnit =
      recurrenceUnit === "month" ? "month" : "week";
    const maxDay = unit === "month" ? 31 : 6;
    const minDay = unit === "month" ? 1 : 0;
    const cleaned = Array.from(
      new Set(
        recurrenceDays.filter(
          (day) => Number.isInteger(day) && day >= minDay && day <= maxDay,
        ),
      ),
    ).sort((left, right) => left - right);
    return {
      recurrenceType: "custom",
      recurrenceUnit: unit,
      recurrenceDays: cleaned,
    };
  }
  return {
    recurrenceType,
    recurrenceUnit: null,
    recurrenceDays: [],
  };
}

/**
 * Guarantees that every service package always has its automatic Institutional
 * project as the first item (min 1, max 100 projects total) and normalizes
 * recurrence rules according to each project's own nature.
 */
export function normalizeServicePackageInput(
  input: z.infer<typeof servicePackageMutationSchema>,
): ServicePackageMutationInput {
  const existingInstitutional = input.projects.find(
    (project) => project.isInstitutional,
  );
  const explicitProjects = input.projects.filter(
    (project) => !project.isInstitutional,
  );

  const institutional: ServicePackageProjectInput = existingInstitutional
    ? {
        ...existingInstitutional,
        isInstitutional: true,
        name: INSTITUTIONAL_PROJECT_NAME,
        deliveries: existingInstitutional.deliveries.map((delivery) => ({
          ...delivery,
          ...normalizeRecurrenceRule(
            existingInstitutional.projectType,
            delivery.recurrenceType,
            delivery.recurrenceUnit,
            delivery.recurrenceDays,
          ),
        })),
      }
    : {
        isInstitutional: true,
        name: INSTITUTIONAL_PROJECT_NAME,
        briefing: "",
        projectType: "one_off",
        durationDays: null,
        deliveries: [],
      };

  const normalizedExplicit: ServicePackageProjectInput[] = explicitProjects.map(
    (project) => ({
      ...project,
      isInstitutional: false,
      name: project.name.trim(),
      briefing: project.briefing.trim(),
      deliveries: project.deliveries.map((delivery) => ({
        ...delivery,
        name: delivery.name.trim(),
        description: delivery.description.trim(),
        ...normalizeRecurrenceRule(
          project.projectType,
          delivery.recurrenceType,
          delivery.recurrenceUnit,
          delivery.recurrenceDays,
        ),
        tasks: delivery.tasks.map((task) => ({
          ...task,
          name: task.name.trim(),
        })),
      })),
    }),
  );

  return {
    ...input,
    name: input.name.trim(),
    description: input.description.trim(),
    paymentMethod: input.paymentMethod.trim(),
    paymentTerms: input.paymentTerms.trim(),
    projects: [institutional, ...normalizedExplicit],
  };
}
