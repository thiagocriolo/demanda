import { z } from "zod";
import type {
  FinancialDeleteInput,
  FinancialEntryContentInput,
  FinancialEntryUpdateInput,
  FinancialQuery,
  FinancialStateInput,
} from "../../finance/api-types";

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/u)
  .refine((value) => {
    const parsed = new Date(`${value}T00:00:00.000Z`);
    return (
      !Number.isNaN(parsed.getTime()) &&
      parsed.toISOString().slice(0, 10) === value
    );
  }, "Data inválida.");
const moneyCents = z.number().int().min(1).max(Number.MAX_SAFE_INTEGER);
const text = (maximum: number) => z.string().trim().max(maximum);

const contentShape = {
  title: z.string().trim().min(1).max(160),
  type: z.enum(["revenue", "expense"]),
  mode: z.enum(["one_off", "recurring"]),
  amountCents: moneyCents,
  competenceDate: isoDate,
  dueDate: isoDate,
  category: text(120),
  notes: text(4_000),
  recurrenceCount: z.number().int().min(1).max(120).optional(),
  installments: z
    .array(
      z
        .object({
          number: z.number().int().min(1).max(99),
          dueDate: isoDate,
          amountCents: moneyCents,
        })
        .strict(),
    )
    .min(2)
    .max(99)
    .optional(),
};

function validateContent(
  value: z.infer<z.ZodObject<typeof contentShape>>,
  context: z.RefinementCtx,
): void {
  if (value.mode === "recurring") {
    if (!value.recurrenceCount) {
      context.addIssue({
        code: "custom",
        path: ["recurrenceCount"],
        message: "Informe a quantidade de recorrências.",
      });
    }
    if (value.installments) {
      context.addIssue({
        code: "custom",
        path: ["installments"],
        message: "Uma recorrência não pode ser parcelada.",
      });
    }
  } else if (value.recurrenceCount !== undefined) {
    context.addIssue({
      code: "custom",
      path: ["recurrenceCount"],
      message: "Lançamentos pontuais não possuem recorrência.",
    });
  }
  if (value.installments) {
    const ordered = value.installments.every(
      (item, index) =>
        item.number === index + 1 &&
        (index === 0 ||
          value.installments![index - 1]!.dueDate <= item.dueDate),
    );
    if (!ordered) {
      context.addIssue({
        code: "custom",
        path: ["installments"],
        message: "Parcelas devem ser sequenciais e ordenadas por vencimento.",
      });
    }
    const total = value.installments.reduce(
      (sum, item) => sum + item.amountCents,
      0,
    );
    if (!Number.isSafeInteger(total) || total !== value.amountCents) {
      context.addIssue({
        code: "custom",
        path: ["installments"],
        message: "A soma das parcelas deve ser igual ao valor total.",
      });
    }
  }
}

export const financialCreateSchema = z
  .object(contentShape)
  .strict()
  .superRefine(validateContent)
  .transform((value): FinancialEntryContentInput => value);

export const financialUpdateSchema = z
  .object({ ...contentShape, version: z.number().int().positive() })
  .strict()
  .superRefine(validateContent)
  .transform((value): FinancialEntryUpdateInput => value);

export const financialStateSchema = z
  .object({
    version: z.number().int().positive(),
    action: z.enum(["settle", "pause", "resume"]),
  })
  .strict()
  .transform((value): FinancialStateInput => value);

export const financialDeleteSchema = z
  .object({ version: z.number().int().positive() })
  .strict()
  .transform((value): FinancialDeleteInput => value);

export const financialQuerySchema = z
  .object({
    workspaceId: z.string().uuid().optional(),
    from: isoDate.optional(),
    to: isoDate.optional(),
    type: z.enum(["revenue", "expense"]).optional(),
    basis: z.enum(["due", "competence"]).default("due"),
  })
  .strict()
  .refine(({ from, to }) => !from || !to || from <= to, {
    message: "O início do intervalo deve ser anterior ao fim.",
  })
  .transform((value): FinancialQuery => value);
