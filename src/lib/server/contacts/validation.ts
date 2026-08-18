import { z } from "zod";
import {
  contactEmailTypes,
  contactPhoneTypes,
  contactStatuses,
  contactTypes,
  type ContactMutationInput,
} from "../../contacts/types";

const collapsedText = (maximum: number) =>
  z
    .string()
    .trim()
    .min(1)
    .max(maximum)
    .transform((value) => value.replace(/\s+/g, " "));

const optionalText = (maximum: number) =>
  z
    .union([z.string().trim().max(maximum), z.null()])
    .transform((value) => value || null);

const phoneNumber = z
  .string()
  .trim()
  .transform((value) => {
    const hasInternationalPrefix =
      value.startsWith("+") || value.startsWith("00");
    let digits = value.replace(/\D/g, "");
    if (digits.startsWith("00")) digits = digits.slice(2);
    if (
      !hasInternationalPrefix &&
      (digits.length === 10 || digits.length === 11)
    ) {
      digits = `55${digits}`;
    }
    return `+${digits}`;
  })
  .refine((value) => /^\+[1-9]\d{7,14}$/.test(value), {
    message: "Telefone inválido.",
  });

const emailAddress = z.string().trim().toLowerCase().max(320).email();

const phoneInput = z
  .object({
    type: z.enum(contactPhoneTypes),
    label: z.string().trim().max(40).default(""),
    value: phoneNumber,
    isPrimary: z.boolean().default(false),
  })
  .strict();

const emailInput = z
  .object({
    type: z.enum(contactEmailTypes),
    label: z.string().trim().max(40).default(""),
    value: emailAddress,
    isPrimary: z.boolean().default(false),
  })
  .strict();

const noteInput = z
  .object({ body: z.string().trim().min(1).max(4_000) })
  .strict();

function enforceUniqueValues(
  values: { value: string; isPrimary: boolean }[],
  context: z.RefinementCtx,
  path: "phones" | "emails",
): void {
  if (new Set(values.map((entry) => entry.value)).size !== values.length) {
    context.addIssue({
      code: "custom",
      path: [path],
      message: "Valores duplicados não são permitidos.",
    });
  }
  if (values.filter((entry) => entry.isPrimary).length > 1) {
    context.addIssue({
      code: "custom",
      path: [path],
      message: "Somente um valor pode ser o principal.",
    });
  }
}

function ensurePrimary<T extends { isPrimary: boolean }>(values: T[]): T[] {
  if (!values.length || values.some((entry) => entry.isPrimary)) return values;
  return values.map((entry, index) => ({
    ...entry,
    isPrimary: index === 0,
  }));
}

export const contactMutationSchema = z
  .object({
    name: collapsedText(120),
    contactType: z.enum(contactTypes),
    status: z.enum(contactStatuses),
    profession: optionalText(120),
    linkedUserId: z.string().uuid().nullable(),
    phones: z.array(phoneInput).max(10),
    emails: z.array(emailInput).max(10),
    notes: z.array(noteInput).max(20),
  })
  .strict()
  .superRefine((value, context) => {
    enforceUniqueValues(value.phones, context, "phones");
    enforceUniqueValues(value.emails, context, "emails");
  })
  .transform((value): ContactMutationInput => ({
    ...value,
    phones: ensurePrimary(value.phones),
    emails: ensurePrimary(value.emails),
  }));

export const contactListQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).max(100_000).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(25),
    query: z.string().trim().max(100).default(""),
    status: z.enum(contactStatuses).optional(),
    contactType: z.enum(contactTypes).optional(),
    orderBy: z.enum(["updated", "name_asc", "name_desc"]).default("updated"),
    archived: z.enum(["exclude", "include", "only"]).default("exclude"),
  })
  .strict();

export type ContactListQuery = z.infer<typeof contactListQuerySchema>;
