import {
  assistantCommandDocumentSchema,
  type AssistantCommand,
} from "./command-contract";
import { catalogEntry } from "./command-catalog";
import type { QueuedRecordCommand } from "./execution-queue";
import { canonicalBusinessStage } from "$lib/businesses/stages";

export type RecordCommand =
  | {
      kind: "contact";
      name: string;
      contactType?: "person" | "company" | "other";
      /** `archived` is translated to the application's archive operation. */
      status?: "lead" | "prospect" | "active" | "inactive" | "archived";
      profession?: string;
      phones?: Array<{
        type: "mobile" | "whatsapp" | "work" | "home" | "other";
        label: string;
        value: string;
        isPrimary: boolean;
      }>;
      emails?: Array<{
        type: "personal" | "work" | "other";
        label: string;
        value: string;
        isPrimary: boolean;
      }>;
      notes?: Array<{ body: string }>;
    }
  | { kind: "workspace"; name: string; description?: string }
  | {
      kind: "business";
      name: string;
      contactName?: string;
      contactNames?: string[];
      contactRef?: string;
      category?: string;
      stage?: string;
      notes?: Array<{ body: string }>;
    }
  | {
      kind: "project";
      name: string;
      contractName?: string;
      contractRef?: string;
      businessName?: string;
      businessRef?: string;
      contractType?: "one_off" | "recurring";
      serviceIds?: string[];
      status?: string;
      startDate?: string;
      endDate?: string;
      engagementType?: "fee" | "personal";
      briefing?: string;
      tagLabels?: string[];
      responsibleUserIds?: string[];
      amountCents?: number;
      firstDueDate?: string;
      paymentMethod?: string;
      paymentTerms?: string;
      financeNotes?: string;
      installments?: Array<{
        number: number;
        dueDate: string;
        amountCents: number;
        status: string;
      }>;
    }
  | {
      kind: "delivery";
      name: string;
      projectName?: string;
      projectRef?: string;
      category?: string;
      priority?: string;
      status?: string;
      briefing?: string;
      dueDate?: string;
      engagementType?: "fee" | "personal";
      tagLabels?: string[];
      responsibleUserIds?: string[];
      tasks?: Array<{
        name: string;
        durationMinutes: number;
        executionAt?: string | null;
        status?: string;
      }>;
    }
  | {
      kind: "service_template";
      name: string;
      briefing?: string;
      duration?: string;
    }
  | {
      kind: "delivery_template";
      name: string;
      serviceTemplateRef?: string;
      briefing?: string;
      tasks?: Array<{ name: string; durationMinutes: number }>;
    }
  | { kind: "service"; name: string; description?: string }
  | {
      kind: "contract";
      name: string;
      businessName?: string;
      businessRef?: string;
      contractType: "one_off" | "recurring";
      amountCents: number;
      startDate?: string;
      endDate?: string;
      firstDueDate?: string;
      paymentMethod?: string;
      paymentTerms?: string;
      financeNotes?: string;
      installments?: Array<{
        number: number;
        dueDate: string;
        amountCents: number;
        status: string;
      }>;
    }
  | {
      kind: "finance_entry";
      name: string;
      type: "revenue" | "expense";
      amountCents: number;
      dueDate: string;
      category?: string;
      mode?: "one_off" | "recurring";
      recurrenceCount?: number;
    };

export type ParseRecordCommandResult =
  { ok: true; command: RecordCommand } | { ok: false; message: string };

export type ParseRecordCommandsResult =
  | {
      ok: true;
      commands: RecordCommand[];
      queueCommands?: QueuedRecordCommand[];
    }
  | { ok: false; message: string };

const action = "(?:crie|criar|adicione|adicionar|registre|registrar)";
const article = "(?:um|uma|o|a)?";

function cleanName(value: string): string {
  return value
    .replace(/[.!?]+$/u, "")
    .replace(/\s+/gu, " ")
    .trim();
}

function normalizedValue(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .trim()
    .toLocaleLowerCase("pt-BR");
}

function contactStatus(
  value: string,
): "lead" | "prospect" | "active" | "inactive" | "archived" {
  const statuses: Record<
    string,
    "lead" | "prospect" | "active" | "inactive" | "archived"
  > = {
    lead: "lead",
    prospect: "prospect",
    prospecto: "prospect",
    active: "active",
    ativo: "active",
    inactive: "inactive",
    desativado: "inactive",
    archived: "archived",
    arquivado: "archived",
  };
  const status = statuses[normalizedValue(value)];
  if (!status) {
    throw new Error(
      "data.status precisa ser Lead, Prospecto, Ativo, Desativado ou Arquivado.",
    );
  }
  return status;
}

function commandFields(value: string): {
  name: string;
  fields: Record<string, string>;
} {
  const [rawName, ...parts] = value.split(/\s*\|\s*/u);
  const fields: Record<string, string> = {};
  for (const part of parts) {
    const separator = part.indexOf(":");
    if (separator < 1) {
      throw new Error(`Campo inv\u00e1lido no comando: \u201c${part}\u201d.`);
    }
    const key = normalizedValue(part.slice(0, separator));
    const fieldValue = cleanName(part.slice(separator + 1));
    if (!fieldValue || fields[key] !== undefined) {
      throw new Error(`Campo inv\u00e1lido ou repetido: \u201c${part}\u201d.`);
    }
    fields[key] = fieldValue;
  }
  const name = cleanName(rawName ?? "");
  if (!name) throw new Error("O nome \u00e9 obrigat\u00f3rio.");
  return { name, fields };
}

