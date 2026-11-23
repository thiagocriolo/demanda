import {
  assistantCommandDocumentSchema,
  type AssistantCommand,
} from "./command-contract";
import { catalogEntry } from "./command-catalog";
import type { QueuedRecordCommand } from "./execution-queue";

export type RecordCommand =
  | { kind: "contact"; name: string }
  | { kind: "workspace"; name: string; description?: string }
  | {
      kind: "business";
      name: string;
      contactName?: string;
      contactRef?: string;
    }
  | {
      kind: "project";
      name: string;
      businessName?: string;
      businessRef?: string;
      contractType?: "one_off" | "recurring";
    }
  | {
      kind: "delivery";
      name: string;
      projectName?: string;
      projectRef?: string;
      tasks?: Array<{ name: string; durationMinutes: number }>;
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
    new RegExp(`^${action}\\s+${article}\\s*workspace\\s+(?:chamad[oa]\\s+)?(.+?)$`, "iu"),
    text,
  );
  if (workspace) return { ok: true, command: { kind: "workspace", name: workspace[0]! } };

  const service = capture(
    new RegExp(`^${action}\\s+${article}\\s*servi[cç]o\\s+(?:chamad[oa]\\s+)?(.+?)$`, "iu"),
    text,
  );
  if (service) return { ok: true, command: { kind: "service", name: service[0]! } };

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
    new RegExp(`^${action}\\s+${article}\\s*contrato\\s+(?:chamad[oa]\\s+)?(.+?)\\s+(?:para|do|da)\\s+(?:neg[oó]cio\\s+)?(.+?)$`, "iu"),
    text,
  );
  if (contract) {
    return { ok: true, command: { kind: "contract", name: contract[0]!, businessName: contract[1]!, contractType: "one_off", amountCents: 0 } };
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
      command: { kind: "delivery", name: delivery[0]!, projectName: delivery[1]! },
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
  if (contact)
    return { ok: true, command: { kind: "contact", name: contact[0]! } };

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
      command: { kind: "delivery", name: delivery[0]!, projectName: delivery[1]! },
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
  const normalized = value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLocaleLowerCase("pt-BR");
  if (["recurring", "recorrente", "ciclico"].includes(normalized)) {
    return "recurring";
  }
  if (["one_off", "pontual"].includes(normalized)) return "one_off";
  throw new Error(
    "data.contractType precisa ser “cíclico” ou “pontual”.",
  );
}

function deliveryTasks(
  command: AssistantCommand,
): Array<{ name: string; durationMinutes: number }> | undefined {
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
    return { name: cleanName(item.name), durationMinutes };
  });
}

function requiredAmountCents(command: AssistantCommand, key = "amountCents"): number {
  const value = command.data[key];
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    throw new Error(`data.${key} precisa ser um valor inteiro em centavos.`);
  }
  return value;
}

function optionalDate(command: AssistantCommand, key: string): string | undefined {
  const value = optionalText(command, key);
  if (value && !/^\d{4}-\d{2}-\d{2}$/u.test(value)) {
    throw new Error(`data.${key} precisa usar o formato AAAA-MM-DD.`);
  }
  return value;
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
    case "contact":
      return { kind: "contact", name: requiredText(command, "name") };
    case "business": {
      const contact = requiredTextOrReference(
        command,
        "responsibleContactName",
        "responsibleContactRef",
      );
      return {
        kind: "business",
        name: requiredText(command, "name"),
        ...(contact.name ? { contactName: contact.name } : {}),
        ...(contact.reference ? { contactRef: contact.reference } : {}),
      };
    }
    case "project": {
      const business = requiredTextOrReference(
        command,
        "businessName",
        "businessRef",
      );
      const contractType = projectContractType(command);
      return {
        kind: "project",
        name: requiredText(command, "name"),
        ...(business.name ? { businessName: business.name } : {}),
        ...(business.reference ? { businessRef: business.reference } : {}),
        ...(contractType ? { contractType } : {}),
      };
    }
    case "delivery": {
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
      const business = requiredTextOrReference(command, "businessName", "businessRef");
      const type = projectContractType(command) ?? "one_off";
      const amountCents = requiredAmountCents(command);
      const firstDueDate = optionalDate(command, "firstDueDate");
      if (type === "one_off" && amountCents > 0 && !firstDueDate) {
        throw new Error("data.firstDueDate é obrigatória para um contrato pontual com valor.");
      }
      return {
        kind: "contract",
        name: requiredText(command, "name"),
        ...(business.name ? { businessName: business.name } : {}),
        ...(business.reference ? { businessRef: business.reference } : {}),
        contractType: type,
        amountCents,
        ...(optionalDate(command, "startDate") ? { startDate: optionalDate(command, "startDate") } : {}),
        ...(optionalDate(command, "endDate") ? { endDate: optionalDate(command, "endDate") } : {}),
        ...(firstDueDate ? { firstDueDate } : {}),
      };
    }
    case "finance_entry": {
      const type = optionalText(command, "type")?.toLocaleLowerCase("pt-BR");
      if (type !== "revenue" && type !== "expense" && type !== "receita" && type !== "despesa") {
        throw new Error("data.type precisa ser receita/revenue ou despesa/expense.");
      }
      const mode = optionalText(command, "mode")?.toLocaleLowerCase("pt-BR");
      if (mode && !["one_off", "recurring", "pontual", "recorrente"].includes(mode)) {
        throw new Error("data.mode precisa ser pontual ou recorrente.");
      }
      const rawRecurrenceCount = command.data.recurrenceCount;
      if (rawRecurrenceCount !== undefined && (typeof rawRecurrenceCount !== "number" || !Number.isInteger(rawRecurrenceCount) || rawRecurrenceCount < 1 || rawRecurrenceCount > 120)) {
        throw new Error("data.recurrenceCount precisa ser um inteiro entre 1 e 120.");
      }
      const recurrenceCount = rawRecurrenceCount as number | undefined;
      return {
        kind: "finance_entry",
        name: requiredText(command, "name"),
        type: type === "receita" ? "revenue" : type === "despesa" ? "expense" : type,
        amountCents: requiredAmountCents(command),
        dueDate: optionalDate(command, "dueDate") ?? (() => { throw new Error("data.dueDate é obrigatória."); })(),
        ...(optionalText(command, "category") ? { category: optionalText(command, "category") } : {}),
        ...(mode ? { mode: mode === "recorrente" ? "recurring" : mode === "pontual" ? "one_off" : mode as "one_off" | "recurring" } : {}),
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
