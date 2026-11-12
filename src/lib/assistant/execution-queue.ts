import type {
  RecordActionResult,
  RecordCommandExecutionContext,
} from "./record-actions";
import type { RecordCommand } from "./record-commands";

export type QueuedRecordCommand = {
  id: string;
  command: RecordCommand;
  dependsOn?: string[];
};

export type CompiledQueueCommand = {
  id: string;
  command: RecordCommand;
  dependsOn: string[];
};

export type QueueCommandStatus =
  | "pending"
  | "running"
  | "succeeded"
  | "failed"
  | "needs_resolution"
  | "blocked";

export type QueueCommandProgress = {
  id: string;
  command: RecordCommand;
  dependsOn: string[];
  status: QueueCommandStatus;
  message?: string;
  created?: RecordActionResult["created"];
  output?: RecordActionResult["output"];
  resolutionOptions?: Array<{ id: string; label: string }>;
};

export type QueueExecutionResult = {
  progress: QueueCommandProgress[];
  message: string;
  created: RecordActionResult["created"];
};

export type QueueCommandExecutor = (
  command: RecordCommand,
  context: RecordCommandExecutionContext,
) => Promise<RecordActionResult>;

function nameKey(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .trim()
    .replace(/\s+/gu, " ")
    .toLocaleLowerCase("pt-BR");
}

function commandLabel(command: RecordCommand): string {
  const labels = {
    contact: "Contato",
    business: "Negócio",
    project: "Projeto",
    task: "Tarefa",
    service_template: "Modelo de serviço",
    delivery_template: "Modelo de entrega",
  } as const;
  return `${labels[command.kind]}: ${command.name}`;
}

function isResolutionRequiredError(
  cause: unknown,
): cause is Error & { options: Array<{ id: string; label: string }> } {
  return (
    cause instanceof Error &&
    cause.name === "RecordResolutionRequiredError" &&
    "options" in cause &&
    Array.isArray(cause.options)
  );
}

function commandReference(command: RecordCommand): string | undefined {
  if (command.kind === "business") return command.contactRef;
  if (command.kind === "project") return command.businessRef;
  if (command.kind === "task") return command.projectRef;
  if (command.kind === "delivery_template") return command.serviceTemplateRef;
  return undefined;
}

function expectedParentKind(
  command: RecordCommand,
): RecordCommand["kind"] | undefined {
  if (command.kind === "business") return "contact";
  if (command.kind === "project") return "business";
  if (command.kind === "task") return "project";
  if (command.kind === "delivery_template") return "service_template";
  return undefined;
}

function inferredDependency(
  command: RecordCommand,
  commands: QueuedRecordCommand[],
  explicitDependencies: string[],
): string | undefined {
  const reference = commandReference(command);
  if (reference) return reference;

  const parent =
    command.kind === "business" && command.contactName
      ? { kind: "contact" as const, name: command.contactName }
      : command.kind === "project" && command.businessName
        ? { kind: "business" as const, name: command.businessName }
        : command.kind === "task" && command.projectName
          ? { kind: "project" as const, name: command.projectName }
          : undefined;
  if (!parent) return undefined;

  const matches = commands.filter(
    (candidate) =>
      candidate.command.kind === parent.kind &&
      nameKey(candidate.command.name) === nameKey(parent.name),
  );
  if (matches.length > 1) {
    const explicitParent = matches.filter((item) =>
      explicitDependencies.includes(item.id),
    );
    if (explicitParent.length === 1) return undefined;
    throw new Error(
      `Não foi possível determinar de qual ${parent.kind} depende “${command.name}”: há mais de um comando com o nome “${parent.name}”. Use dependsOn ou uma referência de comando.`,
    );
  }
  return matches[0]?.id;
}