function canonicalContact(value: string): RecordCommand {
  const { name, fields } = commandFields(value);
  const allowed = new Set([
    "status",
    "telefone",
    "tel",
    "email",
    "e-mail",
    "profissao",
    "tipo",
    "observacao",
    "observacoes",
  ]);
  for (const key of Object.keys(fields)) {
    if (!allowed.has(key))
      throw new Error(
        `O campo \u201c${key}\u201d n\u00e3o \u00e9 aceito para contato.`,
      );
  }
  const type = fields.tipo;
  if (
    type &&
    !["person", "pessoa", "company", "empresa", "other", "outro"].includes(
      normalizedValue(type),
    )
  ) {
    throw new Error("TIPO precisa ser pessoa, empresa ou outro.");
  }
  const contactType = type
    ? normalizedValue(type) === "pessoa"
      ? "person"
      : normalizedValue(type) === "empresa"
        ? "company"
        : normalizedValue(type) === "outro"
          ? "other"
          : (normalizedValue(type) as "person" | "company" | "other")
    : undefined;
  const phone = fields.telefone ?? fields.tel;
  const email = fields.email ?? fields["e-mail"];
  return {
    kind: "contact",
    name,
    ...(contactType ? { contactType } : {}),
    ...(fields.status ? { status: contactStatus(fields.status) } : {}),
    ...(fields.profissao ? { profession: fields.profissao } : {}),
    ...(phone
      ? {
          phones: [
            {
              type: "whatsapp",
              label: "WhatsApp",
              value: phone,
              isPrimary: true,
            },
          ],
        }
      : {}),
    ...(email
      ? {
          emails: [
            { type: "work", label: "Principal", value: email, isPrimary: true },
          ],
        }
      : {}),
    ...((fields.observacao ?? fields.observacoes)
      ? { notes: [{ body: fields.observacao ?? fields.observacoes! }] }
      : {}),
  };
}

function commaSeparated(value: string | undefined): string[] | undefined {
  if (value === undefined) return undefined;
  const values = value.split(",").map(cleanName).filter(Boolean);
  if (!values.length) throw new Error("A lista n\u00e3o pode estar vazia.");
  return values;
}

function requireOnlyFields(
  fields: Record<string, string>,
  allowed: string[],
  entity: string,
): void {
  const allowedSet = new Set(allowed);
  const invalid = Object.keys(fields).find((key) => !allowedSet.has(key));
  if (invalid)
    throw new Error(
      `O campo \u201c${invalid}\u201d n\u00e3o \u00e9 aceito para ${entity}.`,
    );
}

function requireOnlyData(command: AssistantCommand, allowed: string[]): void {
  const invalid = Object.keys(command.data).find(
    (key) => !allowed.includes(key),
  );
  if (invalid)
    throw new Error(
      `data.${invalid} não é aceito para criar ${catalogEntry(command.resource).label.toLocaleLowerCase("pt-BR")}.`,
    );
}

function businessStage(value: string): string {
  const stage = canonicalBusinessStage(value);
  if (!stage) {
    throw new Error(
      "data.stage precisa ser Negociação, Contratação, Ativado, Encerrado ou Arquivado.",
    );
  }
  return stage;
}

function canonicalBusiness(value: string): RecordCommand {
  const { name, fields } = commandFields(value);
  requireOnlyFields(
    fields,
    [
      "responsavel",
      "categoria",
      "status",
      "etapa",
      "observacao",
      "observacoes",
    ],
    "neg\u00f3cio",
  );
  const responsible = fields.responsavel;
  if (!responsible)
    throw new Error("RESPONSÁVEL é obrigatório para criar um negócio.");
  return {
    kind: "business",
    name,
    contactNames: commaSeparated(responsible),
    ...(fields.categoria ? { category: fields.categoria } : {}),
    ...((fields.status ?? fields.etapa)
      ? { stage: businessStage(fields.status ?? fields.etapa!) }
      : {}),
    ...((fields.observacoes ?? fields.observacao)
      ? { notes: [{ body: fields.observacoes ?? fields.observacao! }] }
      : {}),
  };
}

function canonicalProject(value: string): RecordCommand {
  const { name, fields } = commandFields(value);
  requireOnlyFields(
    fields,
    [
      "contrato",
      "tipo",
      "status",
      "data inicio",
      "inicio",
      "data fim",
      "fim",
      "briefing",
      "tags",
    ],
    "projeto",
  );
  const contractName = fields.contrato;
  if (!contractName)
    throw new Error("NEGÓCIO é obrigatório para criar um projeto.");
  const type = fields.tipo ? contractTypeFromText(fields.tipo) : undefined;
  return {
    kind: "project",
    name,
    contractName,
    ...(type ? { contractType: type } : {}),
    ...(fields.status ? { status: fields.status } : {}),
    ...((fields["data inicio"] ?? fields.inicio)
      ? { startDate: fields["data inicio"] ?? fields.inicio! }
      : {}),
    ...((fields["data fim"] ?? fields.fim)
      ? { endDate: fields["data fim"] ?? fields.fim! }
      : {}),
    ...(fields.briefing ? { briefing: fields.briefing } : {}),
    ...(commaSeparated(fields.tags)
      ? { tagLabels: commaSeparated(fields.tags) }
      : {}),
  };
}

