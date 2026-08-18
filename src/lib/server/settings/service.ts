import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
import type {
  DeliveryTemplate,
  PersonalSettingsResponse,
  PersonalSettingsState,
  ServiceTemplate,
  SettingsSnapshot,
  StyledChoice,
  WorkspaceSettingsResponse,
  WorkspaceSettingsState,
} from "../../settings/types";
import {
  defaultPersonalSettings,
  defaultWorkspaceSettings,
} from "../../settings/defaults";
import {
  avatarProfileUrl,
  parseAvatarProfileUrl,
} from "../../avatar/avatar-options";
import type { AuditRequestMetadata } from "../authorization/audit";
import { appendAdministrativeAuditLog } from "../authorization/audit";
import type { RequestAuthorizationContext } from "../authorization/workspace-context";
import {
  requireActiveWorkspacePermission,
  requireWorkspacePermission,
  requireWorkspacePermissionForUpdate,
} from "../authorization/workspace-context";
import type { Database } from "../db/database";
import {
  deliveryTemplateResponsibles,
  deliveryTemplateSubtasks,
  deliveryTemplates,
  deliveryTemplateTags,
  serviceResponsibles,
  serviceTaskTemplates,
  services,
  serviceTags,
  tags,
  userPreferences,
  users,
  workspaceCatalogEntries,
  workspaceConfigurations,
  workspaceMembers,
  type WorkspaceCatalogKind,
} from "../db/schema";
import { projectTagKey } from "../projects/validation";
import {
  assertOwnedProfileFile,
  storedFileIdFromPrivateUrl,
} from "../files/service";
import { personalSettingsSchema, workspaceSettingsSchema } from "./validation";
import { ensureWorkspaceConfiguration } from "./version";

type SettingsDatabase = Pick<
  Database,
  "select" | "insert" | "update" | "delete"
>;

export class SettingsVersionConflictError extends Error {
  readonly status = 409;

  constructor() {
    super(
      "As configurações foram alteradas em outra sessão. Recarregue e tente novamente.",
    );
    this.name = "SettingsVersionConflictError";
  }
}

export class SettingsRelationsInvalidError extends Error {
  readonly status = 400;

  constructor(
    message = "Uma ou mais configurações relacionadas não são válidas.",
  ) {
    super(message);
    this.name = "SettingsRelationsInvalidError";
  }
}

export class SettingsConflictError extends Error {
  readonly status = 409;

  constructor(
    message = "Já existe uma configuração com o mesmo identificador ou nome.",
  ) {
    super(message);
    this.name = "SettingsConflictError";
  }
}

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

function workspaceIdFromContext(context: RequestAuthorizationContext): string {
  return requireActiveWorkspacePermission(context, "workspace:read").workspace
    .id;
}

function databaseConstraint(error: unknown): string | undefined {
  const visited = new Set<unknown>();
  let current = error;
  while (current && typeof current === "object" && !visited.has(current)) {
    visited.add(current);
    if ("constraint" in current && typeof current.constraint === "string") {
      return current.constraint;
    }
    current = "cause" in current ? current.cause : undefined;
  }
  return undefined;
}

function translateSettingsConstraint(error: unknown): never {
  const constraint = databaseConstraint(error);
  if (constraint?.includes("foreign_key")) {
    throw new SettingsRelationsInvalidError();
  }
  if (constraint?.includes("unique")) throw new SettingsConflictError();
  throw error;
}

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

async function ensureWorkspaceDefaults(
  database: SettingsDatabase,
  workspaceId: string,
): Promise<void> {
  await ensureWorkspaceConfiguration(database, workspaceId);
  await database
    .insert(workspaceCatalogEntries)
    .values(catalogRows(workspaceId, defaultWorkspaceSettings()))
    .onConflictDoNothing({
      target: [
        workspaceCatalogEntries.workspaceId,
        workspaceCatalogEntries.kind,
        workspaceCatalogEntries.key,
      ],
    });
}

