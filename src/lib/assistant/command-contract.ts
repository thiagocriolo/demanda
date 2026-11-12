import { z } from "zod";

/** Ações que o usuário pode pedir. A autorização de cada uma fica no executor. */
export const commandActionSchema = z.enum(["create", "update", "delete"]);
export type CommandAction = z.infer<typeof commandActionSchema>;

/**
 * Recursos do domínio, separados das telas. Assim uma IA não precisa conhecer
 * rotas ou detalhes de banco de dados para expressar uma intenção.
 */
export const commandResourceSchema = z.enum([
  "contact",
  "business",
  "project",
  "task",
  "service_template",
  "delivery_template",
  "workspace",
  "workspace_member",
  "agenda_item",
  "schedule_block",
  "task_board",
]);
export type CommandResource = z.infer<typeof commandResourceSchema>;

export const commandTargetSchema = z
  .object({
    id: z.string().uuid().optional(),
    name: z.string().trim().min(1).max(140).optional(),
  })
  .strict()
  .refine((target) => Boolean(target.id || target.name), {
    message: "O alvo precisa ter id ou nome.",
  });

export const assistantCommandSchema = z
  .object({
    id: z.string().trim().min(1).max(80),
    dependsOn: z.array(z.string().trim().min(1).max(80)).max(20).optional(),
    action: commandActionSchema,
    resource: commandResourceSchema,
    target: commandTargetSchema.optional(),
    data: z.record(z.string(), z.unknown()).default({}),
  })
  .strict();
export type AssistantCommand = z.infer<typeof assistantCommandSchema>;

/** Formato estável que o ChatGPT deve gerar e o assistente deve aceitar. */
export const assistantCommandDocumentSchema = z
  .object({
    protocol: z.enum(["demanda.commands/v1", "demanda.commands/v2"]),
    commands: z.array(assistantCommandSchema).min(1).max(100),
  })
  .strict();
export type AssistantCommandDocument = z.infer<
  typeof assistantCommandDocumentSchema
>;
