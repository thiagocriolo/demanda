import { z } from "zod";
import type {
  CronogramaBlockInput,
  CronogramaDeleteInput,
  CronogramaQuery,
  CronogramaReorganizationInput,
} from "../../cronograma/api-types";

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/u)
  .refine((value) => {
    const parsed = new Date(`${value}T00:00:00.000Z`);
    return (
      !Number.isNaN(parsed.getTime()) &&
      parsed.toISOString().slice(0, 10) === value
    );
  }, "Data invalida.");

export const cronogramaBlockSchema = z
  .object({
    date: isoDate,
    startMinutes: z.number().int().min(0).max(1_410).multipleOf(30),
    durationMinutes: z.number().int().min(30).max(480).multipleOf(30),
    version: z.number().int().min(0),
  })
  .strict()
  .refine(
    ({ startMinutes, durationMinutes }) =>
      startMinutes + durationMinutes <= 1_440,
    { message: "O bloco deve terminar no mesmo dia." },
  )
  .transform((value): CronogramaBlockInput => value);

export const cronogramaDeleteSchema = z
  .object({ version: z.number().int().positive() })
  .strict()
  .transform((value): CronogramaDeleteInput => value);

export const cronogramaReorganizationSchema = z
  .object({
    workspaceId: z.string().uuid(),
    blocks: z
      .array(
        z
          .object({
            subtaskId: z.string().uuid(),
            date: isoDate,
            startMinutes: z.number().int().min(0).max(1_410).multipleOf(30),
            durationMinutes: z.number().int().min(30).max(480).multipleOf(30),
            version: z.number().int().min(0),
          })
          .strict()
          .refine(
            ({ startMinutes, durationMinutes }) =>
              startMinutes + durationMinutes <= 1_440,
            { message: "O bloco deve terminar no mesmo dia." },
          ),
      )
      .min(1)
      .max(500),
  })
  .strict()
  .superRefine(({ blocks }, context) => {
    const seen = new Set<string>();
    for (const block of blocks) {
      if (seen.has(block.subtaskId)) {
        context.addIssue({
          code: "custom",
          message: "Uma subtarefa não pode aparecer duas vezes.",
          path: ["blocks"],
        });
        return;
      }
      seen.add(block.subtaskId);
    }
  })
  .transform((value): CronogramaReorganizationInput => value);

export const cronogramaQuerySchema = z
  .object({
    workspaceId: z.string().uuid().optional(),
    from: isoDate.optional(),
    to: isoDate.optional(),
    responsibleUserId: z.string().uuid().optional(),
  })
  .strict()
  .refine(({ from, to }) => !from || !to || from <= to, {
    message: "O inicio do intervalo deve ser anterior ao fim.",
  })
  .transform((value): CronogramaQuery => value);