/** Validates the graph and resolves dependencies stated by names or command IDs. */
export function compileRecordCommandQueue(
  commands: QueuedRecordCommand[],
): CompiledQueueCommand[] {
  const ids = new Set<string>();
  for (const item of commands) {
    if (!item.id.trim()) throw new Error("Todo comando precisa de um id.");
    if (ids.has(item.id))
      throw new Error(`O id de comando “${item.id}” foi repetido.`);
    ids.add(item.id);
  }

  const compiled = commands.map((item) => {
    const explicitDependencies = item.dependsOn ?? [];
    const inferred = inferredDependency(
      item.command,
      commands,
      explicitDependencies,
    );
    const dependsOn = [
      ...new Set([...explicitDependencies, ...(inferred ? [inferred] : [])]),
    ];
    if (dependsOn.includes(item.id)) {
      throw new Error(`O comando “${item.id}” não pode depender de si mesmo.`);
    }
    for (const dependency of dependsOn) {
      if (!ids.has(dependency)) {
        throw new Error(
          `O comando “${item.id}” depende de “${dependency}”, que não existe no lote.`,
        );
      }
    }
    const reference = commandReference(item.command);
    const expectedKind = expectedParentKind(item.command);
    if (reference && expectedKind) {
      const parent = commands.find(({ id }) => id === reference);
      if (parent?.command.kind !== expectedKind) {
        throw new Error(
          `O vínculo “${reference}” de “${item.id}” precisa apontar para um comando de ${expectedKind}.`,
        );
      }
    }
    return { id: item.id, command: item.command, dependsOn };
  });

  const pending = new Set(compiled.map(({ id }) => id));
  const resolved = new Set<string>();
  while (pending.size) {
    const ready = compiled.filter(
      ({ id, dependsOn }) =>
        pending.has(id) &&
        dependsOn.every((dependency) => resolved.has(dependency)),
    );
    if (!ready.length)
      throw new Error("As dependências dos comandos formam um ciclo.");
    for (const item of ready) {
      pending.delete(item.id);
      resolved.add(item.id);
    }
  }
  return compiled;
}

function resultMessage(progress: QueueCommandProgress[]): string {
  const lines = progress.map((item) => {
    const label = commandLabel(item.command);
    if (item.status === "succeeded") return `✓ ${label}: ${item.message}`;
    if (item.status === "failed") return `✕ ${label}: ${item.message}`;
    if (item.status === "needs_resolution")
      return `? ${label}: ${item.message}`;
    if (item.status === "blocked") return `⊘ ${label}: ${item.message}`;
    return `• ${label}: pendente.`;
  });
  const count = (status: QueueCommandStatus): number =>
    progress.filter((item) => item.status === status).length;
  return [
    `Execução concluída: ${count("succeeded")} concluído(s), ${count("failed")} falhou/falharam, ${count("needs_resolution")} aguardando decisão e ${count("blocked")} bloqueado(s).`,
    ...lines,
  ].join("\n");
}

/** Executes ready branches together and only stops descendants of a problem. */
export async function executeCompiledRecordCommandQueue(
  queue: CompiledQueueCommand[],
  execute: QueueCommandExecutor,
  onProgress?: (progress: QueueCommandProgress[]) => void,
): Promise<QueueExecutionResult> {
  const progress = queue.map<QueueCommandProgress>((item) => ({
    ...item,
    status: "pending",
  }));
  const byId = new Map(progress.map((item) => [item.id, item]));
  const notify = (): void => onProgress?.([...progress]);
  notify();

  while (progress.some(({ status }) => status === "pending")) {
    let changed = false;
    for (const item of progress.filter(({ status }) => status === "pending")) {
      const stoppedDependency = item.dependsOn.find((dependency) => {
        const status = byId.get(dependency)?.status;
        return (
          status === "failed" ||
          status === "needs_resolution" ||
          status === "blocked"
        );
      });
      if (stoppedDependency) {
        item.status = "blocked";
        item.message = `Bloqueado porque “${stoppedDependency}” não foi concluído.`;
        changed = true;
      }
    }
    if (changed) notify();

    const ready = progress.filter(
      ({ status, dependsOn }) =>
        status === "pending" &&
        dependsOn.every(
          (dependency) => byId.get(dependency)?.status === "succeeded",
        ),
    );
    if (!ready.length) {
      for (const item of progress.filter(
        ({ status }) => status === "pending",
      )) {
        item.status = "blocked";
        item.message = "Bloqueado por uma dependência que não foi concluída.";
      }
      notify();
      break;
    }

    for (const item of ready) item.status = "running";
    notify();
    const outputsByCommandId = new Map<
      string,
      NonNullable<RecordActionResult["output"]>
    >(
      progress.flatMap(({ id, status, output }) =>
        status === "succeeded" && output ? [[id, output] as const] : [],
      ),
    );
    await Promise.all(
      ready.map(async (item) => {
        try {
          const result = await execute(item.command, { outputsByCommandId });
          item.status = "succeeded";
          item.message = result.message;
          item.created = result.created;
          item.output = result.output;
        } catch (cause) {
          if (isResolutionRequiredError(cause)) {
            item.status = "needs_resolution";
            item.message = cause.message;
            item.resolutionOptions = cause.options;
          } else {
            item.status = "failed";
            item.message =
              cause instanceof Error
                ? cause.message
                : "Não foi possível executar este comando.";
          }
        }
      }),
    );
    notify();
  }

  return {
    progress,
    message: resultMessage(progress),
    created: progress.flatMap(({ created }) => created ?? []),
  };
}
