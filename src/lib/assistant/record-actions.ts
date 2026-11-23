import { createBusiness, listBusinesses } from "$lib/businesses/client";
import { createContact, listContacts } from "$lib/contacts/client";
import {
  createProject,
  createService,
  getProjectOptions,
  listProjects,
} from "$lib/projects/client";
import { createDelivery } from "$lib/deliveries/client";
import { createContract } from "$lib/contracts/client";
import { createFinanceEntry } from "$lib/finance/client";
import { createWorkspace, CURRENT_USER } from "$lib/workspaces/workspace-storage";
import { currentSettings, saveWorkspaceSettings } from "$lib/settings/client";
import type { RecordCommand } from "./record-commands";
import type { CompiledQueueCommand } from "./execution-queue";

export type RecordActionResult = {
  message: string;
  created: Array<{
    type:
      | "contato"
      | "negócio"
      | "projeto"
      | "entrega"
      | "modelo de serviço"
      | "modelo de entrega"
      | "workspace"
      | "serviço"
      | "contrato"
      | "receita"
      | "despesa";
    name: string;
  }>;
  output?: {
    contactId?: string;
    businessId?: string;
    projectId?: string;
    deliveryId?: string;
    serviceTemplateId?: string;
    deliveryTemplateId?: string;
    workspaceId?: string;
    serviceId?: string;
    contractId?: string;
    financeEntryId?: string;
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

/** A parent referenced by a reviewed batch is absent before mutations begin. */
export class RecordDependencyMissingError extends Error {
  constructor(
    readonly resource: "negócio" | "projeto",
    readonly recordName: string,
  ) {
    super(
      `Não encontrei o ${resource} “${recordName}”. Crie-o antes de executar este lote ou inclua sua criação no próprio link.`,
    );
    this.name = "RecordDependencyMissingError";
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

function hasParentCommand(
  queue: CompiledQueueCommand[],
  command: CompiledQueueCommand,
  kind: RecordCommand["kind"],
): boolean {
  return command.dependsOn.some(
    (dependency) =>
      queue.find(({ id }) => id === dependency)?.command.kind === kind,
  );
}

export type RecordQueuePreflightIssue = {
  commandId: string;
  message: string;
};

/** Validates external parents without changing any workspace data. */
export async function preflightRecordCommandQueue(
  queue: CompiledQueueCommand[],
): Promise<RecordQueuePreflightIssue[]> {
  const issues: RecordQueuePreflightIssue[] = [];
  await Promise.all(
    queue.map(async (item) => {
      const { command } = item;
      try {
        if (
          (command.kind === "project" || command.kind === "contract") &&
          command.businessName &&
          !command.businessRef &&
          !hasParentCommand(queue, item, "business")
        ) {
          const businesses = await listBusinesses({
            query: command.businessName,
            pageSize: 100,
          });
          if (!exactOne(businesses.items, command.businessName, "negócio")) {
            throw new RecordDependencyMissingError(
              "negócio",
              command.businessName,
            );
          }
        }
        if (
          command.kind === "delivery" &&
          command.projectName &&
          !command.projectRef &&
          !hasParentCommand(queue, item, "project")
        ) {
          const projects = await listProjects({
            query: command.projectName,
            pageSize: 100,
            includeInactive: true,
          });
          if (!exactOne(projects.items, command.projectName, "projeto")) {
            throw new RecordDependencyMissingError(
              "projeto",
              command.projectName,
            );
          }
        }
      } catch (cause) {
        if (
          cause instanceof RecordDependencyMissingError ||
          cause instanceof RecordResolutionRequiredError
        ) {
          issues.push({ commandId: item.id, message: cause.message });
          return;
        }
        throw cause;
      }
    }),
  );
  return issues.sort((left, right) =>
    left.commandId.localeCompare(right.commandId),
  );
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
  if (command.kind === "workspace") {
    const workspace = await createWorkspace({
      name: command.name,
      description: command.description ?? "",
      icon: "briefcase",
      color: "blue",
    });
    return {
      message: `Criei o workspace ${workspace.name}.`,
      created: [{ type: "workspace", name: workspace.name }],
      output: { workspaceId: workspace.id },
    };
  }

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
      stage: "negociacao",
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
        throw new RecordDependencyMissingError(
          "negócio",
          command.businessName!,
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
          deliveries: [],
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

  if (command.kind === "service") {
    const service = await createService({
      name: command.name,
      description: command.description ?? "",
      icon: "package",
      color: "blue",
      defaultStatus: "planejamento",
      defaultDurationDays: null,
      defaultBriefing: "",
      tagLabels: [],
      responsibleUserIds: [],
      defaultContractType: "one_off",
      defaultAmountCents: 0,
      defaultInstallmentCount: 1,
      defaultPaymentMethod: "",
      defaultPaymentTerms: "",
      defaultFinanceNotes: "",
    });
    return {
      message: `Criei o serviço ${service.name}.`,
      created: [{ type: "serviço", name: service.name }],
      output: { serviceId: service.id },
    };
  }

  if (command.kind === "contract") {
    let businessId: string;
    let businessName: string;
    if (command.businessRef) {
      businessId = referencedId(context, command.businessRef, "businessId");
      businessName = command.businessName ?? "negócio vinculado";
    } else {
      const businesses = await listBusinesses({ query: command.businessName!, pageSize: 100 });
      const business = exactOne(businesses.items, command.businessName!, "negócio");
      if (!business) throw new RecordDependencyMissingError("negócio", command.businessName!);
      businessId = business.id;
      businessName = business.name;
    }
    const contract = await createContract({
      name: command.name,
      businessId,
      contractType: command.contractType,
      amountCents: command.amountCents,
      startDate: command.startDate ?? null,
      endDate: command.endDate ?? null,
      firstDueDate: command.firstDueDate ?? null,
      paymentMethod: "",
      paymentTerms: "",
      financeNotes: "",
      installments:
        command.contractType === "one_off" && command.amountCents > 0
          ? [{ number: 1, dueDate: command.firstDueDate!, amountCents: command.amountCents, status: "pending" }]
          : [],
    });
    return {
      message: `Criei o contrato ${contract.name} para o negócio ${businessName}.`,
      created: [{ type: "contrato", name: contract.name }],
      output: { contractId: contract.id },
    };
  }

  if (command.kind === "finance_entry") {
    const snapshot = await createFinanceEntry({
      title: command.name,
      type: command.type === "revenue" ? "receita" : "despesa",
      amount: command.amountCents / 100,
      date: command.dueDate,
      competenceDate: command.dueDate,
      mode: command.mode === "recurring" ? "fixa" : "pontual",
      category: command.category ?? "",
      notes: "",
      ...(command.mode === "recurring" ? { recurrenceMonths: command.recurrenceCount ?? 12 } : {}),
    });
    const entry = snapshot.entries.find((item) => item.title === command.name && item.dueDate === command.dueDate);
    return {
      message: `Criei a ${command.type === "revenue" ? "receita" : "despesa"} ${command.name}.`,
      created: [{ type: command.type === "revenue" ? "receita" : "despesa", name: command.name }],
      output: entry ? { financeEntryId: entry.id } : undefined,
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
          tasks: (command.tasks ?? []).map((task) => ({
            id: templateId(),
            nome: task.name,
            duracao: String(task.durationMinutes / 60),
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
                deliveries: [
                  ...template.deliveries,
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
      throw new RecordDependencyMissingError("projeto", command.projectName!);
    }
    projectId = project.id;
    projectName = project.name;
  }
  const tasks = command.tasks?.length
    ? command.tasks.map((task) => ({
        ...task,
        status: "pendente" as const,
      }))
    : [
        {
          name: command.name,
          durationMinutes: 60,
          status: "pendente" as const,
        },
      ];
  const delivery = await createDelivery({
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
    tasks,
  });
  return {
    message: `Criei a entrega ${delivery.name} no projeto ${projectName}.`,
    created: [{ type: "entrega", name: delivery.name }],
    output: { deliveryId: delivery.id },
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
