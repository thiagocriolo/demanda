import { randomUUID } from "node:crypto";
import { and, asc, eq, isNull, sql } from "drizzle-orm";
import type {
  StyledChoice,
  WorkspaceSettingsState,
} from "../../settings/types";
import { defaultWorkspaceSettings } from "../../settings/defaults";
import {
  tags,
  workspaceCatalogEntries,
  type WorkspaceCatalogKind,
} from "../db/schema";
import { projectTagKey } from "../projects/validation";
import type { SettingsDatabase } from "./database";
import { SettingsRelationsInvalidError } from "./errors";
import { ensureWorkspaceConfiguration } from "./version";

const catalogDefinitions = [
  ["personStatuses", "person_status"],
  ["businessStatuses", "business_status"],
  ["projectStatuses", "project_status"],
  ["taskStatuses", "task_status"],
  ["businessCategories", "business_category"],
  ["taskCategories", "task_category"],
  ["taskPriorities", "task_priority"],
  ["revenueCategories", "revenue_category"],
  ["expenseCategories", "expense_category"],
] as const satisfies readonly [
  keyof WorkspaceSettingsState,
  WorkspaceCatalogKind,
][];

const lockedCatalogKeys = new Set([
  "person_status:lead",
  "person_status:prospecto",
  "person_status:ativo",
  "person_status:desativado",
  "person_status:arquivado",
  "business_status:negociacao",
  "business_status:contratacao",
  "business_status:ativo",
  "business_status:encerrado",
  "business_status:arquivado",
  "project_status:planejamento",
  "project_status:execucao",
  "project_status:alteracao",
  "project_status:concluido",
  "project_status:arquivado",
  "task_status:planejamento",
  "task_status:fila",
  "task_status:producao",
  "task_status:conclusao",
  "task_status:arquivado",
  "business_category:outro",
  "task_category:outro",
  "task_priority:normal",
  "revenue_category:outros",
  "expense_category:outros",
]);

function catalogRows(workspaceId: string, settings: WorkspaceSettingsState) {
  return catalogDefinitions.flatMap(([field, kind]) =>
    (
      settings[field] as {
        key: string;
        label: string;
        icon?: string;
        color?: string;
      }[]
    ).map((item, sortOrder) => ({
      workspaceId,
      kind,
      key: item.key,
      label: item.label,
      icon: item.icon ?? null,
      color: item.color ?? null,
      sortOrder,
      locked: lockedCatalogKeys.has(`${kind}:${item.key}`),
    })),
  );
}

export function splitTags(value: string): string[] {
  return value
    .split(/[,;]+/u)
    .map((item) => item.trim().replace(/\s+/gu, " "))
    .filter(
      (item, index, all) =>
        Boolean(item) &&
        all.findIndex(
          (candidate) =>
            candidate.toLocaleLowerCase("pt-BR") ===
            item.toLocaleLowerCase("pt-BR"),
        ) === index,
    );
}

export async function ensureWorkspaceDefaults(
  database: SettingsDatabase,
  workspaceId: string,
): Promise<void> {
  await ensureWorkspaceConfiguration(database, workspaceId);
  await database
    .insert(workspaceCatalogEntries)
    .values(catalogRows(workspaceId, defaultWorkspaceSettings()))
    .onDuplicateKeyUpdate({
      set: { sortOrder: sql`${workspaceCatalogEntries.sortOrder}` },
    });
}

export async function hydrateWorkspaceCatalogs(
  database: SettingsDatabase,
  workspaceId: string,
  settings: WorkspaceSettingsState,
): Promise<void> {
  const catalogRowsResult = await database
    .select()
    .from(workspaceCatalogEntries)
    .where(
      and(
        eq(workspaceCatalogEntries.workspaceId, workspaceId),
        isNull(workspaceCatalogEntries.archivedAt),
      ),
    )
    .orderBy(
      asc(workspaceCatalogEntries.kind),
      asc(workspaceCatalogEntries.sortOrder),
      asc(workspaceCatalogEntries.id),
    );
  for (const [field, kind] of catalogDefinitions) {
    const entries = catalogRowsResult.filter((row) => row.kind === kind);
    if (field === "taskPriorities") {
      settings.taskPriorities = entries.map(({ key, label }) => ({
        key,
        label,
      }));
    } else {
      (settings[field] as StyledChoice[]) = entries.map((row) => ({
        key: row.key,
        label: row.label,
        icon: row.icon ?? "tag",
        color: row.color ?? "#64748B",
      }));
    }
  }

  const tagRows = await database
    .select()
    .from(tags)
    .where(and(eq(tags.workspaceId, workspaceId), isNull(tags.archivedAt)))
    .orderBy(asc(tags.sortOrder), asc(tags.label), asc(tags.id));
  settings.tags = tagRows.map(({ label }) => label);
}