function canonicalContract(value: string): RecordCommand {
  const { name, fields } = commandFields(value);
  requireOnlyFields(
    fields,
    [
      "negocio",
      "tipo",
      "valor",
      "inicio",
      "fim",
      "vencimento",
      "forma pagamento",
      "condicoes",
      "observacoes",
    ],
    "contrato",
  );
  const businessName = fields.negocio;
  if (!businessName)
    throw new Error("NEGÓCIO é obrigatório para criar um contrato.");
  const amountCents = fields.valor
    ? parseBrazilianMoneyToCents(fields.valor)
    : 0;
  if (amountCents === undefined)
    throw new Error("VALOR precisa ser um valor monetário válido.");
  const type = fields.tipo ? contractTypeFromText(fields.tipo) : "one_off";
  return {
    kind: "contract",
    name,
    businessName,
    contractType: type,
    amountCents,
    ...(fields.inicio ? { startDate: fields.inicio } : {}),
    ...(fields.fim ? { endDate: fields.fim } : {}),
    ...(fields.vencimento ? { firstDueDate: fields.vencimento } : {}),
    ...(fields["forma pagamento"]
      ? { paymentMethod: fields["forma pagamento"] }
      : {}),
    ...(fields.condicoes ? { paymentTerms: fields.condicoes } : {}),
    ...(fields.observacoes ? { financeNotes: fields.observacoes } : {}),
  };
}

function canonicalDelivery(value: string): RecordCommand {
  const { name, fields } = commandFields(value);
  requireOnlyFields(
    fields,
    [
      "projeto",
      "categoria",
      "prioridade",
      "status",
      "briefing",
      "descricao",
      "vencimento",
      "tags",
    ],
    "entrega",
  );
  const projectName = fields.projeto;
  if (!projectName)
    throw new Error("PROJETO é obrigatório para criar uma entrega ou tarefa.");
  return {
    kind: "delivery",
    name,
    projectName,
    ...(fields.categoria ? { category: fields.categoria } : {}),
    ...(fields.prioridade ? { priority: fields.prioridade } : {}),
    ...(fields.status ? { status: fields.status } : {}),
    ...((fields.briefing ?? fields.descricao)
      ? { briefing: fields.briefing ?? fields.descricao! }
      : {}),
    ...(fields.vencimento ? { dueDate: fields.vencimento } : {}),
    ...(commaSeparated(fields.tags)
      ? { tagLabels: commaSeparated(fields.tags) }
      : {}),
  };
}

function parseBrazilianMoneyToCents(value: string): number | undefined {
  const normalized = value
    .trim()
    .replace(/^R\$\s*/iu, "")
    .replace(/\./gu, "")
    .replace(",", ".");
  if (!/^\d+(?:\.\d{1,2})?$/u.test(normalized)) return undefined;
  const cents = Math.round(Number(normalized) * 100);
  return Number.isSafeInteger(cents) && cents >= 0 ? cents : undefined;
}

function capture(pattern: RegExp, text: string): string[] | null {
  const match = pattern.exec(text.trim());
  if (!match) return null;
  const values = match.slice(1).map(cleanName);
  return values.every(Boolean) ? values : null;
}

/**
 * A camada de IA deve devolver uma destas intenções estruturadas. Enquanto a
 * conexão ChatGPT é configurada, este parser deixa o fluxo local testável com
 * comandos claros em português, sem conceder nenhuma operação fora do escopo.
 */
export function parseRecordCommand(input: string): ParseRecordCommandResult {
  const text = input.trim();
  if (!text)
    return { ok: false, message: "Escreva o que você quer registrar." };

  const contact = capture(
    new RegExp(
      `^${action}\\s+${article}\\s*(?:contato|pessoa)\\s+(?:chamad[oa]\\s+)?(.+?)$`,
      "iu",
    ),
    text,
  );
  if (contact)
    return { ok: true, command: { kind: "contact", name: contact[0]! } };

  const workspace = capture(
    new RegExp(
      `^${action}\\s+${article}\\s*workspace\\s+(?:chamad[oa]\\s+)?(.+?)$`,
      "iu",
    ),
    text,
  );
  if (workspace)
    return { ok: true, command: { kind: "workspace", name: workspace[0]! } };

  const service = capture(
    new RegExp(
      `^${action}\\s+${article}\\s*servi[cç]o\\s+(?:chamad[oa]\\s+)?(.+?)$`,
      "iu",
    ),
    text,
  );
  if (service)
    return { ok: true, command: { kind: "service", name: service[0]! } };

  const business = capture(
    new RegExp(
      `^${action}\\s+${article}\\s*(?:neg[oó]cio)\\s+(?:chamad[oa]\\s+)?(.+?)\\s+(?:do|da|para)\\s+(.+?)$`,
      "iu",
    ),
    text,
  );
  if (business) {
    return {
      ok: true,
      command: {
        kind: "business",
        name: business[0]!,
        contactName: business[1]!,
      },
    };
  }

  const contract = capture(
    new RegExp(
      `^${action}\\s+${article}\\s*contrato\\s+(?:chamad[oa]\\s+)?(.+?)\\s+(?:para|do|da)\\s+(?:neg[oó]cio\\s+)?(.+?)$`,
      "iu",
    ),
    text,
  );
  if (contract) {
    return {
      ok: true,
      command: {
        kind: "contract",
        name: contract[0]!,
        businessName: contract[1]!,
        contractType: "one_off",
        amountCents: 0,
      },
    };
  }

  const financial = new RegExp(
    `^${action}\\s+${article}\\s*(receita|despesa)\\s+(?:chamad[oa]\\s+)?(.+?)\\s+(?:de|no valor de)\\s+(R?\\$?\\s*[0-9.,]+)\\s+(?:para|em)\\s+(\\d{4}-\\d{2}-\\d{2})$`,
    "iu",
  ).exec(text);
  if (financial) {
    const amountCents = parseBrazilianMoneyToCents(financial[3]!);
    if (amountCents !== undefined) {
      const normalizedType = financial[1]!
        .normalize("NFD")
        .replace(/\p{M}/gu, "")
        .toLocaleLowerCase("pt-BR");
      return {
        ok: true,
        command: {
          kind: "finance_entry",
          name: cleanName(financial[2]!),
          type: normalizedType === "receita" ? "revenue" : "expense",
          amountCents,
          dueDate: financial[4]!,
        },
      };
    }
  }

  const project = capture(
    new RegExp(
      `^${action}\\s+${article}\\s*projeto\\s+(?:chamad[oa]\\s+)?(.+?)\\s+(?:para|do|da|no|na)\\s+(?:neg[oó]cio\\s+)?(.+?)$`,
      "iu",
    ),
    text,
  );
  if (project) {
    const { businessName, contractType } = projectDetails(project[1]!);
    return {
      ok: true,
      command: {
        kind: "project",
        name: project[0]!,
        businessName,
        ...(contractType ? { contractType } : {}),
      },
    };
  }

  const delivery = capture(
    new RegExp(
      `^${action}\\s+${article}\\s*(?:tarefa|entrega)\\s+(?:chamad[oa]\\s+)?(.+?)\\s+(?:para|do|da|no|na)\\s+(?:projeto\\s+)?(.+?)$`,
      "iu",
    ),
    text,
  );
  if (delivery) {
    return {
      ok: true,
      command: {
        kind: "delivery",
        name: delivery[0]!,
        projectName: delivery[1]!,
      },
    };
  }

  return {
    ok: false,
    message:
      "Por enquanto consigo registrar contatos, negócios, projetos e entregas. Experimente: “Crie um negócio chamado Macajo para Caleb”.",
  };
}

