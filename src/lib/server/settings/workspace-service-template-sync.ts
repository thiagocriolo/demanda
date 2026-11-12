import { randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import type {
  ServiceTemplate,
  WorkspaceSettingsState,
} from "../../settings/types";
import { serviceResponsibles, services, serviceTags } from "../db/schema";
import { projectTagKey } from "../projects/validation";
import type { SettingsDatabase } from "./database";
import { affectedRows } from "../db/database";
import { SettingsRelationsInvalidError } from "./errors";
import { splitTags } from "./workspace-catalogs";
import {
  resolveResponsibleIds,
  type WorkspaceMemberIndex,
} from "./workspace-template-members";

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
    value.toLocaleLowerCase("pt-BR").includes("rotina") ||
    value === "recurring"
    ? "recurring"
    : "one_off";
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
  if (serviceTagValues.length) {
    await database.insert(serviceTags).values(serviceTagValues);
  }
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

export async function synchronizeServiceTemplates(
  database: SettingsDatabase,
  workspaceId: string,
  actorUserId: string,
  settings: WorkspaceSettingsState,
  tagIds: Map<string, string>,
  members: WorkspaceMemberIndex,
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
    const responsibleUserIds = resolveResponsibleIds(
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
        .where(eq(services.id, current.id));
      if (affectedRows(updated) !== 1)
        throw new SettingsRelationsInvalidError();
      serviceId = current.id;
    } else {
      serviceId = randomUUID();
      await database.insert(services).values({ ...values, id: serviceId });
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
