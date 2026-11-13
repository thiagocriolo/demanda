import { createBusiness, listBusinesses } from "$lib/businesses/client";
import { createContact, listContacts } from "$lib/contacts/client";
import {
  createProject,
  getProjectOptions,
  listProjects,
} from "$lib/projects/client";
import { createTask } from "$lib/tasks/client";
import { CURRENT_USER } from "$lib/workspaces/workspace-storage";
import { currentSettings, saveWorkspaceSettings } from "$lib/settings/client";
import type { RecordCommand } from "./record-commands";

export type RecordActionResult = {
  message: string;
  created: Array<{
    type:
      | "contato"
      | "negócio"
      | "projeto"
      | "tarefa"
      | "modelo de serviço"
      | "modelo de entrega";
    name: string;
  }>;
  output?: {
    contactId?: string;
    businessId?: string;
    projectId?: string;
    taskId?: string;
    serviceTemplateId?: string;
    deliveryTemplateId?: string;
  };
};

export type RecordCommandExecutionContext = {
  outputsByCommandId: ReadonlyMap<
    string,
    NonNullable<RecordActionResult["output"]>
  >;
};

export class RecordResolutionRequiredError extends Error {
  constructor(
    readonly resource: string,
    readonly recordName: string,
    readonly options: Array<{ id: string; label: string }>,
  ) {
    super(
      `Encontrei mais de um ${resource} chamado “${recordName}”. Selecione qual deve ser usado para continuar este ramo.`,
    );
    this.name = "RecordResolutionRequiredError";
  }
}

function nameKey(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .trim()
    .replace(/\s+/gu, " ")
    .toLocaleLowerCase("pt-BR");
}

function exactOne<T extends { id: string; name: string }>(
  items: T[],
  name: string,
  kind: string,
): T | undefined {
  const matches = items.filter((item) => nameKey(item.name) === nameKey(name));
  if (matches.length > 1) {
    throw new RecordResolutionRequiredError(
      kind,
      name,
      matches.map((item) => ({ id: item.id, label: item.name })),
    );
  }
  return matches[0];
}

function referencedId(
  context: RecordCommandExecutionContext | undefined,
  commandId: string,
  field: "contactId" | "businessId" | "projectId" | "serviceTemplateId",
): string {
  const id = context?.outputsByCommandId.get(commandId)?.[field];
  if (!id) {
    throw new Error(
      `O comando “${commandId}” não forneceu o vínculo necessário para continuar.`,
    );
  }
  return id;
}

async function findOrCreateContact(name: string): Promise<{
  id: string;
  created: boolean;
}> {
  const contacts = await listContacts({ query: name, pageSize: 100 });
  const existing = exactOne(contacts.items, name, "contato");
  if (existing) return { id: existing.id, created: false };

  const contact = await createContact({
    name,
    contactType: "person",
    status: "lead",
    profession: null,
    linkedUserId: null,
    phones: [],
    emails: [],
    notes: [],
  });
  return { id: contact.id, created: true };
}