/**
 * Aceita a forma canônica produzida pelo Projeto do ChatGPT. Ela é
 * propositalmente curta — uma operação por linha — para permitir copiar e
 * colar um lote inteiro sem adaptar texto de explicação.
 */
function parseCanonicalCommand(input: string): ParseRecordCommandResult | null {
  const contact = capture(/^CRIE\s+CONTATO:\s*(.+?)$/iu, input);
  if (contact) {
    try {
      return { ok: true, command: canonicalContact(contact[0]!) };
    } catch (cause) {
      return {
        ok: false,
        message:
          cause instanceof Error
            ? cause.message
            : "Comando de contato inv\u00e1lido.",
      };
    }
  }

  const flexibleMatchers: Array<[RegExp, (value: string) => RecordCommand]> = [
    [/^CRIE\s+NEG[O\u00d3]CIO:\s*(.+?)$/iu, canonicalBusiness],
    [/^CRIE\s+CONTRATO:\s*(.+?)$/iu, canonicalContract],
    [/^CRIE\s+PROJETO:\s*(.+?)$/iu, canonicalProject],
    [/^CRIE\s+(?:TAREFA|ENTREGA):\s*(.+?)$/iu, canonicalDelivery],
  ];
  for (const [pattern, compile] of flexibleMatchers) {
    const match = pattern.exec(input);
    if (!match) continue;
    try {
      return { ok: true, command: compile(match[1]!) };
    } catch (cause) {
      return {
        ok: false,
        message:
          cause instanceof Error ? cause.message : "Comando inv\u00e1lido.",
      };
    }
  }

  const business = capture(
    /^CRIE\s+NEG[OÓ]CIO:\s*(.+?)\s*\|\s*RESPONS[ÁA]VEL:\s*(.+?)$/iu,
    input,
  );
  if (business) {
    return {
      ok: true,
      command: {
        kind: "business",
        name: business[0]!,
        contactName: business[1]!,
      },
    };
  }

  const project = capture(
    /^CRIE\s+PROJETO:\s*(.+?)\s*\|\s*NEG[OÓ]CIO:\s*(.+?)$/iu,
    input,
  );
  if (project) {
    return {
      ok: true,
      command: {
        kind: "project",
        name: project[0]!,
        ...projectDetails(project[1]!),
      },
    };
  }

  const delivery = capture(
    /^CRIE\s+TAREFA:\s*(.+?)\s*\|\s*PROJETO:\s*(.+?)$/iu,
    input,
  );
  if (delivery) {
    return {
      ok: true,
      command: {
        kind: "delivery",
        name: delivery[0]!,
        projectName: delivery[1]!,
      },
    };
  }
  return null;
}

function requiredText(command: AssistantCommand, key: string): string {
  const value = command.data[key];
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`O campo data.${key} é obrigatório.`);
  }
  return cleanName(value);
}

function optionalText(
  command: AssistantCommand,
  key: string,
): string | undefined {
  const value = command.data[key];
  if (value === undefined) return undefined;
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`O campo data.${key} precisa ser um texto válido.`);
  }
  return cleanName(value);
}

function requiredTextOrReference(
  command: AssistantCommand,
  textKey: string,
  referenceKey: string,
): { name?: string; reference?: string } {
  const name = optionalText(command, textKey);
  const reference = optionalText(command, referenceKey);
  if (!name && !reference) {
    throw new Error(
      `Informe data.${textKey} ou data.${referenceKey} para este comando.`,
    );
  }
  return { ...(name ? { name } : {}), ...(reference ? { reference } : {}) };
}

function projectDetails(value: string): {
  businessName: string;
  contractType?: "one_off" | "recurring";
} {
  const typeMatch = /\s*\|\s*TIPO:\s*(C[ÍI]CLICO|PONTUAL)$/iu.exec(value);
  return {
    businessName: value
      .replace(/\s*\|\s*TIPO:\s*(?:C[ÍI]CLICO|PONTUAL)$/iu, "")
      .trim(),
    ...(typeMatch
      ? {
          contractType:
            typeMatch[1]!
              .normalize("NFD")
              .replace(/\p{M}/gu, "")
              .toLocaleLowerCase("pt-BR") === "ciclico"
              ? "recurring"
              : "one_off",
        }
      : {}),
  };
}

function projectContractType(
  command: AssistantCommand,
): "one_off" | "recurring" | undefined {
  const value = optionalText(command, "contractType");
  if (!value) return undefined;
  return contractTypeFromText(value);
}

