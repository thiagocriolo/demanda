import { z } from "zod";
import type {
  PersonalSettingsState,
  WorkspaceSettingsState,
} from "../../settings/types";

const collapsedText = (maximum: number) =>
  z
    .string()
    .trim()
    .min(1)
    .max(maximum)
    .transform((value) => value.replace(/\s+/gu, " "));

const optionalText = (maximum: number) => z.string().trim().max(maximum);
const color = z.string().trim().min(1).max(32);
const normalizedKey = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9][a-z0-9_-]{0,63}$/u);
const identifier = z.string().trim().min(1).max(128);
const uuidArray = z
  .array(z.string().uuid())
  .max(20)
  .superRefine((values, context) => {
    if (new Set(values).size !== values.length) {
      context.addIssue({ code: "custom", message: "IDs duplicados." });
    }
  });

const choiceSchema = z
  .object({ key: normalizedKey, label: collapsedText(80) })
  .strict();
const styledChoiceSchema = choiceSchema.extend({
  icon: collapsedText(80),
  color,
});

const uniqueByKey = <T extends { key: string }>(
  values: T[],
  context: z.RefinementCtx,
) => {
  if (new Set(values.map(({ key }) => key)).size !== values.length) {
    context.addIssue({ code: "custom", message: "Chaves duplicadas." });
  }
};

const styledChoices = (minimum: number, maximum: number) =>
  z
    .array(styledChoiceSchema)
    .min(minimum)
    .max(maximum)
    .superRefine(uniqueByKey);
const choices = (minimum: number, maximum: number) =>
  z.array(choiceSchema).min(minimum).max(maximum).superRefine(uniqueByKey);

const time = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/u);
const workdayShifts = z
  .array(z.object({ start: time, end: time }).strict())
  .min(1)
  .max(4)
  .superRefine((values, context) => {
    for (let index = 0; index < values.length; index += 1) {
      const shift = values[index]!;
      if (shift.end <= shift.start) {
        context.addIssue({
          code: "custom",
          path: [index, "end"],
          message: "O fim do turno deve ser posterior ao início.",
        });
      }
      if (index > 0 && values[index - 1]!.end > shift.start) {
        context.addIssue({
          code: "custom",
          path: [index, "start"],
          message: "Turnos não podem se sobrepor.",
        });
      }
    }
  });

