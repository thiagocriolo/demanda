import { z } from "zod";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const historyModules = [
  "deliveries",
  "tasks",
  "cronograma",
  "agenda",
  "projects",
] as const;

export const historyQuerySchema = z
  .object({
    from: isoDate,
    to: isoDate,
    modules: z
      .string()
      .optional()
      .transform((value) =>
        (value ?? historyModules.join(","))
          .split(",")
          .filter((item): item is (typeof historyModules)[number] =>
            historyModules.includes(item as (typeof historyModules)[number]),
          ),
      ),
  })
  .refine(({ from, to }) => from <= to, {
    message: "A data inicial deve ser anterior Ã  data final.",
    path: ["to"],
  });

export type HistoryQuery = z.infer<typeof historyQuerySchema>;