function contractTypeFromText(value: string): "one_off" | "recurring" {
  const normalized = value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLocaleLowerCase("pt-BR");
  if (["recurring", "recorrente", "ciclico"].includes(normalized)) {
    return "recurring";
  }
  if (["one_off", "pontual"].includes(normalized)) return "one_off";
  throw new Error("data.contractType precisa ser “cíclico” ou “pontual”.");
}

function deliveryTasks(command: AssistantCommand):
  | Array<{
      name: string;
      durationMinutes: number;
      executionAt?: string | null;
      status?: string;
    }>
  | undefined {
  const value = command.data.tasks;
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || !value.length || value.length > 10) {
    throw new Error("data.tasks precisa conter entre 1 e 10 tarefas.");
  }
  return value.map((task, index) => {
    if (!task || typeof task !== "object" || Array.isArray(task)) {
      throw new Error(`data.tasks[${index}] não é válida.`);
    }
    const item = task as Record<string, unknown>;
    if (typeof item.name !== "string" || !item.name.trim()) {
      throw new Error(`data.tasks[${index}].name é obrigatório.`);
    }
    const durationMinutes = item.durationMinutes ?? 60;
    if (
      typeof durationMinutes !== "number" ||
      !Number.isInteger(durationMinutes) ||
      durationMinutes < 30 ||
      durationMinutes > 10_080 ||
      durationMinutes % 30 !== 0
    ) {
      throw new Error(
        `data.tasks[${index}].durationMinutes precisa ser múltiplo de 30.`,
      );
    }
    const executionAt = item.executionAt;
    if (
      executionAt !== undefined &&
      executionAt !== null &&
      (typeof executionAt !== "string" || Number.isNaN(Date.parse(executionAt)))
    ) {
      throw new Error(
        `data.tasks[${index}].executionAt precisa ser uma data ISO v\u00e1lida.`,
      );
    }
    if (
      item.status !== undefined &&
      (typeof item.status !== "string" || !item.status.trim())
    ) {
      throw new Error(
        `data.tasks[${index}].status precisa ser um texto v\u00e1lido.`,
      );
    }
    return {
      name: cleanName(item.name),
      durationMinutes,
      ...(executionAt !== undefined
        ? { executionAt: executionAt as string | null }
        : {}),
      ...(typeof item.status === "string"
        ? { status: cleanName(item.status) }
        : {}),
    };
  });
}

function requiredAmountCents(
  command: AssistantCommand,
  key = "amountCents",
): number {
  const value = command.data[key];
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    throw new Error(`data.${key} precisa ser um valor inteiro em centavos.`);
  }
  return value;
}

function optionalDate(
  command: AssistantCommand,
  key: string,
): string | undefined {
  const value = optionalText(command, key);
  if (value && !/^\d{4}-\d{2}-\d{2}$/u.test(value)) {
    throw new Error(`data.${key} precisa usar o formato AAAA-MM-DD.`);
  }
  return value;
}

function optionalStringArray(
  command: AssistantCommand,
  key: string,
): string[] | undefined {
  const value = command.data[key];
  if (value === undefined) return undefined;
  if (
    !Array.isArray(value) ||
    !value.every((item) => typeof item === "string" && item.trim())
  ) {
    throw new Error(
      `data.${key} precisa ser uma lista de textos v\u00e1lidos.`,
    );
  }
  return value.map((item) => cleanName(item));
}

function optionalUuidArray(
  command: AssistantCommand,
  key: string,
): string[] | undefined {
  const values = optionalStringArray(command, key);
  if (
    values &&
    !values.every((item) =>
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(
        item,
      ),
    )
  ) {
    throw new Error(`data.${key} precisa conter UUIDs v\u00e1lidos.`);
  }
  return values;
}

function optionalEnum<T extends string>(
  command: AssistantCommand,
  key: string,
  values: readonly T[],
): T | undefined {
  const value = optionalText(command, key);
  if (value === undefined) return undefined;
  if (!values.includes(value as T)) {
    throw new Error(
      `data.${key} precisa ser um destes valores: ${values.join(", ")}.`,
    );
  }
  return value as T;
}

function optionalNotes(
  command: AssistantCommand,
): Array<{ body: string }> | undefined {
  const value = command.data.notes;
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.length > 20)
    throw new Error(
      "data.notes precisa conter no m\u00e1ximo 20 anota\u00e7\u00f5es.",
    );
  return value.map((item, index) => {
    if (
      !item ||
      typeof item !== "object" ||
      Array.isArray(item) ||
      typeof (item as Record<string, unknown>).body !== "string"
    ) {
      throw new Error(
        `data.notes[${index}].body precisa ser um texto v\u00e1lido.`,
      );
    }
    return { body: cleanName((item as { body: string }).body) };
  });
}

function optionalContactPhones(command: AssistantCommand) {
  const value = command.data.phones;
  if (value === undefined) return undefined;
  const types = ["mobile", "whatsapp", "work", "home", "other"] as const;
  if (!Array.isArray(value) || value.length > 10)
    throw new Error("data.phones precisa conter no m\u00e1ximo 10 telefones.");
  return value.map((item, index) => {
    const entry = item as Record<string, unknown>;
    if (
      !item ||
      typeof item !== "object" ||
      Array.isArray(item) ||
      typeof entry.value !== "string" ||
      !entry.value.trim()
    )
      throw new Error(`data.phones[${index}].value \u00e9 obrigat\u00f3rio.`);
    if (
      typeof entry.type !== "string" ||
      !types.includes(entry.type as (typeof types)[number])
    )
      throw new Error(`data.phones[${index}].type \u00e9 inv\u00e1lido.`);
    if (entry.label !== undefined && typeof entry.label !== "string")
      throw new Error(`data.phones[${index}].label \u00e9 inv\u00e1lido.`);
    if (entry.isPrimary !== undefined && typeof entry.isPrimary !== "boolean")
      throw new Error(`data.phones[${index}].isPrimary \u00e9 inv\u00e1lido.`);
    return {
      type: entry.type as (typeof types)[number],
      label: typeof entry.label === "string" ? cleanName(entry.label) : "",
      value: cleanName(entry.value),
      isPrimary: entry.isPrimary === true,
    };
  });
}