export const personalSettingsSchema = z
  .object({
    startPage: collapsedText(80),
    rememberLastTab: z.boolean(),
    autoSaveFilters: z.boolean(),
    theme: z.enum(["light", "dark"]),
    interfaceDensity: z.enum(["default", "large"]),
    sidebarDefault: z.enum(["expanded", "collapsed"]),
    interfaceAnimations: z.boolean(),
    compactHeaders: z.boolean(),
    primaryColor: color,
    secondaryColor: color,
    customPalette: z
      .array(
        z
          .object({
            id: identifier,
            name: collapsedText(80),
            color,
          })
          .strict(),
      )
      .max(24),
    fontFamily: collapsedText(80),
    fontScale: z.number().int().min(75).max(150),
    dashboardDefaultPeriod: z.enum(["week", "month"]),
    dashboardShowMetrics: z.boolean(),
    dashboardShowTodaySchedule: z.boolean(),
    dashboardShowWorkload: z.boolean(),
    dashboardShowRecentActivity: z.boolean(),
    workspaceOrderBy: z.enum(["active", "updated", "name"]),
    workspaceShowInactive: z.boolean(),
    workspaceShowProjectPreviews: z.boolean(),
    workspaceShowCollaborators: z.boolean(),
    workspaceIncludeArchivedProjects: z.boolean(),
    recordsDefaultTab: z.enum(["pessoas", "negocios", "projetos", "tarefas"]),
    recordsOrderBy: z.enum(["updated", "name_asc", "name_desc"]),
    recordsShowArchived: z.boolean(),
    recordsCardLevel: z.number().int().min(1).max(10),
    defaultTaskDuration: z.string().regex(/^(?:0\.5|\d{1,3}(?:\.5)?)$/u),
    pautaScope: collapsedText(64),
    pautaGroupBy: collapsedText(64),
    pautaOrderBy: collapsedText(64),
    pautaShowDone: z.boolean(),
    pautaShowArchived: z.boolean(),
    pautaShowCardDetails: z.boolean(),
    agendaDefaultView: collapsedText(32),
    agendaDefaultMode: z.enum(["projects", "tasks"]),
    agendaDrawerDefault: z.enum(["expanded", "collapsed"]),
    agendaShowWeekends: z.boolean(),
    agendaRememberLastView: z.boolean(),
    cronogramaDefaultView: collapsedText(32),
    cronogramaDrawerDefault: z.enum(["expanded", "collapsed"]),
    cronogramaDays: z.enum(["weekdays", "saturday"]),
    cronogramaShowCurrentTime: z.boolean(),
    workdayShifts,
    taskReminderMinutes: z.string().regex(/^\d{1,5}$/u),
    notifyTaskReminders: z.boolean(),
    financeDefaultTab: z.enum(["painel", "receitas", "despesas"]),
    financeInitialPeriod: z.enum(["current", "last"]),
    financePlanningMonths: z.enum(["3", "6", "12"]),
    financeShowSettled: z.boolean(),
    financeShowPaused: z.boolean(),
    financeShowDashboardValues: z.boolean(),
    language: collapsedText(32),
    timezone: z.string().trim().min(1).max(64),
    dateFormat: collapsedText(32),
    timeFormat: collapsedText(16),
    weekStart: collapsedText(16),
    profile: z
      .object({
        photo: z
          .string()
          .max(512)
          .refine(
            (value) =>
              value === "" ||
              /^\/api\/files\/[0-9a-f-]{36}\/content$/u.test(value) ||
              /^\/(?:avatars|images)\//u.test(value),
            "A foto do perfil deve usar uma URL interna válida.",
          ),
        cover: z
          .string()
          .max(512)
          .refine(
            (value) =>
              value === "" ||
              /^\/api\/files\/[0-9a-f-]{36}\/content$/u.test(value),
            "A capa do perfil deve usar uma URL interna válida.",
          )
          .default(""),
        avatarImage: z.string().max(160),
        avatarColor: color,
        username: z.string().trim().max(40),
        name: z.string().trim().max(120),
        profession: z.string().trim().max(120),
        email: z.string().trim().max(320),
        phone: z.string().trim().max(40),
        bio: z.string().trim().max(2_000),
      })
      .strict(),
    statusColors: z.array(color).min(1).max(20),
  })
  .strict()
  .transform((value): PersonalSettingsState => value);

const tagLabels = z
  .array(collapsedText(64))
  .max(100)
  .superRefine((values, context) => {
    const normalized = values.map((value) => value.toLocaleLowerCase("pt-BR"));
    if (new Set(normalized).size !== values.length) {
      context.addIssue({ code: "custom", message: "Tags duplicadas." });
    }
  });

const templateTaskSchema = z
  .object({
    id: identifier,
    templateId: identifier,
    name: collapsedText(140),
  })
  .strict();

const serviceTemplateSchema = z
  .object({
    id: identifier,
    version: z.number().int().positive().optional(),
    serviceId: identifier.optional(),
    name: collapsedText(140),
    icon: collapsedText(80),
    color,
    briefing: optionalText(10_000),
    tags: optionalText(1_000),
    status: normalizedKey,
    responsible: optionalText(120),
    responsibleUserIds: uuidArray.optional(),
    duration: z
      .string()
      .trim()
      .regex(/^(?:|\d{1,4})$/u),
    contractType: z.string().trim().max(40),
    amount: z
      .string()
      .trim()
      .regex(/^(?:|\d{1,13}(?:[.,]\d{1,2})?)$/u),
    installments: z
      .string()
      .trim()
      .regex(/^(?:|\d{1,2})$/u),
    paymentMethod: optionalText(120),
    paymentTerms: optionalText(2_000),
    financeNotes: optionalText(4_000),
    tasks: z.array(templateTaskSchema).max(100),
  })
  .strict();

const deliveryTemplateSubtaskSchema = z
  .object({
    id: identifier,
    nome: collapsedText(140),
    duracao: z
      .string()
      .trim()
      .regex(/^\d{1,3}(?:[.,]5)?$/u),
    status: normalizedKey,
  })
  .strict();

