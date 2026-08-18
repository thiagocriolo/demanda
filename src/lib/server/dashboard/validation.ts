import { z } from "zod";

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/u)
  .refine((value) => {
    const date = new Date(`${value}T00:00:00.000Z`);
    return (
      !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
    );
  });

export const dashboardQuerySchema = z
  .object({
    date: isoDate,
    period: z.enum(["week", "month"]).default("week"),
  })
  .strict();

export const globalSearchQuerySchema = z
  .object({
    q: z.string().trim().min(2).max(100),
    scope: z
      .enum(["all", "contact", "business", "project", "task"])
      .default("all"),
    page: z.coerce.number().int().min(1).max(100).default(1),
    pageSize: z.coerce.number().int().min(5).max(50).default(8),
  })
  .strict();