async function synchronizeCatalogs(
  database: SettingsDatabase,
  workspaceId: string,
  settings: WorkspaceSettingsState,
  now: Date,
): Promise<void> {
  const desired = catalogRows(workspaceId, settings);
  const existing = await database
    .select()
    .from(workspaceCatalogEntries)
    .where(eq(workspaceCatalogEntries.workspaceId, workspaceId));
  const existingByKey = new Map(
    existing.map((row) => [`${row.kind}:${row.key}`, row]),
  );
  const desiredKeys = new Set<string>();
  for (const row of desired) {
    const composite = `${row.kind}:${row.key}`;
    desiredKeys.add(composite);
    const current = existingByKey.get(composite);
    if (!current) {
      await database.insert(workspaceCatalogEntries).values(row);
      continue;
    }
    await database
      .update(workspaceCatalogEntries)
      .set({
        label: row.label,
        icon: row.icon,
        color: row.color,
        sortOrder: row.sortOrder,
        locked: row.locked,
        archivedAt: null,
        version: sql`${workspaceCatalogEntries.version} + 1`,
        updatedAt: now,
      })
      .where(eq(workspaceCatalogEntries.id, current.id));
  }
  const removed = existing.filter(
    (row) => !row.archivedAt && !desiredKeys.has(`${row.kind}:${row.key}`),
  );
  for (const row of removed) {
    if (row.locked) throw new SettingsRelationsInvalidError();
    await database
      .update(workspaceCatalogEntries)
      .set({
        archivedAt: now,
        version: sql`${workspaceCatalogEntries.version} + 1`,
        updatedAt: now,
      })
      .where(eq(workspaceCatalogEntries.id, row.id));
  }
}

function allTemplateTags(settings: WorkspaceSettingsState): string[] {
  const values = [
    ...settings.tags,
    ...settings.serviceTemplates.flatMap(({ tags }) => splitTags(tags)),
    ...settings.deliveryTemplates.flatMap(({ tags }) => splitTags(tags)),
  ];
  return values.filter(
    (label, index, all) =>
      all.findIndex(
        (candidate) => projectTagKey(candidate) === projectTagKey(label),
      ) === index,
  );
}

async function synchronizeTags(
  database: SettingsDatabase,
  workspaceId: string,
  settings: WorkspaceSettingsState,
  now: Date,
): Promise<Map<string, string>> {
  const labels = allTemplateTags(settings);
  const keys = labels.map(projectTagKey);
  if (keys.some((key) => !/^[a-z0-9][a-z0-9_-]{0,63}$/u.test(key))) {
    throw new SettingsRelationsInvalidError(
      "Uma tag não possui uma chave válida.",
    );
  }
  const existing = await database
    .select()
    .from(tags)
    .where(eq(tags.workspaceId, workspaceId));
  const existingByKey = new Map(existing.map((row) => [row.key, row]));
  const ids = new Map<string, string>();
  for (const [sortOrder, label] of labels.entries()) {
    const key = projectTagKey(label);
    const current = existingByKey.get(key);
    if (!current) {
      const id = randomUUID();
      await database
        .insert(tags)
        .values({ id, workspaceId, key, label, sortOrder });
      ids.set(key, id);
      continue;
    }
    await database
      .update(tags)
      .set({
        label,
        sortOrder,
        archivedAt: null,
        version: sql`${tags.version} + 1`,
        updatedAt: now,
      })
      .where(eq(tags.id, current.id));
    ids.set(key, current.id);
  }
  const desired = new Set(keys);
  for (const row of existing) {
    if (row.archivedAt || desired.has(row.key)) continue;
    await database
      .update(tags)
      .set({
        archivedAt: now,
        version: sql`${tags.version} + 1`,
        updatedAt: now,
      })
      .where(eq(tags.id, row.id));
  }
  return ids;
}

export async function synchronizeWorkspaceCatalogs(
  database: SettingsDatabase,
  workspaceId: string,
  settings: WorkspaceSettingsState,
  now: Date,
): Promise<Map<string, string>> {
  await synchronizeCatalogs(database, workspaceId, settings, now);
  return synchronizeTags(database, workspaceId, settings, now);
}
