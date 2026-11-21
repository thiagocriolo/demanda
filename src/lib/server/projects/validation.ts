import { z } from "zod";
import type {
  ProjectFromServiceInput,
  ProjectMutationInput,
  ServiceMutationInput,
} from "../../projects/types";
import { normalizeKey } from "../db/helpers";

const MAX_MONEY_CENTS = Number.MAX_SAFE_INTEGER;

const collapsedText = (maximum: number) =>
  z
    .string()
    .trim()
    .min(1)
    .max(maximum)
    .transform((value) => value.replace(/\s+/g, " "));

const optionalText = (maximum: number) =>
  z
    .string()
    .trim()
    .max(maximum)
    .transform((value) => value.replace(/\s+/g, " "));

const normalizedKey = z
  .string()
  .trim()
  .min(1)
  .max(128)
  .transform(normalizeKey)
  .pipe(z.string().regex(/^[a-z0-9][a-z0-9_-]{0,63}$/));

const lifecycleStatus = normalizedKey.refine((value) => value !== "arquivado", {
  message: "O status arquivado e reservado ao ciclo de arquivamento.",
});

function isRealIsoDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

const isoDate = z.string().refine(isRealIsoDate, {
  message: "Data invalida; use AAAA-MM-DD.",
});
const nullableIsoDate = z.union([isoDate, z.null()]);
const moneyCents = z.number().int().min(0).max(MAX_MONEY_CENTS).safe();

const uniqueUuidArray = (minimum: number, maximum: number) =>
  z
    .array(z.string().uuid())
    .min(minimum)
    .max(maximum)
    .superRefine((values, context) => {
      if (new Set(values).size !== values.length) {
        context.addIssue({
          code: "custom",
          message: "Identificadores duplicados nao sao permitidos.",
        });
      }
    });

export function normalizeProjectTagLabel(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

export function projectTagKey(value: string): string {
  return normalizeKey(normalizeProjectTagLabel(value));
}

const tagLabels = z
  .array(z.string().trim().min(1).max(64).transform(normalizeProjectTagLabel))
  .max(30)
  .superRefine((values, context) => {
    const keys = values.map(projectTagKey);
    keys.forEach((key, index) => {
      if (!/^[a-z0-9][a-z0-9_-]{0,63}$/u.test(key)) {
        context.addIssue({
          code: "custom",
          path: [index],
          message: "A tag precisa conter letras ou numeros.",
        });
      }
    });
    if (new Set(keys).size !== keys.length) {
      context.addIssue({
        code: "custom",
        message: "Tags duplicadas nao sao permitidas.",
      });
    }
  });

const installmentSchema = z
  .object({
    number: z.number().int().min(1).max(99),
    dueDate: isoDate,
    amountCents: moneyCents,
    status: lifecycleStatus.default("pending"),
  })
  .strict();

const projectMutationObject = z
  .object({
    name: collapsedText(140),
    /** Business is derived from the contract on the server. */
    businessId: z.string().uuid().optional(),
    contractId: z.string().uuid().optional(),
    serviceIds: uniqueUuidArray(0, 20),
    status: lifecycleStatus,
    startDate: isoDate,
    endDate: nullableIsoDate,
    engagementType: z.enum(["fee", "personal"]).default("personal"),
    briefing: z.string().trim().max(10_000),
    tagLabels,
    responsibleUserIds: uniqueUuidArray(0, 20).default([]),
    contractType: z.enum(["one_off", "recurring"]).default("one_off"),
    amountCents: moneyCents.default(0),
    firstDueDate: nullableIsoDate.default(null),
    paymentMethod: optionalText(120).default(""),
    paymentTerms: z.string().trim().max(2_000).default(""),
    financeNotes: z.string().trim().max(4_000).default(""),
    installments: z.array(installmentSchema).max(99).default([]),
  })
  .strict();

export const projectMutationSchema = projectMutationObject
  .superRefine((value, context) => {
    if (value.endDate && value.endDate < value.startDate) {
      context.addIssue({
        code: "custom",
        path: ["endDate"],
        message: "A data final nao pode ser anterior a data inicial.",
      });
    }
  })
  .transform((value): ProjectMutationInput => value);

export const projectActivationSchema = z
  .object({ isActive: z.boolean() })
  .strict();

export const projectFromServiceSchema = z
  .object({
    serviceId: z.string().uuid(),
    additionalServiceIds: uniqueUuidArray(0, 19).optional(),
    name: collapsedText(140),
    businessId: z.string().uuid().optional(),
    contractId: z.string().uuid().optional(),
    startDate: isoDate,
    endDate: nullableIsoDate.optional(),
    engagementType: z.enum(["fee", "personal"]).optional(),
    status: lifecycleStatus.optional(),
    briefing: z.string().trim().max(10_000).optional(),
    tagLabels: tagLabels.optional(),
    responsibleUserIds: uniqueUuidArray(0, 20).optional(),
    contractType: z.enum(["one_off", "recurring"]).optional(),
    amountCents: moneyCents.optional(),
    firstDueDate: nullableIsoDate.optional(),
    paymentMethod: optionalText(120).optional(),
    paymentTerms: z.string().trim().max(2_000).optional(),
    financeNotes: z.string().trim().max(4_000).optional(),
    installments: z.array(installmentSchema).max(99).optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.additionalServiceIds?.includes(value.serviceId)) {
      context.addIssue({
        code: "custom",
        path: ["additionalServiceIds"],
        message: "O servico de origem nao deve ser repetido.",
      });
    }
    if (value.endDate && value.endDate < value.startDate) {
      context.addIssue({
        code: "custom",
        path: ["endDate"],
        message: "A data final nao pode ser anterior a data inicial.",
      });
    }
  })
  .transform((value): ProjectFromServiceInput => value);

