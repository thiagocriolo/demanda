import { z } from "zod";
import type { AgendaMoveInput, AgendaQuery } from "../../agenda/types";

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

export const agendaQuerySchema = z
  .object({ workspaceId: z.string().uuid().optional() })
  .strict()
  .transform((value): AgendaQuery => value);

export const agendaMoveSchema = z
  .object({
    mode: z.enum(["projects", "tasks"]),
    items: z
      .array(
        z
          .object({
            id: z.string().uuid(),
            date: isoDate.nullable(),
            order: z.number().int().min(0).max(999_999),
            durationMinutes: z
              .number()
              .int()
              .min(30)
              .max(10_080)
              .multipleOf(30),
            version: z.number().int().positive(),
          })
          .strict(),
      )
      .max(5_000),
  })
  .strict()
  .superRefine((value, context) => {
    if (new Set(value.items.map(({ id }) => id)).size !== value.items.length) {
      context.addIssue({
        code: "custom",
        path: ["items"],
        message: "Itens duplicados.",
      });
    }
    const byDate = new Map<string, number[]>();
    for (const item of value.items) {
      const key = item.date ?? "__unscheduled__";
      byDate.set(key, [...(byDate.get(key) ?? []), item.order]);
    }
    for (const positions of byDate.values()) {
      positions.sort((left, right) => left - right);
      if (positions.some((position, index) => position !== index)) {
        context.addIssue({
          code: "custom",
          path: ["items"],
          message: "A ordem de cada dia deve ser continua e sem duplicidades.",
        });
        break;
      }
    }
  })
  .transform((value): AgendaMoveInput => value);