function optionalContactEmails(command: AssistantCommand) {
  const value = command.data.emails;
  if (value === undefined) return undefined;
  const types = ["personal", "work", "other"] as const;
  if (!Array.isArray(value) || value.length > 10)
    throw new Error("data.emails precisa conter no m\u00e1ximo 10 e-mails.");
  return value.map((item, index) => {
    const entry = item as Record<string, unknown>;
    if (
      !item ||
      typeof item !== "object" ||
      Array.isArray(item) ||
      typeof entry.value !== "string" ||
      !entry.value.trim()
    )
      throw new Error(`data.emails[${index}].value \u00e9 obrigat\u00f3rio.`);
    if (
      typeof entry.type !== "string" ||
      !types.includes(entry.type as (typeof types)[number])
    )
      throw new Error(`data.emails[${index}].type \u00e9 inv\u00e1lido.`);
    if (entry.label !== undefined && typeof entry.label !== "string")
      throw new Error(`data.emails[${index}].label \u00e9 inv\u00e1lido.`);
    if (entry.isPrimary !== undefined && typeof entry.isPrimary !== "boolean")
      throw new Error(`data.emails[${index}].isPrimary \u00e9 inv\u00e1lido.`);
    return {
      type: entry.type as (typeof types)[number],
      label: typeof entry.label === "string" ? cleanName(entry.label) : "",
      value: cleanName(entry.value),
      isPrimary: entry.isPrimary === true,
    };
  });
}

function optionalInstallments(command: AssistantCommand) {
  const value = command.data.installments;
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.length > 99)
    throw new Error(
      "data.installments precisa conter no m\u00e1ximo 99 parcelas.",
    );
  return value.map((item, index) => {
    const entry = item as Record<string, unknown>;
    if (
      !item ||
      typeof item !== "object" ||
      Array.isArray(item) ||
      typeof entry.number !== "number" ||
      !Number.isInteger(entry.number) ||
      entry.number < 1 ||
      typeof entry.amountCents !== "number" ||
      !Number.isInteger(entry.amountCents) ||
      entry.amountCents < 0 ||
      typeof entry.dueDate !== "string" ||
      !/^\d{4}-\d{2}-\d{2}$/u.test(entry.dueDate) ||
      typeof entry.status !== "string" ||
      !entry.status.trim()
    ) {
      throw new Error(
        `data.installments[${index}] precisa ter number, dueDate, amountCents e status v\u00e1lidos.`,
      );
    }
    return {
      number: entry.number,
      dueDate: entry.dueDate,
      amountCents: entry.amountCents,
      status: cleanName(entry.status),
    };
  });
}