export const serviceMutationSchema = z
  .object({
    name: collapsedText(140),
    description: z.string().trim().max(2_000),
    icon: collapsedText(64),
    color: collapsedText(32),
    defaultStatus: lifecycleStatus,
    defaultDurationDays: z.number().int().min(1).max(3_650).nullable(),
    defaultBriefing: z.string().trim().max(10_000),
    tagLabels,
    responsibleUserIds: uniqueUuidArray(1, 20),
    defaultContractType: z.enum(["one_off", "recurring"]),
    defaultAmountCents: moneyCents,
    defaultInstallmentCount: z.number().int().min(1).max(99),
    defaultPaymentMethod: optionalText(120),
    defaultPaymentTerms: z.string().trim().max(2_000),
    defaultFinanceNotes: z.string().trim().max(4_000),
  })
  .strict()
  .transform((value): ServiceMutationInput => value);

export const projectListQuerySchema = z
  .object({
    workspaceId: z.string().uuid().optional(),
    page: z.coerce.number().int().min(1).max(100_000).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(25),
    query: z.string().trim().max(100).default(""),
    status: lifecycleStatus.optional(),
    businessId: z.string().uuid().optional(),
    serviceId: z.string().uuid().optional(),
    responsibleUserId: z.string().uuid().optional(),
    tagId: z.string().uuid().optional(),
    startFrom: isoDate.optional(),
    startTo: isoDate.optional(),
    endFrom: isoDate.optional(),
    endTo: isoDate.optional(),
    includeEmptyInstitutional: z
      .enum(["true", "false"])
      .transform((value) => value === "true")
      .default(false),
    includeInactive: z
      .enum(["true", "false"])
      .transform((value) => value === "true")
      .default(false),
    archived: z.enum(["exclude", "include", "only"]).default("exclude"),
    orderBy: z
      .enum(["updated", "name_asc", "name_desc", "start_asc", "end_asc"])
      .default("updated"),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.startFrom && value.startTo && value.startFrom > value.startTo) {
      context.addIssue({
        code: "custom",
        path: ["startTo"],
        message: "Intervalo inicial invalido.",
      });
    }
    if (value.endFrom && value.endTo && value.endFrom > value.endTo) {
      context.addIssue({
        code: "custom",
        path: ["endTo"],
        message: "Intervalo final invalido.",
      });
    }
  });

export const serviceListQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).max(100_000).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(25),
    query: z.string().trim().max(100).default(""),
    archived: z.enum(["exclude", "include", "only"]).default("exclude"),
    orderBy: z.enum(["updated", "name_asc", "name_desc"]).default("updated"),
  })
  .strict();

export type ProjectListQuery = z.infer<typeof projectListQuerySchema>;
export type ServiceListQuery = z.infer<typeof serviceListQuerySchema>;
