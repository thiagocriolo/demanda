import { z } from "zod";
import { normalizeKey } from "../db/helpers";
import type {
  DeliveryBoardInput,
  DeliveryCreateInput,
  DeliveryStateInput,
  DeliveryTaskMutationInput,
  DeliveryTaskStateInput,
  DeliveryUpdateInput,
} from "./types";
import { TASK_COMPLETED_STATUS, TASK_PENDING_STATUS } from "./types";

const collapsedText = (maximum: number) =>
  z
    .string()
    .trim()
    .min(1)
    .max(maximum)
    .transform((value) => value.replace(/\s+/g, " "));

const normalizedKey = z
  .string()
  .trim()
  .min(1)
  .max(128)
  .transform(normalizeKey)
  .pipe(z.string().regex(/^[a-z0-9][a-z0-9_-]{0,63}$/u));

const lifecycleStatus = normalizedKey.refine((value) => value !== "arquivado", {
  message: "O status arquivado é reservado ao ciclo de arquivamento.",
});

const optionalNormalizedKey = z
  .string()
  .trim()
  .max(128)
  .transform((value) => (value ? normalizeKey(value) : ""))
  .pipe(z.string().regex(/^(?:[a-z0-9][a-z0-9_-]{0,63})?$/u));

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
  message: "Data inválida; use AAAA-MM-DD.",
});
const nullableExecutionAt = z
  .union([z.string().datetime({ offset: true }), z.null()])
  .transform((value) => (value ? new Date(value).toISOString() : null));

const version = z.number().int().min(1).max(2_147_483_646);

const uniqueUuidArray = (maximum: number) =>
  z
    .array(z.string().uuid())
    .max(maximum)
    .superRefine((values, context) => {
      if (new Set(values).size !== values.length) {
        context.addIssue({
          code: "custom",
          message: "Identificadores duplicados não são permitidos.",
        });
      }
    });

