import { z } from "zod";
import type { TaskCreateInput } from "../tasks/types";

const text = (maximum: number) =>
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

const key = z
  .string()
  .trim()
  .max(64)
  .transform((value) =>
    value
      .normalize("NFKD")
      .replace(/\p{M}/gu, "")
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, "_")
      .replace(/^[_-]+|[_-]+$/g, ""),
  )
  .pipe(z.string().min(1).max(64));

const optionalKey = z
  .string()
  .trim()
  .max(64)
  .transform((value) => (value ? key.parse(value) : ""));

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/u)
  .nullable();

const subtask = z
  .object({
    name: text(120),
    durationMinutes: z
      .number()
      .int()
      .min(30)
      .max(10_080)
      .refine((value) => value % 30 === 0),
    status: z.enum(["pendente", "concluida"]),
  })
  .strict();

const legacyTaskStatus = z
  .enum([
    "pendente",
    "revisao",
    "entregue",
    "planejamento",
    "fila",
    "producao",
    "conclusao",
  ])
  .default("planejamento")
  .transform((value) => {
    const aliases: Record<string, string> = {
      pendente: "planejamento",
      revisao: "producao",
      entregue: "conclusao",
    };
    return aliases[value] ?? value;
  });

const legacyRecord = z
  .object({
    sourceRecordId: text(160),
    name: text(140),
    projectName: text(140),
    category: optionalKey.default(""),
    priority: key.default("normal"),
    status: legacyTaskStatus,
    briefing: optionalText(10_000).default(""),
    dueDate: isoDate.default(null),
    tagLabels: z.array(text(64)).max(30).default([]),
    subtasks: z.array(subtask).min(1).max(10),
  })
  .strict();

export const legacyDeliveriesImportSchema = z
  .object({
    version: z.literal(1),
    sourceKey: z.literal("demanda:crud:entregas"),
    records: z.array(legacyRecord).max(500),
  })
  .strict()
  .superRefine((value, context) => {
    const ids = value.records.map(({ sourceRecordId }) => sourceRecordId);
    if (new Set(ids).size !== ids.length) {
      context.addIssue({
        code: "custom",
        path: ["records"],
        message: "O backup contém identificadores de tarefa duplicados.",
      });
    }
  });

export type LegacyDeliveriesImport = z.infer<
  typeof legacyDeliveriesImportSchema
>;

export type LegacyDeliveryImportRecord =
  LegacyDeliveriesImport["records"][number];

export function legacyRecordToTaskInput(
  record: LegacyDeliveryImportRecord,
  projectId: string,
  responsibleUserId: string,
): TaskCreateInput {
  const completed = record.status === "conclusao";
  const subtasks = record.subtasks.map((item) => ({
    ...item,
    status: completed ? ("concluida" as const) : item.status,
  }));
  return {
    name: record.name,
    projectId,
    category: record.category,
    priority: record.priority,
    status: record.status,
    briefing: record.briefing,
    dueDate: record.dueDate,
    tagLabels: record.tagLabels,
    responsibleUserIds: [responsibleUserId],
    sortOrder: 0,
    boardOrder: {},
    subtasks,
  };
}