function profileForPrincipal(
  settings: PersonalSettingsState,
  context: RequestAuthorizationContext,
  initialize: boolean,
): PersonalSettingsState {
  const privatePhoto = storedFileIdFromPrivateUrl(context.user.avatarUrl ?? "")
    ? context.user.avatarUrl
    : null;
  const generatedAvatar = initialize
    ? parseAvatarProfileUrl(context.user.avatarUrl ?? "")
    : null;
  return {
    ...settings,
    profile: {
      ...settings.profile,
      name: initialize ? context.user.name : settings.profile.name,
      username: initialize ? context.user.username : settings.profile.username,
      email: initialize ? context.user.email : settings.profile.email,
      photo: privatePhoto ?? (initialize ? "" : settings.profile.photo),
      avatarImage: generatedAvatar?.avatarImage ?? settings.profile.avatarImage,
      avatarColor: generatedAvatar?.avatarColor ?? settings.profile.avatarColor,
    },
  };
}

export async function getUserSettings(
  database: Database,
  context: RequestAuthorizationContext,
): Promise<PersonalSettingsResponse> {
  const [row] = await database
    .select()
    .from(userPreferences)
    .where(eq(userPreferences.userId, context.user.id))
    .limit(1);
  const parsed = row ? personalSettingsSchema.safeParse(row.settings) : null;
  const settings = parsed?.success ? parsed.data : defaultPersonalSettings();
  return {
    version: row?.version ?? 0,
    settings: profileForPrincipal(settings, context, !row),
  };
}

export async function updateUserSettings(
  database: Database,
  context: RequestAuthorizationContext,
  input: { version: number; settings: PersonalSettingsState },
  request: AuditRequestMetadata = {},
): Promise<PersonalSettingsResponse> {
  const parsed = personalSettingsSchema.parse(input.settings);
  const privatePhotoId = storedFileIdFromPrivateUrl(parsed.profile.photo);
  const privateCoverId = storedFileIdFromPrivateUrl(parsed.profile.cover);
  if (privatePhotoId) {
    await assertOwnedProfileFile(database, context, parsed.profile.photo);
  }
  if (privateCoverId) {
    await assertOwnedProfileFile(database, context, parsed.profile.cover);
  }
  const stored: PersonalSettingsState = {
    ...parsed,
    profile: {
      ...parsed.profile,
      photo: privatePhotoId ? parsed.profile.photo : "",
      cover: privateCoverId ? parsed.profile.cover : "",
    },
  };
  const avatarUrl = privatePhotoId
    ? stored.profile.photo
    : avatarProfileUrl(stored.profile.avatarImage, stored.profile.avatarColor);
  const next = await database.transaction(async (transaction) => {
    const workspace = requireActiveWorkspacePermission(
      context,
      "workspace:read",
    );
    const access = await requireWorkspacePermissionForUpdate(
      transaction,
      context.user.id,
      workspace.workspace.id,
      "workspace:read",
    );
    let nextPreference: typeof userPreferences.$inferSelect;
    if (input.version === 0) {
      const inserted = await transaction
        .insert(userPreferences)
        .values({
          userId: context.user.id,
          settings: stored as unknown as Record<string, unknown>,
          version: 1,
        })
        .onConflictDoNothing({ target: userPreferences.userId })
        .returning();
      if (inserted.length !== 1) throw new SettingsVersionConflictError();
      nextPreference = inserted[0]!;
    } else {
      const updated = await transaction
        .update(userPreferences)
        .set({
          settings: stored as unknown as Record<string, unknown>,
          version: sql`${userPreferences.version} + 1`,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(userPreferences.userId, context.user.id),
            eq(userPreferences.version, input.version),
          ),
        )
        .returning();
      if (updated.length !== 1) throw new SettingsVersionConflictError();
      nextPreference = updated[0]!;
    }
    await transaction
      .update(users)
      .set({ avatarUrl, updatedAt: new Date() })
      .where(eq(users.id, context.user.id));
    await appendAdministrativeAuditLog(
      transaction,
      { userId: context.user.id, workspace: access },
      {
        action: "profile.updated",
        targetType: "user",
        targetId: context.user.id,
        metadata: { hasPrivatePhoto: Boolean(privatePhotoId) },
      },
      request,
    );
    return nextPreference;
  });
  context.user.avatarUrl = avatarUrl;
  return {
    version: next.version,
    settings: stored,
  };
}

function formatAmount(cents: number | null): string {
  if (!cents) return "";
  return Number.isInteger(cents / 100)
    ? String(cents / 100)
    : (cents / 100).toFixed(2).replace(".", ",");
}