export function normalizeDeliveryTagLabel(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

export function deliveryTagKey(value: string): string {
  return normalizeKey(normalizeDeliveryTagLabel(value));
}

const tagLabels = z
  .array(z.string().trim().min(1).max(64).transform(normalizeDeliveryTagLabel))
  .max(30)
  .superRefine((values, context) => {
    const keys = values.map(deliveryTagKey);
    keys.forEach((key, index) => {
      if (!/^[a-z0-9][a-z0-9_-]{0,63}$/u.test(key)) {
        context.addIssue({
          code: "custom",
          path: [index],
          message: "A tag precisa conter letras ou números.",
        });
      }
    });
    if (new Set(keys).size !== keys.length) {
      context.addIssue({
        code: "custom",
        message: "Tags duplicadas não são permitidas.",
      });
    }
  });

const taskStatus = z.enum([
  TASK_PENDING_STATUS,
  TASK_COMPLETED_STATUS,
]);

const taskBase = z
  .object({
    name: collapsedText(120),
    durationMinutes: z
      .number()
      .int()
      .min(30)
      .max(10_080)
      .refine((value) => value % 30 === 0, {
        message: "A duração precisa usar intervalos de 30 minutos.",
      }),
    executionAt: nullableExecutionAt.default(null),
    status: taskStatus,
  })
  .strict();

const createTask = taskBase.transform(
  (value): DeliveryTaskMutationInput => value,
);

const updateTask = taskBase
  .extend({ id: z.string().uuid().optional() })
  .strict()
  .transform((value): DeliveryTaskMutationInput => value);

const contentShape = {
  name: collapsedText(140),
  projectId: z.string().uuid().optional(),
  recurrence: z.enum(["daily", "weekly", "monthly"]).optional(),
  category: optionalNormalizedKey,
  priority: normalizedKey,
  briefing: z.string().trim().max(10_000),
  dueDate: z.union([isoDate, z.null()]),
  engagementType: z.enum(["fee", "personal"]).default("personal"),
  tagLabels,
  responsibleUserIds: uniqueUuidArray(1).length(1, {
    message: "A tarefa deve ter exatamente um responsavel.",
  }),
  sortOrder: z.number().int().min(0).max(2_147_483_647).optional(),
  boardOrder: z
    .object({
      status: z.number().int().min(0).max(999_999_999).optional(),
      priority: z.number().int().min(0).max(999_999_999).optional(),
      business: z.number().int().min(0).max(999_999_999).optional(),
      project: z.number().int().min(0).max(999_999_999).optional(),
    })
    .strict()
    .optional(),
};

function validateTasks(
  tasks: DeliveryTaskMutationInput[],
  context: z.RefinementCtx,
): void {
  const ids = tasks.flatMap(({ id }) => (id ? [id] : []));
  if (new Set(ids).size !== ids.length) {
    context.addIssue({
      code: "custom",
      path: ["tasks"],
      message: "Tarefas duplicadas não são permitidas.",
    });
  }
}

export const deliveryCreateSchema = z
  .object({
    ...contentShape,
    institutionalContractId: z.string().uuid().optional(),
    status: lifecycleStatus,
    tasks: z.array(createTask).min(1).max(10),
  })
  .strict()
  .superRefine((value, context) => {
    if (Boolean(value.projectId) === Boolean(value.institutionalContractId)) {
      context.addIssue({ code: "custom", path: ["projectId"], message: "Selecione um projeto." });
    }
    if (value.boardOrder && Object.keys(value.boardOrder).length > 0) {
      context.addIssue({
        code: "custom",
        path: ["boardOrder"],
        message: "A posição da pauta só pode ser definida pela rota de lote.",
      });
    }
  })
  .transform((value): DeliveryCreateInput => value);

export const deliveryUpdateSchema = z
  .object({
    ...contentShape,
    version,
    status: lifecycleStatus,
    tasks: z.array(updateTask).min(1).max(10),
  })
  .strict()
  .superRefine((value, context) => {
    validateTasks(value.tasks, context);
    if (!value.projectId) {
      context.addIssue({ code: "custom", path: ["projectId"], message: "Selecione um projeto." });
    }
  })
  .transform((value): DeliveryUpdateInput => value);

const boardUpdateShape = {
  id: z.string().uuid(),
  version,
  position: z.number().int().min(0).max(999_999_999),
};

const deliveryBoardRawSchema = z.discriminatedUnion("view", [
  z
    .object({
      view: z.literal("status"),
      updates: z
        .array(
          z
            .object({ ...boardUpdateShape, columnKey: lifecycleStatus })
            .strict(),
        )
        .min(1)
        .max(500),
    })
    .strict(),
  z
    .object({
      view: z.literal("priority"),
      updates: z
        .array(
          z.object({ ...boardUpdateShape, columnKey: normalizedKey }).strict(),
        )
        .min(1)
        .max(500),
    })
    .strict(),
  z
    .object({
      view: z.literal("business"),
      updates: z
        .array(
          z
            .object({ ...boardUpdateShape, columnKey: z.string().uuid() })
            .strict(),
        )
        .min(1)
        .max(500),
    })
    .strict(),
  z
    .object({
      view: z.literal("project"),
      updates: z
        .array(
          z
            .object({ ...boardUpdateShape, columnKey: z.string().uuid() })
            .strict(),
        )
        .min(1)
        .max(500),
    })
    .strict(),
]);

export const deliveryBoardSchema = deliveryBoardRawSchema
  .superRefine((value, context) => {
    const ids = value.updates.map(({ id }) => id);
    if (new Set(ids).size !== ids.length) {
      context.addIssue({
        code: "custom",
        path: ["updates"],
        message: "Uma tarefa pode aparecer somente uma vez no lote.",
      });
    }
    const positions = value.updates.map(
      ({ columnKey, position }) => `${columnKey}\u0000${position}`,
    );
    if (new Set(positions).size !== positions.length) {
      context.addIssue({
        code: "custom",
        path: ["updates"],
        message: "Cada posição da coluna pode receber somente uma tarefa.",
      });
    }
  })
  .transform((value): DeliveryBoardInput => value);

export const deliveryStateSchema = z
  .object({ version, status: lifecycleStatus })
  .strict()
  .transform((value): DeliveryStateInput => value);

export const deliveryTaskStateSchema = z
  .object({ version, status: taskStatus })
  .strict()
  .transform((value): DeliveryTaskStateInput => value);

export const deliveryArchiveQuerySchema = z
  .object({ version: z.coerce.number().int().min(1).max(2_147_483_646) })
  .strict();

export const deliveryListQuerySchema = z
  .object({
    workspaceId: z.string().uuid().optional(),
    page: z.coerce.number().int().min(1).max(100_000).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(25),
    query: z.string().trim().max(100).default(""),
    status: lifecycleStatus.optional(),
    category: normalizedKey.optional(),
    priority: normalizedKey.optional(),
    projectId: z.string().uuid().optional(),
    businessId: z.string().uuid().optional(),
    responsibleUserId: z.string().uuid().optional(),
    tagId: z.string().uuid().optional(),
    dueFrom: isoDate.optional(),
    dueTo: isoDate.optional(),
    includeInactiveProjects: z
      .enum(["true", "false"])
      .transform((value) => value === "true")
      .default(false),
    archived: z.enum(["exclude", "include", "only"]).default("exclude"),
    orderBy: z
      .enum(["updated", "name_asc", "name_desc", "due_asc", "due_desc"])
      .default("updated"),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.dueFrom && value.dueTo && value.dueFrom > value.dueTo) {
      context.addIssue({
        code: "custom",
        path: ["dueTo"],
        message: "Intervalo de entrega inválido.",
      });
    }
  });

export type DeliveryListQuery = z.infer<typeof deliveryListQuerySchema>;
