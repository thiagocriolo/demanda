export const LEGACY_DELIVERIES_STORAGE_KEY = "demanda:crud:entregas";
export const LEGACY_DELIVERIES_VERSION_KEY = "demanda:crud:entregas:version";

type LegacyDeliveryPayload = {
  version: 1;
  sourceKey: typeof LEGACY_DELIVERIES_STORAGE_KEY;
  records: Array<{
    sourceRecordId: string;
    name: string;
    projectName: string;
    category: string;
    priority: string;
    status: string;
    briefing: string;
    dueDate: string | null;
    tagLabels: string[];
    subtasks: Array<{
      name: string;
      durationMinutes: number;
      status: "pendente" | "concluida";
    }>;
  }>;
};

export type LegacyImportReport = {
  imported: number;
  ignored: number;
  invalid: number;
};

function stringValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizedKey(value: unknown, fallback: string): string {
  const normalized = stringValue(value)
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "_")
    .replace(/^[_-]+|[_-]+$/g, "");
  return normalized || fallback;
}

function dueDate(value: unknown): string | null {
  const raw = stringValue(value);
  return /^\d{4}-\d{2}-\d{2}$/u.test(raw) ? raw : null;
}

function durationMinutes(value: unknown): number {
  const hours = Number(String(value ?? "").replace(",", "."));
  if (!Number.isFinite(hours)) return 60;
  return Math.min(10_080, Math.max(30, Math.round((hours * 60) / 30) * 30));
}

function parseSubtasks(value: unknown, fallbackName: string) {
  const source = Array.isArray(value) ? value : [];
  const subtasks = source.slice(0, 10).flatMap((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return [];
    const record = item as Record<string, unknown>;
    const name = stringValue(record.nome ?? record.name);
    if (!name) return [];
    return [
      {
        name,
        durationMinutes:
          typeof record.durationMinutes === "number"
            ? Math.min(
                10_080,
                Math.max(30, Math.round(record.durationMinutes / 30) * 30),
              )
            : durationMinutes(record.duracao ?? record.duration),
        status:
          normalizedKey(record.status, "pendente") === "concluida"
            ? ("concluida" as const)
            : ("pendente" as const),
      },
    ];
  });
  return subtasks.length
    ? subtasks
    : [
        {
          name: fallbackName || "Atividade principal",
          durationMinutes: 60,
          status: "pendente" as const,
        },
      ];
}

/** Reads legacy storage only after an explicit user action; it never writes it. */
export function legacyDeliveriesFromBrowser(): LegacyDeliveryPayload | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(LEGACY_DELIVERIES_STORAGE_KEY);
  if (!raw) return null;
  const storedVersion = window.localStorage.getItem(
    LEGACY_DELIVERIES_VERSION_KEY,
  );
  if (
    storedVersion &&
    !["1", "v1"].includes(storedVersion.trim().toLowerCase())
  ) {
    throw new Error(
      `A versão legada “${storedVersion}” ainda não é compatível com esta migração.`,
    );
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(
      "O armazenamento legado de entregas não contém JSON válido.",
    );
  }
  const source = Array.isArray(parsed)
    ? parsed
    : parsed &&
        typeof parsed === "object" &&
        Array.isArray((parsed as { records?: unknown }).records)
      ? (parsed as { records: unknown[] }).records
      : null;
  if (!source) {
    throw new Error(
      "O armazenamento legado de entregas não tem uma lista de registros.",
    );
  }
  return {
    version: 1,
    sourceKey: LEGACY_DELIVERIES_STORAGE_KEY,
    records: source.map((item, index) => {
      const record =
        item && typeof item === "object" && !Array.isArray(item)
          ? (item as Record<string, unknown>)
          : {};
      const name = stringValue(record.nome ?? record.name);
      return {
        sourceRecordId: stringValue(record.id) || `legacy-${index + 1}`,
        name,
        projectName: stringValue(record.projeto ?? record.project_name),
        category: normalizedKey(record.categoria ?? record.stage, ""),
        priority: normalizedKey(record.prioridade ?? record.priority, "normal"),
        status: normalizedKey(record.status, "planejamento"),
        briefing: stringValue(record.descricao ?? record.briefing),
        dueDate: dueDate(
          record.dataEntrega ??
            record.data_entrega ??
            record.dueDate ??
            record.due_date,
        ),
        tagLabels: stringValue(record.tags)
          .split(/[,;]/u)
          .map((tag) => tag.trim())
          .filter(Boolean)
          .slice(0, 30),
        subtasks: parseSubtasks(record.subtarefas, name),
      };
    }),
  };
}

export async function importLegacyDeliveries(
  payload: LegacyDeliveryPayload,
  fetcher: typeof fetch = fetch,
): Promise<LegacyImportReport> {
  const response = await fetcher("/api/legacy-imports/deliveries", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  const body = (await response.json().catch(() => ({}))) as {
    message?: unknown;
  };
  if (!response.ok) {
    throw new Error(
      typeof body.message === "string"
        ? body.message
        : "Não foi possível importar as entregas legadas.",
    );
  }
  return body as LegacyImportReport;
}