async function currentResponsibleUserId(): Promise<string> {
  const options = await getProjectOptions();
  const current = options.members.find(
    (member) => member.userId === CURRENT_USER.id,
  );
  const fallback = options.members[0];
  if (!current && !fallback) {
    throw new Error("Não encontrei um responsável no workspace ativo.");
  }
  return (current ?? fallback)!.userId;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

let templateWrite: Promise<void> = Promise.resolve();

function updateWorkspaceTemplates(
  update: (settings: ReturnType<typeof currentSettings>) => void,
): Promise<ReturnType<typeof currentSettings>> {
  const next = templateWrite.then(async () => {
    const settings = currentSettings();
    update(settings);
    return saveWorkspaceSettings(settings);
  });
  templateWrite = next.then(
    () => undefined,
    () => undefined,
  );
  return next;
}

function persistedTemplateId(
  templates: Array<{ id: string; name: string }>,
  name: string,
  kind: string,
): string {
  const template = exactOne(templates, name, kind);
  if (!template) {
    throw new Error(
      `O ${kind} “${name}” foi salvo, mas não pôde ser localizado no workspace.`,
    );
  }
  return template.id;
}

function templateId(): string {
  return crypto.randomUUID();
}

export async function executeRecordCommand(
  command: RecordCommand,
  context?: RecordCommandExecutionContext,
): Promise<RecordActionResult> {
  if (command.kind === "contact") {
    const result = await findOrCreateContact(command.name);
    return result.created
      ? {
          message: `Criei o contato ${command.name}.`,
          created: [{ type: "contato", name: command.name }],
          output: { contactId: result.id },
        }
      : {
          message: `O contato ${command.name} já existe.`,
          created: [],
          output: { contactId: result.id },
        };
  }

  if (command.kind === "business") {
    const contact = command.contactRef
      ? {
          id: referencedId(context, command.contactRef, "contactId"),
          created: false,
        }
      : await findOrCreateContact(command.contactName!);
    const business = await createBusiness({
      name: command.name,
      category: "geral",
      stage: "novo",
      responsibleContactIds: [contact.id],
      responsibleUserIds: [],
      notes: [],
    });
    const contactName = command.contactName ?? "o contato vinculado";
    return {
      message: `${contact.created ? `Criei o contato ${contactName} e ` : ""}criei o negócio ${business.name} para ${contactName}.`,
      created: [
        ...(contact.created
          ? ([{ type: "contato", name: contactName }] as const)
          : []),
        { type: "negócio", name: business.name },
      ],
      output: { businessId: business.id },
    };
  }

  if (command.kind === "project") {
    let businessId: string;
    let businessName: string;
    if (command.businessRef) {
      businessId = referencedId(context, command.businessRef, "businessId");
      businessName = command.businessName ?? "negócio vinculado";
    } else {
      const businesses = await listBusinesses({
        query: command.businessName!,
        pageSize: 100,
      });
      const business = exactOne(
        businesses.items,
        command.businessName!,
        "negócio",
      );
      if (!business) {
        throw new Error(
          `Não encontrei o negócio “${command.businessName}”. Crie-o antes de criar o projeto.`,
        );
      }
      businessId = business.id;
      businessName = business.name;
    }
    const project = await createProject({
      name: command.name,
      businessId,
      serviceIds: [],
      status: "planejamento",
      startDate: today(),
      endDate: null,
      briefing: "",
      tagLabels: [],
      responsibleUserIds: [await currentResponsibleUserId()],
      contractType: command.contractType ?? "one_off",
      amountCents: 0,
      firstDueDate: null,
      paymentMethod: "",
      paymentTerms: "",
      financeNotes: "",
      installments: [],
    });
    return {
      message: `Criei o projeto ${project.name} no negócio ${businessName}.`,
      created: [{ type: "projeto", name: project.name }],
      output: { projectId: project.id },
    };
  }

  if (command.kind === "service_template") {
    const id = templateId();
    const savedSettings = await updateWorkspaceTemplates((settings) => {
      settings.serviceTemplates = [
        ...settings.serviceTemplates,
        {
          id,
          name: command.name,
          icon: "package",
          color: "blue",
          briefing: command.briefing ?? "",
          tags: "",
          status: "planejamento",
          responsible: "",
          responsibleUserIds: [],
          duration: command.duration ?? "",
          contractType: "",
          amount: "",
          installments: "",
          paymentMethod: "",
          paymentTerms: "",
          financeNotes: "",
          tasks: [],
        },
      ];
    });
    return {
      message: `Criei o modelo de serviço ${command.name}.`,
      created: [{ type: "modelo de serviço", name: command.name }],
      output: {
        serviceTemplateId: persistedTemplateId(
          savedSettings.serviceTemplates,
          command.name,
          "modelo de serviço",
        ),
      },
    };
  }

  if (command.kind === "delivery_template") {
    const id = templateId();
    const serviceTemplateId = command.serviceTemplateRef
      ? referencedId(context, command.serviceTemplateRef, "serviceTemplateId")
      : "";
    const savedSettings = await updateWorkspaceTemplates((settings) => {
      settings.deliveryTemplates = [
        ...settings.deliveryTemplates,
        {
          id,
          projectTemplateId: serviceTemplateId,
          name: command.name,
          category: "",
          briefing: command.briefing ?? "",
          subtasks: (command.subtasks ?? []).map((subtask) => ({
            id: templateId(),
            nome: subtask.name,
            duracao: String(subtask.durationMinutes / 60),
            status: "pendente",
          })),
          status: "planejamento",
          priority: "normal",
          tags: "",
          responsible: "",
          responsibleUserIds: [],
          duration: "",
        },
      ];
      if (serviceTemplateId) {
        settings.serviceTemplates = settings.serviceTemplates.map((template) =>
          template.id === serviceTemplateId
            ? {
                ...template,
                tasks: [
                  ...template.tasks,
                  { id: templateId(), templateId: id, name: command.name },
                ],
              }
            : template,
        );
      }
    });
    return {
      message: `Criei o modelo de entrega ${command.name}.`,
      created: [{ type: "modelo de entrega", name: command.name }],
      output: {
        deliveryTemplateId: persistedTemplateId(
          savedSettings.deliveryTemplates,
          command.name,
          "modelo de entrega",
        ),
      },
    };
  }

  let projectId: string;
  let projectName: string;
  if (command.projectRef) {
    projectId = referencedId(context, command.projectRef, "projectId");
    projectName = command.projectName ?? "projeto vinculado";
  } else {
    const projects = await listProjects({
      query: command.projectName!,
      pageSize: 100,
    });
    const project = exactOne(projects.items, command.projectName!, "projeto");
    if (!project) {
      throw new Error(
        `Não encontrei o projeto “${command.projectName}”. Crie-o antes de adicionar a tarefa.`,
      );
    }
    projectId = project.id;
    projectName = project.name;
  }
  const subtasks = command.subtasks?.length
    ? command.subtasks.map((subtask) => ({
        ...subtask,
        status: "pendente" as const,
      }))
    : [
        {
          name: command.name,
          durationMinutes: 60,
          status: "pendente" as const,
        },
      ];
  const task = await createTask({
    name: command.name,
    projectId,
    category: "",
    priority: "normal",
    briefing: "",
    dueDate: null,
    sortOrder: 0,
    boardOrder: {},
    tagLabels: [],
    responsibleUserIds: [await currentResponsibleUserId()],
    status: "planejamento",
    subtasks,
  });
  return {
    message: `Criei a tarefa ${task.name} no projeto ${projectName}.`,
    created: [{ type: "tarefa", name: task.name }],
    output: { taskId: task.id },
  };
}

export async function executeRecordCommands(
  commands: RecordCommand[],
): Promise<RecordActionResult> {
  const results: RecordActionResult[] = [];
  for (const command of commands) {
    results.push(await executeRecordCommand(command));
  }
  return {
    message: results.map(({ message }) => message).join("\n"),
    created: results.flatMap(({ created }) => created),
  };
}
