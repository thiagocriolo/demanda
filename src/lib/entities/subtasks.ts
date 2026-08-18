import type { EntityRecord } from "./types";

export type EntitySubtask = {
  id: string;
  nome: string;
  duracao: string;
  status: string;
  sequence: number;
};

function valueOf(
  candidate: Record<string, unknown>,
  ...keys: string[]
): string {
  for (const key of keys) {
    const value = candidate[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value))
      return String(value);
  }
  return "";
}

function normalizedStatus(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .trim()
    .toLocaleLowerCase("pt-BR");
}

export function isSubtaskCompleted(status?: string): boolean {
  return [
    "concluida",
    "concluido",
    "conclusao",
    "entregue",
    "done",
    "completed",
  ].includes(normalizedStatus(status ?? ""));
}

function fallbackSubtask(record: EntityRecord): EntitySubtask {
  return {
    id: "principal",
    nome: record.nome || "Atividade principal",
    duracao: record.duracao || record.duration || "1",
    status: isSubtaskCompleted(record.status) ? "concluida" : "pendente",
    sequence: 0,
  };
}

/** Normaliza os formatos legados e preserva a ordem declarada na tarefa. */
export function parseEntitySubtasks(record: EntityRecord): EntitySubtask[] {
  const raw = record.subtarefas?.trim();
  if (!raw) return [fallbackSubtask(record)];

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    const lines = raw
      .split(/\r?\n/)
      .map((name) => name.trim())
      .filter(Boolean);
    return lines.length
      ? lines.map((nome, sequence) => ({
          id: `legado-${sequence + 1}`,
          nome,
          duracao: "1",
          status: "pendente",
          sequence,
        }))
      : [fallbackSubtask(record)];
  }

  const items = Array.isArray(parsed)
    ? parsed
    : parsed &&
        typeof parsed === "object" &&
        Array.isArray((parsed as { subtarefas?: unknown }).subtarefas)
      ? (parsed as { subtarefas: unknown[] }).subtarefas
      : [];

  const subtasks = items.flatMap((item, sequence): EntitySubtask[] => {
    if (typeof item === "string") {
      const nome = item.trim();
      return nome
        ? [
            {
              id: `legado-${sequence + 1}`,
              nome,
              duracao: "1",
              status: "pendente",
              sequence,
            },
          ]
        : [];
    }
    if (!item || typeof item !== "object") return [];
    const candidate = item as Record<string, unknown>;
    const nome = valueOf(candidate, "nome", "name");
    if (!nome) return [];
    return [
      {
        id: valueOf(candidate, "id") || `legado-${sequence + 1}`,
        nome,
        duracao:
          valueOf(candidate, "duracao", "duration", "duration_hours") || "1",
        status: valueOf(candidate, "status") || "pendente",
        sequence,
      },
    ];
  });

  return subtasks.length ? subtasks : [fallbackSubtask(record)];
}