function amountCents(value: string): number {
  const normalized = value.trim().replace(",", ".");
  if (!normalized) return 0;
  const amount = Number(normalized);
  if (!Number.isFinite(amount) || amount < 0) {
    throw new SettingsRelationsInvalidError("O valor do modelo não é válido.");
  }
  const cents = Math.round(amount * 100);
  if (!Number.isSafeInteger(cents)) {
    throw new SettingsRelationsInvalidError("O valor do modelo é muito alto.");
  }
  return cents;
}

function durationMinutes(value: string): number | null {
  if (!value.trim()) return null;
  const hours = Number(value.replace(",", "."));
  const minutes = Math.round((hours * 60) / 30) * 30;
  if (!Number.isFinite(minutes) || minutes < 30 || minutes > 10_080) {
    throw new SettingsRelationsInvalidError(
      "A duração do modelo não é válida.",
    );
  }
  return minutes;
}

function durationHours(value: number | null): string {
  if (!value) return "";
  const hours = value / 60;
  return Number.isInteger(hours) ? String(hours) : hours.toFixed(1);
}

function projectDurationDays(value: string): number | null {
  if (!value.trim()) return null;
  const days = Number(value);
  if (!Number.isInteger(days) || days < 1 || days > 3650) {
    throw new SettingsRelationsInvalidError("O prazo do modelo não é válido.");
  }
  return days;
}

function normalizedContract(value: string): "one_off" | "recurring" {
  return value.toLocaleLowerCase("pt-BR").includes("recorr") ||
    value === "recurring"
    ? "recurring"
    : "one_off";
}

