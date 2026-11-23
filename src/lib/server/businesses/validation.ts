import { z } from "zod";
import type { BusinessMutationInput } from "../../businesses/types";
import { normalizeKey } from "../db/helpers";

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
  .pipe(z.string().regex(/^[a-z0-9][a-z0-9_-]{0,63}$/));

const businessStage = normalizedKey
  .refine((value) => value !== "arquivado", {
    message: "A etapa arquivado e reservada ao ciclo de arquivamento.",
  })
  .refine((value) => value !== "novo", {
    message: "A etapa novo não é permitida; use negociacao.",
  });

const responsibleIds = z
  .array(z.string().uuid())
  .max(20)
  .superRefine((values, context) => {
    if (new Set(values).size !== values.length) {
      context.addIssue({
        code: "custom",
        message: "Responsaveis duplicados nao sao permitidos.",
      });
    }
  });

const noteInput = z
  .object({ body: z.string().trim().min(1).max(4_000) })
  .strict();

export const businessMutationSchema = z
  .object({
    name: collapsedText(120),
    category: normalizedKey,
    stage: businessStage,
    responsibleContactIds: responsibleIds,
    responsibleUserIds: responsibleIds.default([]),
    notes: z.array(noteInput).max(20),
  })
  .strict()
  .superRefine((value, context) => {
    const total =
      value.responsibleContactIds.length + value.responsibleUserIds.length;
    if (total < 1 || total > 20) {
      context.addIssue({
        code: "custom",
        path: ["responsibleContactIds"],
        message: "Informe entre um e vinte responsaveis.",
      });
    }
  })
  .transform((value): BusinessMutationInput => value);

export const businessListQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).max(100_000).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(25),
    query: z.string().trim().max(100).default(""),
    stage: businessStage.optional(),
    category: normalizedKey.optional(),
    archived: z.enum(["exclude", "include", "only"]).default("exclude"),
    orderBy: z.enum(["updated", "name_asc", "name_desc"]).default("updated"),
  })
  .strict();

export type BusinessListQuery = z.infer<typeof businessListQuerySchema>;
