import {
  assistantCommandDocumentSchema,
  type AssistantCommand,
} from "./command-contract";
import { catalogEntry } from "./command-catalog";
import type { QueuedRecordCommand } from "./execution-queue";

export type RecordCommand =
  | { kind: "contact"; name: string }
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
      kind: "task";
      name: string;
      projectName?: string;
      projectRef?: string;
      subtasks?: Array<{ name: string; durationMinutes: number }>;
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
      subtasks?: Array<{ name: string; durationMinutes: number }>;
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
      `^${action}\\s+${article}\\s*contato\\s+(?:chamad[oa]\\s+)?(.+?)$`,
      "iu",
    ),
    text,
  );
  if (contact)
    return { ok: true, command: { kind: "contact", name: contact[0]! } };

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

  const task = capture(
    new RegExp(
      `^${action}\\s+${article}\\s*tarefa\\s+(?:chamad[oa]\\s+)?(.+?)\\s+(?:para|do|da|no|na)\\s+(?:projeto\\s+)?(.+?)$`,
      "iu",
    ),
    text,
  );
  if (task) {
    return {
      ok: true,
      command: { kind: "task", name: task[0]!, projectName: task[1]! },
    };
  }

  return {
    ok: false,
    message:
      "Por enquanto consigo registrar contatos, negócios, projetos e tarefas. Experimente: “Crie um negócio chamado Macajo para Caleb”.",
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

  const task = capture(
    /^CRIE\s+TAREFA:\s*(.+?)\s*\|\s*PROJETO:\s*(.+?)$/iu,
    input,
  );
  if (task) {
    return {
      ok: true,
      command: { kind: "task", name: task[0]!, projectName: task[1]! },
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

function taskSubtasks(
  command: AssistantCommand,
): Array<{ name: string; durationMinutes: number }> | undefined {
  const value = command.data.subtasks;
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || !value.length || value.length > 10) {
    throw new Error("data.subtasks precisa conter entre 1 e 10 subtarefas.");
  }
  return value.map((subtask, index) => {
    if (!subtask || typeof subtask !== "object" || Array.isArray(subtask)) {
      throw new Error(`data.subtasks[${index}] não é válida.`);
    }
    const item = subtask as Record<string, unknown>;
    if (typeof item.name !== "string" || !item.name.trim()) {
      throw new Error(`data.subtasks[${index}].name é obrigatório.`);
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
        `data.subtasks[${index}].durationMinutes precisa ser múltiplo de 30.`,
      );
    }
    return { name: cleanName(item.name), durationMinutes };
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
    case "task": {
      const project = requiredTextOrReference(
        command,
        "projectName",
        "projectRef",
      );
      const subtasks = taskSubtasks(command);
      return {
        kind: "task",
        name: requiredText(command, "name"),
        ...(project.name ? { projectName: project.name } : {}),
        ...(project.reference ? { projectRef: project.reference } : {}),
        ...(subtasks ? { subtasks } : {}),
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
      const subtasks = taskSubtasks(command);
      return {
        kind: "delivery_template",
        name: requiredText(command, "name"),
        ...(optionalText(command, "serviceTemplateRef")
          ? { serviceTemplateRef: optionalText(command, "serviceTemplateRef") }
          : {}),
        ...(optionalText(command, "briefing")
          ? { briefing: optionalText(command, "briefing") }
          : {}),
        ...(subtasks ? { subtasks } : {}),
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