function splitTags(value: string): string[] {
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

async function hydrateWorkspaceSettings(
  database: SettingsDatabase,
  workspaceId: string,
  version: number,
  templateGalleryVersion: number,
  canManage: boolean,
): Promise<WorkspaceSettingsResponse> {
  const settings = defaultWorkspaceSettings();
  settings.templateGalleryVersion = templateGalleryVersion;
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

  const serviceRows = await database
    .select()
    .from(services)
    .where(
      and(eq(services.workspaceId, workspaceId), isNull(services.archivedAt)),
    )
    .orderBy(asc(services.sortOrder), asc(services.id));
  const serviceIds = serviceRows.map(({ id }) => id);
  const serviceTagRows = serviceIds.length
    ? await database
        .select({ serviceId: serviceTags.serviceId, label: tags.label })
        .from(serviceTags)
        .innerJoin(
          tags,
          and(
            eq(tags.workspaceId, serviceTags.workspaceId),
            eq(tags.id, serviceTags.tagId),
          ),
        )
        .where(
          and(
            eq(serviceTags.workspaceId, workspaceId),
            inArray(serviceTags.serviceId, serviceIds),
          ),
        )
        .orderBy(asc(serviceTags.sortOrder), asc(tags.id))
    : [];
  const serviceResponsibleRows = serviceIds.length
    ? await database
        .select({
          serviceId: serviceResponsibles.serviceId,
          userId: users.id,
          name: users.name,
        })
        .from(serviceResponsibles)
        .innerJoin(users, eq(users.id, serviceResponsibles.userId))
        .where(
          and(
            eq(serviceResponsibles.workspaceId, workspaceId),
            inArray(serviceResponsibles.serviceId, serviceIds),
          ),
        )
        .orderBy(asc(serviceResponsibles.sortOrder), asc(users.id))
    : [];
  const serviceTaskRows = serviceIds.length
    ? await database
        .select()
        .from(serviceTaskTemplates)
        .where(
          and(
            eq(serviceTaskTemplates.workspaceId, workspaceId),
            inArray(serviceTaskTemplates.serviceId, serviceIds),
          ),
        )
        .orderBy(
          asc(serviceTaskTemplates.sortOrder),
          asc(serviceTaskTemplates.id),
        )
    : [];
  settings.serviceTemplates = serviceRows.map((row): ServiceTemplate => {
    const responsibles = serviceResponsibleRows.filter(
      ({ serviceId }) => serviceId === row.id,
    );
    return {
      id: row.id,
      version: row.version,
      name: row.name,
      icon: row.icon,
      color: row.color,
      briefing: row.defaultBriefing || row.description,
      tags: serviceTagRows
        .filter(({ serviceId }) => serviceId === row.id)
        .map(({ label }) => label)
        .join(", "),
      status: row.defaultStatusKey,
      responsible: responsibles.map(({ name }) => name).join(", "),
      responsibleUserIds: responsibles.map(({ userId }) => userId),
      duration: row.defaultDurationDays ? String(row.defaultDurationDays) : "",
      contractType:
        row.defaultContractType === "recurring" ? "Recorrente" : "Pontual",
      amount: formatAmount(row.defaultAmountCents),
      installments: String(row.defaultInstallmentCount),
      paymentMethod: row.defaultPaymentMethod ?? "",
      paymentTerms: row.defaultPaymentTerms ?? "",
      financeNotes: row.defaultFinanceNotes ?? "",
      tasks: serviceTaskRows
        .filter(({ serviceId }) => serviceId === row.id)
        .map((task) => ({
          id: task.id,
          templateId: task.deliveryTemplateId,
          name: task.name,
        })),
    };
  });

  const deliveryRows = await database
    .select()
    .from(deliveryTemplates)
    .where(
      and(
        eq(deliveryTemplates.workspaceId, workspaceId),
        isNull(deliveryTemplates.archivedAt),
      ),
    )
    .orderBy(asc(deliveryTemplates.sortOrder), asc(deliveryTemplates.id));
  const deliveryIds = deliveryRows.map(({ id }) => id);
  const subtaskRows = deliveryIds.length
    ? await database
        .select()
        .from(deliveryTemplateSubtasks)
        .where(
          and(
            eq(deliveryTemplateSubtasks.workspaceId, workspaceId),
            inArray(deliveryTemplateSubtasks.deliveryTemplateId, deliveryIds),
          ),
        )
        .orderBy(
          asc(deliveryTemplateSubtasks.sortOrder),
          asc(deliveryTemplateSubtasks.id),
        )
    : [];
  const deliveryTagRows = deliveryIds.length
    ? await database
        .select({
          deliveryTemplateId: deliveryTemplateTags.deliveryTemplateId,
          label: tags.label,
        })
        .from(deliveryTemplateTags)
        .innerJoin(
          tags,
          and(
            eq(tags.workspaceId, deliveryTemplateTags.workspaceId),
            eq(tags.id, deliveryTemplateTags.tagId),
          ),
        )
        .where(
          and(
            eq(deliveryTemplateTags.workspaceId, workspaceId),
            inArray(deliveryTemplateTags.deliveryTemplateId, deliveryIds),
          ),
        )
        .orderBy(asc(deliveryTemplateTags.sortOrder), asc(tags.id))
    : [];
  const deliveryResponsibleRows = deliveryIds.length
    ? await database
        .select({
          deliveryTemplateId: deliveryTemplateResponsibles.deliveryTemplateId,
          userId: users.id,
          name: users.name,
        })
        .from(deliveryTemplateResponsibles)
        .innerJoin(users, eq(users.id, deliveryTemplateResponsibles.userId))
        .where(
          and(
            eq(deliveryTemplateResponsibles.workspaceId, workspaceId),
            inArray(
              deliveryTemplateResponsibles.deliveryTemplateId,
              deliveryIds,
            ),
          ),
        )
        .orderBy(asc(deliveryTemplateResponsibles.sortOrder), asc(users.id))
    : [];
  settings.deliveryTemplates = deliveryRows.map((row): DeliveryTemplate => {
    const responsibles = deliveryResponsibleRows.filter(
      ({ deliveryTemplateId }) => deliveryTemplateId === row.id,
    );
    return {
      id: row.id,
      version: row.version,
      projectTemplateId: row.serviceId ?? "",
      name: row.name,
      category: row.categoryKey ?? "",
      briefing: row.description,
      subtasks: subtaskRows
        .filter(({ deliveryTemplateId }) => deliveryTemplateId === row.id)
        .map((subtask) => ({
          id: subtask.id,
          nome: subtask.name,
          duracao: durationHours(subtask.durationMinutes),
          status: subtask.defaultStatusKey,
        })),
      status: row.defaultStatusKey,
      priority: row.defaultPriorityKey,
      tags: deliveryTagRows
        .filter(({ deliveryTemplateId }) => deliveryTemplateId === row.id)
        .map(({ label }) => label)
        .join(", "),
      responsible: responsibles.map(({ name }) => name).join(", "),
      responsibleUserIds: responsibles.map(({ userId }) => userId),
      duration: durationHours(row.defaultDurationMinutes),
    };
  });
  settings.services = [];

  return { workspaceId, version, canManage, settings };
}

export async function getWorkspaceSettings(
  database: Database,
  context: RequestAuthorizationContext,
): Promise<WorkspaceSettingsResponse> {
  const workspaceId = workspaceIdFromContext(context);
  const access = await requireWorkspacePermission(
    database,
    context.user.id,
    workspaceId,
    "workspace:read",
  );
  return database.transaction(async (transaction) => {
    await ensureWorkspaceDefaults(transaction, workspaceId);
    const [configuration] = await transaction
      .select()
      .from(workspaceConfigurations)
      .where(eq(workspaceConfigurations.workspaceId, workspaceId))
      .limit(1);
    if (!configuration) throw new SettingsRelationsInvalidError();
    return hydrateWorkspaceSettings(
      transaction,
      workspaceId,
      configuration.version,
      configuration.templateGalleryVersion,
      access.membership.role === "owner" || access.membership.role === "admin",
    );
  });
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
      const created = await database
        .insert(tags)
        .values({ workspaceId, key, label, sortOrder })
        .returning({ id: tags.id });
      if (created.length !== 1) throw new SettingsRelationsInvalidError();
      ids.set(key, created[0]!.id);
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

async function workspaceMemberMap(
  database: SettingsDatabase,
  workspaceId: string,
): Promise<{
  ids: Set<string>;
  byName: Map<string, string[]>;
}> {
  const rows = await database
    .select({ id: users.id, name: users.name })
    .from(workspaceMembers)
    .innerJoin(users, eq(users.id, workspaceMembers.userId))
    .where(eq(workspaceMembers.workspaceId, workspaceId));
  const byName = new Map<string, string[]>();
  for (const row of rows) {
    const key = row.name.trim().toLocaleLowerCase("pt-BR");
    byName.set(key, [...(byName.get(key) ?? []), row.id]);
  }
  return { ids: new Set(rows.map(({ id }) => id)), byName };
}

function responsibleIds(
  explicit: string[] | undefined,
  legacy: string,
  members: Awaited<ReturnType<typeof workspaceMemberMap>>,
  fallback: string[],
): string[] {
  const requested = explicit?.length
    ? explicit
    : legacy.split(/[,;]+/u).flatMap((name) => {
        const matches = members.byName.get(
          name.trim().toLocaleLowerCase("pt-BR"),
        );
        return matches?.length === 1 ? matches : [];
      });
  const result = requested.length ? requested : fallback;
  if (result.some((id) => !members.ids.has(id))) {
    throw new SettingsRelationsInvalidError(
      "Um responsável não pertence ao workspace.",
    );
  }
  return [...new Set(result)];
}

async function replaceServiceRelations(
  database: SettingsDatabase,
  workspaceId: string,
  serviceId: string,
  template: ServiceTemplate,
  tagIds: Map<string, string>,
  responsibleUserIds: string[],
): Promise<void> {
  await database
    .delete(serviceTags)
    .where(
      and(
        eq(serviceTags.workspaceId, workspaceId),
        eq(serviceTags.serviceId, serviceId),
      ),
    );
  await database
    .delete(serviceResponsibles)
    .where(
      and(
        eq(serviceResponsibles.workspaceId, workspaceId),
        eq(serviceResponsibles.serviceId, serviceId),
      ),
    );
  const serviceTagValues = splitTags(template.tags).map((label, sortOrder) => ({
    workspaceId,
    serviceId,
    tagId: tagIds.get(projectTagKey(label))!,
    sortOrder,
  }));
  if (serviceTagValues.length)
    await database.insert(serviceTags).values(serviceTagValues);
  if (responsibleUserIds.length) {
    await database.insert(serviceResponsibles).values(
      responsibleUserIds.map((userId, sortOrder) => ({
        workspaceId,
        serviceId,
        userId,
        sortOrder,
      })),
    );
  }
}

async function synchronizeServices(
  database: SettingsDatabase,
  workspaceId: string,
  actorUserId: string,
  settings: WorkspaceSettingsState,
  tagIds: Map<string, string>,
  members: Awaited<ReturnType<typeof workspaceMemberMap>>,
  now: Date,
): Promise<Map<string, string>> {
  const existing = await database
    .select()
    .from(services)
    .where(eq(services.workspaceId, workspaceId));
  const existingById = new Map(existing.map((row) => [row.id, row]));
  const retained = new Set<string>();
  const canonical = new Map<string, string>();
  for (const [sortOrder, template] of settings.serviceTemplates.entries()) {
    const current = existingById.get(template.id);
    const responsibleUserIds = responsibleIds(
      template.responsibleUserIds,
      template.responsible,
      members,
      [actorUserId],
    );
    const values = {
      workspaceId,
      name: template.name,
      description: template.briefing,
      defaultBriefing: template.briefing,
      icon: template.icon,
      color: template.color,
      defaultStatusKey: template.status,
      defaultDurationDays: projectDurationDays(template.duration),
      defaultContractType: normalizedContract(template.contractType),
      defaultAmountCents: amountCents(template.amount),
      defaultInstallmentCount: Math.max(
        1,
        Math.min(99, Number(template.installments) || 1),
      ),
      defaultPaymentMethod: template.paymentMethod || null,
      defaultPaymentTerms: template.paymentTerms || null,
      defaultFinanceNotes: template.financeNotes || null,
      sortOrder,
      archivedAt: null,
      updatedAt: now,
    };
    let serviceId: string;
    if (current) {
      const updated = await database
        .update(services)
        .set({ ...values, version: sql`${services.version} + 1` })
        .where(eq(services.id, current.id))
        .returning({ id: services.id });
      if (updated.length !== 1) throw new SettingsRelationsInvalidError();
      serviceId = current.id;
    } else {
      const created = await database
        .insert(services)
        .values(values)
        .returning({ id: services.id });
      if (created.length !== 1) throw new SettingsRelationsInvalidError();
      serviceId = created[0]!.id;
    }
    retained.add(serviceId);
    canonical.set(template.id, serviceId);
    await replaceServiceRelations(
      database,
      workspaceId,
      serviceId,
      template,
      tagIds,
      responsibleUserIds,
    );
  }
  for (const row of existing) {
    if (row.archivedAt || retained.has(row.id)) continue;
    await database
      .update(services)
      .set({
        archivedAt: now,
        version: sql`${services.version} + 1`,
        updatedAt: now,
      })
      .where(eq(services.id, row.id));
  }
  return canonical;
}

async function replaceDeliveryRelations(
  database: SettingsDatabase,
  workspaceId: string,
  templateId: string,
  template: DeliveryTemplate,
  tagIds: Map<string, string>,
  responsibleUserIds: string[],
  now: Date,
): Promise<void> {
  await database
    .delete(deliveryTemplateSubtasks)
    .where(
      and(
        eq(deliveryTemplateSubtasks.workspaceId, workspaceId),
        eq(deliveryTemplateSubtasks.deliveryTemplateId, templateId),
      ),
    );
  await database
    .delete(deliveryTemplateTags)
    .where(
      and(
        eq(deliveryTemplateTags.workspaceId, workspaceId),
        eq(deliveryTemplateTags.deliveryTemplateId, templateId),
      ),
    );
  await database
    .delete(deliveryTemplateResponsibles)
    .where(
      and(
        eq(deliveryTemplateResponsibles.workspaceId, workspaceId),
        eq(deliveryTemplateResponsibles.deliveryTemplateId, templateId),
      ),
    );
  if (template.subtasks.length) {
    await database.insert(deliveryTemplateSubtasks).values(
      template.subtasks.map((subtask, sortOrder) => ({
        workspaceId,
        deliveryTemplateId: templateId,
        name: subtask.nome,
        durationMinutes: durationMinutes(subtask.duracao)!,
        defaultStatusKey: subtask.status,
        sortOrder,
        createdAt: now,
        updatedAt: now,
      })),
    );
  }
  const deliveryTagValues = splitTags(template.tags).map(
    (label, sortOrder) => ({
      workspaceId,
      deliveryTemplateId: templateId,
      tagId: tagIds.get(projectTagKey(label))!,
      sortOrder,
    }),
  );
  if (deliveryTagValues.length) {
    await database.insert(deliveryTemplateTags).values(deliveryTagValues);
  }
  if (responsibleUserIds.length) {
    await database.insert(deliveryTemplateResponsibles).values(
      responsibleUserIds.map((userId, sortOrder) => ({
        workspaceId,
        deliveryTemplateId: templateId,
        userId,
        sortOrder,
      })),
    );
  }
}

async function synchronizeDeliveryTemplates(
  database: SettingsDatabase,
  workspaceId: string,
  settings: WorkspaceSettingsState,
  serviceIds: Map<string, string>,
  tagIds: Map<string, string>,
  members: Awaited<ReturnType<typeof workspaceMemberMap>>,
  now: Date,
): Promise<Map<string, string>> {
  const existing = await database
    .select()
    .from(deliveryTemplates)
    .where(eq(deliveryTemplates.workspaceId, workspaceId));
  const existingById = new Map(existing.map((row) => [row.id, row]));
  const retained = new Set<string>();
  const canonical = new Map<string, string>();
  for (const [sortOrder, template] of settings.deliveryTemplates.entries()) {
    const current = existingById.get(template.id);
    const responsibleUserIds = responsibleIds(
      template.responsibleUserIds,
      template.responsible,
      members,
      [],
    );
    const serviceId = template.projectTemplateId
      ? serviceIds.get(template.projectTemplateId)
      : undefined;
    if (template.projectTemplateId && !serviceId) {
      throw new SettingsRelationsInvalidError(
        "O modelo de projeto associado não existe.",
      );
    }
    const subtaskTotal = template.subtasks.reduce(
      (total, subtask) => total + (durationMinutes(subtask.duracao) ?? 0),
      0,
    );
    const values = {
      workspaceId,
      serviceId: null,
      name: template.name,
      description: template.briefing,
      categoryKey: template.category || null,
      defaultStatusKey: template.status,
      defaultPriorityKey: template.priority,
      defaultDurationMinutes:
        durationMinutes(template.duration) ?? (subtaskTotal || null),
      sortOrder,
      archivedAt: null,
      updatedAt: now,
    };
    let templateId: string;
    if (current) {
      const updated = await database
        .update(deliveryTemplates)
        .set({
          ...values,
          version: sql`${deliveryTemplates.version} + 1`,
        })
        .where(eq(deliveryTemplates.id, current.id))
        .returning({ id: deliveryTemplates.id });
      if (updated.length !== 1) throw new SettingsRelationsInvalidError();
      templateId = current.id;
    } else {
      const created = await database
        .insert(deliveryTemplates)
        .values(values)
        .returning({ id: deliveryTemplates.id });
      if (created.length !== 1) throw new SettingsRelationsInvalidError();
      templateId = created[0]!.id;
    }
    retained.add(templateId);
    canonical.set(template.id, templateId);
    await replaceDeliveryRelations(
      database,
      workspaceId,
      templateId,
      template,
      tagIds,
      responsibleUserIds,
      now,
    );
  }
  for (const row of existing) {
    if (row.archivedAt || retained.has(row.id)) continue;
    await database
      .update(deliveryTemplates)
      .set({
        archivedAt: now,
        version: sql`${deliveryTemplates.version} + 1`,
        updatedAt: now,
      })
      .where(eq(deliveryTemplates.id, row.id));
  }
  return canonical;
}

async function synchronizeServiceTaskTemplates(
  database: SettingsDatabase,
  workspaceId: string,
  settings: WorkspaceSettingsState,
  serviceIds: Map<string, string>,
  deliveryIds: Map<string, string>,
  now: Date,
): Promise<void> {
  await database
    .delete(serviceTaskTemplates)
    .where(eq(serviceTaskTemplates.workspaceId, workspaceId));

  const values = settings.serviceTemplates.flatMap((service) => {
    const serviceId = serviceIds.get(service.id);
    if (!serviceId) throw new SettingsRelationsInvalidError();
    return service.tasks.map((task, sortOrder) => {
      const deliveryTemplateId = deliveryIds.get(task.templateId);
      if (!deliveryTemplateId) {
        throw new SettingsRelationsInvalidError(
          "O modelo de tarefa selecionado não existe.",
        );
      }
      return {
        workspaceId,
        serviceId,
        deliveryTemplateId,
        name: task.name,
        sortOrder,
        createdAt: now,
        updatedAt: now,
      };
    });
  });
  if (values.length) await database.insert(serviceTaskTemplates).values(values);
}

export async function updateWorkspaceSettings(
  database: Database,
  context: RequestAuthorizationContext,
  input: { version: number; settings: WorkspaceSettingsState },
): Promise<WorkspaceSettingsResponse> {
  const workspaceId = workspaceIdFromContext(context);
  const settings = workspaceSettingsSchema.parse(input.settings);
  try {
    return await database.transaction(async (transaction) => {
      const access = await requireWorkspacePermissionForUpdate(
        transaction,
        context.user.id,
        workspaceId,
        "workspace:administer",
      );
      await ensureWorkspaceDefaults(transaction, workspaceId);
      const [configuration] = await transaction
        .select()
        .from(workspaceConfigurations)
        .where(eq(workspaceConfigurations.workspaceId, workspaceId))
        .limit(1)
        .for("update");
      if (!configuration || configuration.version !== input.version) {
        throw new SettingsVersionConflictError();
      }
      const now = new Date();
      await synchronizeCatalogs(transaction, workspaceId, settings, now);
      const tagIds = await synchronizeTags(
        transaction,
        workspaceId,
        settings,
        now,
      );
      const members = await workspaceMemberMap(transaction, workspaceId);
      const serviceIds = await synchronizeServices(
        transaction,
        workspaceId,
        context.user.id,
        settings,
        tagIds,
        members,
        now,
      );
      const deliveryIds = await synchronizeDeliveryTemplates(
        transaction,
        workspaceId,
        settings,
        serviceIds,
        tagIds,
        members,
        now,
      );
      await synchronizeServiceTaskTemplates(
        transaction,
        workspaceId,
        settings,
        serviceIds,
        deliveryIds,
        now,
      );
      const updated = await transaction
        .update(workspaceConfigurations)
        .set({
          version: sql`${workspaceConfigurations.version} + 1`,
          templateGalleryVersion: settings.templateGalleryVersion,
          updatedAt: now,
        })
        .where(
          and(
            eq(workspaceConfigurations.workspaceId, workspaceId),
            eq(workspaceConfigurations.version, input.version),
          ),
        )
        .returning({ version: workspaceConfigurations.version });
      if (updated.length !== 1) throw new SettingsVersionConflictError();
      return hydrateWorkspaceSettings(
        transaction,
        workspaceId,
        updated[0]!.version,
        settings.templateGalleryVersion,
        access.membership.role === "owner" ||
          access.membership.role === "admin",
      );
    });
  } catch (error) {
    if (
      error instanceof SettingsVersionConflictError ||
      error instanceof SettingsRelationsInvalidError ||
      error instanceof SettingsConflictError
    ) {
      throw error;
    }
    translateSettingsConstraint(error);
  }
}

export async function getSettingsSnapshot(
  database: Database,
  context: RequestAuthorizationContext,
): Promise<SettingsSnapshot> {
  const [personal, workspace] = await Promise.all([
    getUserSettings(database, context),
    getWorkspaceSettings(database, context),
  ]);
  return { personal, workspace };
}

export async function importSettingsSnapshot(
  database: Database,
  context: RequestAuthorizationContext,
  input: {
    personalVersion: number;
    personal: PersonalSettingsState;
    workspace?: {
      workspaceId: string;
      version: number;
      settings: WorkspaceSettingsState;
    };
  },
): Promise<SettingsSnapshot> {
  const activeWorkspaceId = workspaceIdFromContext(context);
  if (input.workspace && input.workspace.workspaceId !== activeWorkspaceId) {
    throw new SettingsVersionConflictError();
  }
  return database.transaction(async (transaction) => {
    const scoped = transaction as unknown as Database;
    const personal = await updateUserSettings(scoped, context, {
      version: input.personalVersion,
      settings: input.personal,
    });
    const workspace = input.workspace
      ? await updateWorkspaceSettings(scoped, context, {
          version: input.workspace.version,
          settings: input.workspace.settings,
        })
      : await getWorkspaceSettings(scoped, context);
    return { personal, workspace };
  });
}