function compileStructuredCommand(command: AssistantCommand): RecordCommand {
  const entry = catalogEntry(command.resource);
  if (!entry.implemented.includes(command.action)) {
    throw new Error(
      `O comando ${command.action} para ${entry.label} ainda não está disponível no assistente.`,
    );
  }
  if (command.action !== "create") {
    throw new Error(`Ação não compilada: ${command.action}.`);
  }

  switch (command.resource) {
    case "workspace":
      return {
        kind: "workspace",
        name: requiredText(command, "name"),
        ...(optionalText(command, "description")
          ? { description: optionalText(command, "description") }
          : {}),
      };
    case "contact": {
      requireOnlyData(command, [
        "name",
        "contactType",
        "status",
        "profession",
        "phones",
        "emails",
        "notes",
      ]);
      const type = optionalEnum(command, "contactType", [
        "person",
        "company",
        "other",
      ]);
      const statusText = optionalText(command, "status");
      return {
        kind: "contact",
        name: requiredText(command, "name"),
        ...(type ? { contactType: type } : {}),
        ...(statusText ? { status: contactStatus(statusText) } : {}),
        ...(optionalText(command, "profession")
          ? { profession: optionalText(command, "profession") }
          : {}),
        ...(optionalContactPhones(command)
          ? { phones: optionalContactPhones(command) }
          : {}),
        ...(optionalContactEmails(command)
          ? { emails: optionalContactEmails(command) }
          : {}),
        ...(optionalNotes(command) ? { notes: optionalNotes(command) } : {}),
      };
    }
    case "business": {
      requireOnlyData(command, [
        "name",
        "responsibleContactName",
        "responsibleContactNames",
        "responsibleContactRef",
        "category",
        "stage",
        "notes",
      ]);
      const contact = {
        name: optionalText(command, "responsibleContactName"),
        reference: optionalText(command, "responsibleContactRef"),
      };
      const contactNames = optionalStringArray(
        command,
        "responsibleContactNames",
      );
      if (contactNames && (contact.name || contact.reference)) {
        throw new Error(
          "Informe responsáveis por data.responsibleContactNames ou pelo campo singular, não ambos.",
        );
      }
      if (!contactNames && !contact.name && !contact.reference) {
        throw new Error("Informe ao menos um responsável para o negócio.");
      }
      return {
        kind: "business",
        name: requiredText(command, "name"),
        ...(contact.name ? { contactName: contact.name } : {}),
        ...(contactNames ? { contactNames } : {}),
        ...(contact.reference ? { contactRef: contact.reference } : {}),
        ...(optionalText(command, "category")
          ? { category: optionalText(command, "category") }
          : {}),
        ...(optionalText(command, "stage")
          ? { stage: businessStage(optionalText(command, "stage")!) }
          : {}),
        ...(optionalNotes(command) ? { notes: optionalNotes(command) } : {}),
      };
    }
    case "project": {
      requireOnlyData(command, [
        "name",
        "contractName",
        "contractRef",
        "contractType",
        "serviceIds",
        "status",
        "startDate",
        "endDate",
        "engagementType",
        "briefing",
        "tagLabels",
        "responsibleUserIds",
        "amountCents",
        "firstDueDate",
        "paymentMethod",
        "paymentTerms",
        "financeNotes",
        "installments",
      ]);
      const contract = requiredTextOrReference(
        command,
        "contractName",
        "contractRef",
      );
      const contractType = projectContractType(command);
      return {
        kind: "project",
        name: requiredText(command, "name"),
        ...(contract.name ? { contractName: contract.name } : {}),
        ...(contract.reference ? { contractRef: contract.reference } : {}),
        ...(contractType ? { contractType } : {}),
        ...(optionalUuidArray(command, "serviceIds")
          ? { serviceIds: optionalUuidArray(command, "serviceIds") }
          : {}),
        ...(optionalText(command, "status")
          ? { status: optionalText(command, "status") }
          : {}),
        ...(optionalDate(command, "startDate")
          ? { startDate: optionalDate(command, "startDate") }
          : {}),
        ...(optionalDate(command, "endDate")
          ? { endDate: optionalDate(command, "endDate") }
          : {}),
        ...(optionalEnum(command, "engagementType", ["fee", "personal"])
          ? {
              engagementType: optionalEnum(command, "engagementType", [
                "fee",
                "personal",
              ]),
            }
          : {}),
        ...(optionalText(command, "briefing")
          ? { briefing: optionalText(command, "briefing") }
          : {}),
        ...(optionalStringArray(command, "tagLabels")
          ? { tagLabels: optionalStringArray(command, "tagLabels") }
          : {}),
        ...(optionalUuidArray(command, "responsibleUserIds")
          ? {
              responsibleUserIds: optionalUuidArray(
                command,
                "responsibleUserIds",
              ),
            }
          : {}),
        ...(command.data.amountCents !== undefined
          ? { amountCents: requiredAmountCents(command) }
          : {}),
        ...(optionalDate(command, "firstDueDate")
          ? { firstDueDate: optionalDate(command, "firstDueDate") }
          : {}),
        ...(optionalText(command, "paymentMethod")
          ? { paymentMethod: optionalText(command, "paymentMethod") }
          : {}),
        ...(optionalText(command, "paymentTerms")
          ? { paymentTerms: optionalText(command, "paymentTerms") }
          : {}),
        ...(optionalText(command, "financeNotes")
          ? { financeNotes: optionalText(command, "financeNotes") }
          : {}),
        ...(optionalInstallments(command)
          ? { installments: optionalInstallments(command) }
          : {}),
      };
    }
    case "delivery": {
      requireOnlyData(command, [
        "name",
        "projectName",
        "projectRef",
        "tasks",
        "category",
        "priority",
        "status",
        "briefing",
        "dueDate",
        "engagementType",
        "tagLabels",
        "responsibleUserIds",
      ]);
      const project = requiredTextOrReference(
        command,
        "projectName",
        "projectRef",
      );
      const tasks = deliveryTasks(command);
      return {
        kind: "delivery",
        name: requiredText(command, "name"),
        ...(project.name ? { projectName: project.name } : {}),
        ...(project.reference ? { projectRef: project.reference } : {}),
        ...(tasks ? { tasks } : {}),
        ...(optionalText(command, "category")
          ? { category: optionalText(command, "category") }
          : {}),
        ...(optionalText(command, "priority")
          ? { priority: optionalText(command, "priority") }
          : {}),
        ...(optionalText(command, "status")
          ? { status: optionalText(command, "status") }
          : {}),
        ...(optionalText(command, "briefing")
          ? { briefing: optionalText(command, "briefing") }
          : {}),
        ...(optionalDate(command, "dueDate")
          ? { dueDate: optionalDate(command, "dueDate") }
          : {}),
        ...(optionalEnum(command, "engagementType", ["fee", "personal"])
          ? {
              engagementType: optionalEnum(command, "engagementType", [
                "fee",
                "personal",
              ]),
            }
          : {}),
        ...(optionalStringArray(command, "tagLabels")
          ? { tagLabels: optionalStringArray(command, "tagLabels") }
          : {}),
        ...(optionalUuidArray(command, "responsibleUserIds")
          ? {
              responsibleUserIds: optionalUuidArray(
                command,
                "responsibleUserIds",
              ),
            }
          : {}),
      };
    }
    case "service_template":
      return {
        kind: "service_template",
        name: requiredText(command, "name"),
        ...(optionalText(command, "briefing")
          ? { briefing: optionalText(command, "briefing") }
          : {}),
        ...(optionalText(command, "duration")
          ? { duration: optionalText(command, "duration") }
          : {}),
      };
    case "delivery_template": {
      const tasks = deliveryTasks(command);
      return {
        kind: "delivery_template",
        name: requiredText(command, "name"),
        ...(optionalText(command, "serviceTemplateRef")
          ? { serviceTemplateRef: optionalText(command, "serviceTemplateRef") }
          : {}),
        ...(optionalText(command, "briefing")
          ? { briefing: optionalText(command, "briefing") }
          : {}),
        ...(tasks ? { tasks } : {}),
      };
    }
    case "service":
      return {
        kind: "service",
        name: requiredText(command, "name"),
        ...(optionalText(command, "description")
          ? { description: optionalText(command, "description") }
          : {}),
      };
    case "contract": {
      requireOnlyData(command, [
        "name",
        "businessName",
        "businessRef",
        "contractType",
        "amountCents",
        "startDate",
        "endDate",
        "firstDueDate",
        "paymentMethod",
        "paymentTerms",
        "financeNotes",
        "installments",
      ]);
      const business = requiredTextOrReference(
        command,
        "businessName",
        "businessRef",
      );
      const type = projectContractType(command) ?? "one_off";
      const amountCents = requiredAmountCents(command);
      const firstDueDate = optionalDate(command, "firstDueDate");
      if (type === "one_off" && amountCents > 0 && !firstDueDate) {
        throw new Error(
          "data.firstDueDate é obrigatória para um contrato pontual com valor.",
        );
      }
      return {
        kind: "contract",
        name: requiredText(command, "name"),
        ...(business.name ? { businessName: business.name } : {}),
        ...(business.reference ? { businessRef: business.reference } : {}),
        contractType: type,
        amountCents,
        ...(optionalDate(command, "startDate")
          ? { startDate: optionalDate(command, "startDate") }
          : {}),
        ...(optionalDate(command, "endDate")
          ? { endDate: optionalDate(command, "endDate") }
          : {}),
        ...(firstDueDate ? { firstDueDate } : {}),
        ...(optionalText(command, "paymentMethod")
          ? { paymentMethod: optionalText(command, "paymentMethod") }
          : {}),
        ...(optionalText(command, "paymentTerms")
          ? { paymentTerms: optionalText(command, "paymentTerms") }
          : {}),
        ...(optionalText(command, "financeNotes")
          ? { financeNotes: optionalText(command, "financeNotes") }
          : {}),
        ...(optionalInstallments(command)
          ? { installments: optionalInstallments(command) }
          : {}),
      };
    }
    case "finance_entry": {
      const type = optionalText(command, "type")?.toLocaleLowerCase("pt-BR");
      if (
        type !== "revenue" &&
        type !== "expense" &&
        type !== "receita" &&
        type !== "despesa"
      ) {
        throw new Error(
          "data.type precisa ser receita/revenue ou despesa/expense.",
        );
      }
      const mode = optionalText(command, "mode")?.toLocaleLowerCase("pt-BR");
      if (
        mode &&
        !["one_off", "recurring", "pontual", "recorrente"].includes(mode)
      ) {
        throw new Error("data.mode precisa ser pontual ou recorrente.");
      }
      const rawRecurrenceCount = command.data.recurrenceCount;
      if (
        rawRecurrenceCount !== undefined &&
        (typeof rawRecurrenceCount !== "number" ||
          !Number.isInteger(rawRecurrenceCount) ||
          rawRecurrenceCount < 1 ||
          rawRecurrenceCount > 120)
      ) {
        throw new Error(
          "data.recurrenceCount precisa ser um inteiro entre 1 e 120.",
        );
      }
      const recurrenceCount = rawRecurrenceCount as number | undefined;
      return {
        kind: "finance_entry",
        name: requiredText(command, "name"),
        type:
          type === "receita"
            ? "revenue"
            : type === "despesa"
              ? "expense"
              : type,
        amountCents: requiredAmountCents(command),
        dueDate:
          optionalDate(command, "dueDate") ??
          (() => {
            throw new Error("data.dueDate é obrigatória.");
          })(),
        ...(optionalText(command, "category")
          ? { category: optionalText(command, "category") }
          : {}),
        ...(mode
          ? {
              mode:
                mode === "recorrente"
                  ? "recurring"
                  : mode === "pontual"
                    ? "one_off"
                    : (mode as "one_off" | "recurring"),
            }
          : {}),
        ...(recurrenceCount !== undefined ? { recurrenceCount } : {}),
      };
    }
    default:
      throw new Error(`Recurso ainda não compilado: ${command.resource}.`);
  }
}