const deliveryTemplateSchema = z
  .object({
    id: identifier,
    version: z.number().int().positive().optional(),
    serviceId: identifier.optional(),
    projectTemplateId: z.string().trim().max(128),
    name: collapsedText(140),
    category: z.union([normalizedKey, z.literal("")]),
    briefing: optionalText(10_000),
    subtasks: z.array(deliveryTemplateSubtaskSchema).max(100),
    status: normalizedKey,
    priority: normalizedKey,
    tags: optionalText(1_000),
    responsible: optionalText(120),
    responsibleUserIds: uuidArray.optional(),
    duration: z
      .string()
      .trim()
      .regex(/^(?:|\d{1,4}(?:[.,]5)?)$/u),
  })
  .strict();

const requiredKeys = {
  personStatuses: ["lead", "prospecto", "ativo", "desativado", "arquivado"],
  businessStatuses: [
    "negociacao",
    "contratacao",
    "ativo",
    "encerrado",
    "arquivado",
  ],
  projectStatuses: [
    "planejamento",
    "execucao",
    "alteracao",
    "concluido",
    "arquivado",
  ],
  taskStatuses: ["planejamento", "fila", "producao", "conclusao", "arquivado"],
} as const;

export const workspaceSettingsSchema = z
  .object({
    personStatuses: styledChoices(5, 5),
    businessStatuses: styledChoices(5, 5),
    projectStatuses: styledChoices(5, 5),
    taskStatuses: styledChoices(5, 5),
    businessCategories: styledChoices(1, 10),
    taskCategories: styledChoices(1, 30),
    taskPriorities: choices(1, 20),
    tags: tagLabels,
    revenueCategories: styledChoices(1, 30),
    expenseCategories: styledChoices(1, 30),
    templateGalleryVersion: z.number().int().min(1).max(1_000_000),
    services: z.array(z.unknown()).max(100),
    serviceTemplates: z.array(serviceTemplateSchema).max(100),
    deliveryTemplates: z.array(deliveryTemplateSchema).max(100),
  })
  .strict()
  .superRefine((value, context) => {
    for (const [field, keys] of Object.entries(requiredKeys)) {
      const actual = new Set(
        (value[field as keyof typeof requiredKeys] as { key: string }[]).map(
          ({ key }) => key,
        ),
      );
      if (keys.some((key) => !actual.has(key))) {
        context.addIssue({
          code: "custom",
          path: [field],
          message: "Os níveis obrigatórios não podem ser removidos.",
        });
      }
    }
    if (!value.businessCategories.some(({ key }) => key === "outro")) {
      context.addIssue({
        code: "custom",
        path: ["businessCategories"],
        message: "A categoria 'outro' é obrigatória.",
      });
    }
    if (!value.taskCategories.some(({ key }) => key === "outro")) {
      context.addIssue({
        code: "custom",
        path: ["taskCategories"],
        message: "A categoria 'outro' é obrigatória.",
      });
    }
    if (!value.taskPriorities.some(({ key }) => key === "normal")) {
      context.addIssue({
        code: "custom",
        path: ["taskPriorities"],
        message: "A prioridade normal é obrigatória.",
      });
    }
    const addDuplicateIssue = (
      items: { id: string; name: string }[],
      path: "serviceTemplates" | "deliveryTemplates",
    ) => {
      const ids = new Set<string>();
      const names = new Set<string>();
      for (const [index, item] of items.entries()) {
        const normalizedName = item.name.toLocaleLowerCase("pt-BR");
        if (ids.has(item.id) || names.has(normalizedName)) {
          context.addIssue({
            code: "custom",
            path: [path, index],
            message: "IDs e nomes de modelos devem ser únicos.",
          });
        }
        ids.add(item.id);
        names.add(normalizedName);
      }
    };
    addDuplicateIssue(value.serviceTemplates, "serviceTemplates");
    addDuplicateIssue(value.deliveryTemplates, "deliveryTemplates");

    const projectStatusKeys = new Set(
      value.projectStatuses.map(({ key }) => key),
    );
    const taskStatusKeys = new Set(value.taskStatuses.map(({ key }) => key));
    const taskCategoryKeys = new Set(
      value.taskCategories.map(({ key }) => key),
    );
    const priorityKeys = new Set(value.taskPriorities.map(({ key }) => key));
    for (const [index, template] of value.serviceTemplates.entries()) {
      if (
        template.status === "arquivado" ||
        !projectStatusKeys.has(template.status)
      ) {
        context.addIssue({
          code: "custom",
          path: ["serviceTemplates", index, "status"],
          message: "O status padrão do modelo não é válido.",
        });
      }
    }

    const serviceIds = new Set(value.serviceTemplates.map(({ id }) => id));
    const deliveryIds = new Set(value.deliveryTemplates.map(({ id }) => id));
    const taskOccurrenceIds = new Set<string>();
    for (const [serviceIndex, template] of value.serviceTemplates.entries()) {
      for (const [taskIndex, task] of template.tasks.entries()) {
        if (taskOccurrenceIds.has(task.id)) {
          context.addIssue({
            code: "custom",
            path: ["serviceTemplates", serviceIndex, "tasks", taskIndex, "id"],
            message: "IDs de ocorrências de tarefa devem ser únicos.",
          });
        }
        taskOccurrenceIds.add(task.id);
        if (!deliveryIds.has(task.templateId)) {
          context.addIssue({
            code: "custom",
            path: [
              "serviceTemplates",
              serviceIndex,
              "tasks",
              taskIndex,
              "templateId",
            ],
            message: "O modelo de tarefa selecionado não existe.",
          });
        }
      }
    }
    for (const [index, template] of value.deliveryTemplates.entries()) {
      if (
        template.projectTemplateId &&
        !serviceIds.has(template.projectTemplateId)
      ) {
        context.addIssue({
          code: "custom",
          path: ["deliveryTemplates", index, "projectTemplateId"],
          message: "O modelo de projeto associado não existe.",
        });
      }
      if (
        template.status === "arquivado" ||
        !taskStatusKeys.has(template.status)
      ) {
        context.addIssue({
          code: "custom",
          path: ["deliveryTemplates", index, "status"],
          message: "O status padrão da entrega não é válido.",
        });
      }
      if (template.category && !taskCategoryKeys.has(template.category)) {
        context.addIssue({
          code: "custom",
          path: ["deliveryTemplates", index, "category"],
          message: "A categoria da entrega não existe no catálogo.",
        });
      }
      if (!priorityKeys.has(template.priority)) {
        context.addIssue({
          code: "custom",
          path: ["deliveryTemplates", index, "priority"],
          message: "A prioridade da entrega não existe no catálogo.",
        });
      }
      const subtaskIds = new Set<string>();
      for (const [subtaskIndex, subtask] of template.subtasks.entries()) {
        if (subtaskIds.has(subtask.id)) {
          context.addIssue({
            code: "custom",
            path: ["deliveryTemplates", index, "subtasks", subtaskIndex, "id"],
            message: "IDs de subtarefas devem ser únicos no modelo.",
          });
        }
        subtaskIds.add(subtask.id);
        if (subtask.status !== "pendente" && subtask.status !== "concluida") {
          context.addIssue({
            code: "custom",
            path: [
              "deliveryTemplates",
              index,
              "subtasks",
              subtaskIndex,
              "status",
            ],
            message: "O status padrão da subtarefa não é válido.",
          });
        }
      }
    }
  })
  .transform((value): WorkspaceSettingsState => {
    return value as unknown as WorkspaceSettingsState;
  });

export const personalSettingsUpdateSchema = z
  .object({
    version: z.number().int().min(0),
    settings: personalSettingsSchema,
  })
  .strict();

export const workspaceSettingsUpdateSchema = z
  .object({
    version: z.number().int().positive(),
    settings: workspaceSettingsSchema,
  })
  .strict();

export const settingsImportSchema = z
  .object({
    personalVersion: z.number().int().min(0),
    personal: personalSettingsSchema,
    workspace: z
      .object({
        workspaceId: z.string().uuid(),
        version: z.number().int().positive(),
        settings: workspaceSettingsSchema,
      })
      .strict()
      .optional(),
  })
  .strict();
