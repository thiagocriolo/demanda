import { browser } from "$app/environment";
import {
  CURRENT_USER,
  PERSONAL_WORKSPACE_ID,
} from "$lib/workspaces/workspace-storage";
import type { EntityConfig, EntityRecord, EntitySeed } from "./types";

export const ENTITY_RECORDS_CHANGED_EVENT = "demanda:entity-records-changed";
const memoryRecords = new Map<EntityConfig["key"], EntityRecord[]>();

function recordFromSeed(
  key: string,
  seed: EntitySeed,
  index: number,
): EntityRecord {
  const timestamp = new Date().toISOString();
  return {
    id: `${key}-exemplo-${index + 1}`,
    createdAt: timestamp,
    updatedAt: timestamp,
    workspaceId: PERSONAL_WORKSPACE_ID,
    ...seed,
  };
}

function createSeedRecords(config: EntityConfig): EntityRecord[] {
  return config.seeds.map((seed, index) =>
    recordFromSeed(config.key, seed, index),
  );
}

function migrateRecord(
  config: EntityConfig,
  value: EntityRecord,
): EntityRecord {
  let record = value;
  if (typeof record.workspaceId !== "string") {
    record = { ...record, workspaceId: PERSONAL_WORKSPACE_ID };
  }
  if (config.key !== "entregas") return record;

  const legacyStatus: Record<string, string> = {
    pendente: "planejamento",
    revisao: "producao",
    entregue: "conclusao",
  };
  const status = legacyStatus[record.status] ?? record.status;
  const storedResponsibleId =
    record.responsavelId || record.assigned_user_id || "";
  const personalResponsibleId =
    record.workspaceId === PERSONAL_WORKSPACE_ID && !storedResponsibleId
      ? CURRENT_USER.id
      : storedResponsibleId;
  const responsibleName =
    personalResponsibleId === CURRENT_USER.id
      ? CURRENT_USER.name
      : record.responsavel || "";
  const migrated: EntityRecord = {
    ...record,
    status,
    prioridade: record.prioridade || record.priority || "normal",
    categoria: record.categoria || record.stage || "",
    descricao: record.descricao || record.briefing || "",
    projeto: record.projeto || record.project_name || "",
    negocio: record.negocio || record.business_name || "",
    responsavel: responsibleName,
    responsavelId: personalResponsibleId,
    assigned_user_id: personalResponsibleId,
  };
  return Object.keys(migrated).some((key) => migrated[key] !== record[key])
    ? migrated
    : record;
}

export function loadEntityRecords(config: EntityConfig): EntityRecord[] {
  if (!browser) return [];
  // Projetos e tarefas são exclusivamente server-side desde BE-07/BE-08. Os
  // valores legados permanecem intactos para uma futura importação explícita,
  // mas nunca são lidos pela aplicação.
  if (config.key === "projetos" || config.key === "entregas") return [];

  const existing = memoryRecords.get(config.key);
  if (existing) return structuredClone(existing);
  const seeded = createSeedRecords(config).map((record) =>
    migrateRecord(config, record),
  );
  memoryRecords.set(config.key, seeded);
  return structuredClone(seeded);
}

export function saveEntityRecords(
  key: EntityConfig["key"],
  records: EntityRecord[],
): void {
  if (!browser) return;
  if (key === "projetos" || key === "entregas") return;
  memoryRecords.set(key, structuredClone(records));
  window.dispatchEvent(
    new CustomEvent(ENTITY_RECORDS_CHANGED_EVENT, { detail: { key } }),
  );
}

export function isArchivedRecord(record: EntityRecord): boolean {
  return (
    Boolean(record.archivedAt) ||
    record.tipo === "arquivado" ||
    record.etapa === "arquivado" ||
    record.status === "arquivado"
  );
}

export function archiveEntityRecord(
  config: EntityConfig,
  recordId: string,
): void {
  const records = loadEntityRecords(config);
  const timestamp = new Date().toISOString();
  let found = false;
  const archivedRecords = records.map((record) => {
    if (record.id !== recordId) return record;
    found = true;
    return { ...record, archivedAt: timestamp, updatedAt: timestamp };
  });

  if (found) saveEntityRecords(config.key, archivedRecords);
}

export function observeEntityRecords(
  onchange: (key?: string) => void,
): () => void {
  if (!browser) return () => undefined;

  const onRecordsChanged = (event: Event) => {
    const detail = (event as CustomEvent<{ key?: string }>).detail;
    onchange(detail?.key);
  };
  window.addEventListener(ENTITY_RECORDS_CHANGED_EVENT, onRecordsChanged);
  return () => {
    window.removeEventListener(ENTITY_RECORDS_CHANGED_EVENT, onRecordsChanged);
  };
}

export function createRecord(
  values: Record<string, string>,
  workspaceId = PERSONAL_WORKSPACE_ID,
): EntityRecord {
  const timestamp = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    createdAt: timestamp,
    updatedAt: timestamp,
    workspaceId,
    ...values,
  };
}