function parseStructuredDocument(input: string): ParseRecordCommandsResult {
  let raw: unknown;
  try {
    raw = JSON.parse(input);
  } catch {
    return { ok: false, message: "O bloco JSON de comandos não é válido." };
  }
  const parsed = assistantCommandDocumentSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      message:
        "O documento de comandos não segue os protocolos demanda.commands/v1 ou demanda.commands/v2.",
    };
  }
  try {
    const commands = parsed.data.commands.map(compileStructuredCommand);
    return {
      ok: true,
      commands,
      queueCommands: parsed.data.commands.map((command, index) => ({
        id: command.id,
        command: commands[index]!,
        dependsOn: command.dependsOn,
      })),
    };
  } catch (cause) {
    return {
      ok: false,
      message:
        cause instanceof Error
          ? cause.message
          : "Não foi possível preparar os comandos estruturados.",
    };
  }
}

export function parseRecordCommands(input: string): ParseRecordCommandsResult {
  const cleanedInput = input
    .replace(/```(?:json|text|plaintext)?/giu, "")
    .trim();
  if (cleanedInput.startsWith("{"))
    return parseStructuredDocument(cleanedInput);

  const lines = cleanedInput
    .split(/\r?\n/gu)
    .map((line) => line.trim())
    .filter(Boolean);

  if (!lines.length)
    return { ok: false, message: "Escreva ao menos um comando." };

  const commands: RecordCommand[] = [];
  for (const [index, line] of lines.entries()) {
    const parsed = parseCanonicalCommand(line) ?? parseRecordCommand(line);
    if (!parsed.ok) {
      return { ok: false, message: `Linha ${index + 1}: ${parsed.message}` };
    }
    commands.push(parsed.command);
  }
  return { ok: true, commands };
}
