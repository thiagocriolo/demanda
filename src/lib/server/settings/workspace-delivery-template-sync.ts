import { randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import type {
  DeliveryTemplate,
  WorkspaceSettingsState,
} from "../../settings/types";
import {
  deliveryTemplateResponsibles,
  deliveryTemplateSubtasks,
  deliveryTemplates,
  deliveryTemplateTags,
  serviceTaskTemplates,
} from "../db/schema";
import { projectTagKey } from "../projects/validation";
import type { SettingsDatabase } from "./database";
import { affectedRows } from "../db/database";
import { SettingsRelationsInvalidError } from "./errors";
import { splitTags } from "./workspace-catalogs";
import {
  resolveResponsibleIds,
  type WorkspaceMemberIndex,
} from "./workspace-template-members";

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

export async function synchronizeDeliveryTemplates(
  database: SettingsDatabase,
  workspaceId: string,
  settings: WorkspaceSettingsState,
  serviceIds: Map<string, string>,
  tagIds: Map<string, string>,
  members: WorkspaceMemberIndex,
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
    const responsibleUserIds = resolveResponsibleIds(
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
        .where(eq(deliveryTemplates.id, current.id));
      if (affectedRows(updated) !== 1)
        throw new SettingsRelationsInvalidError();
      templateId = current.id;
    } else {
      templateId = randomUUID();
      await database
        .insert(deliveryTemplates)
        .values({ ...values, id: templateId });
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

export async function synchronizeServiceTaskTemplates(
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
        recurrenceType: task.frequency ?? "one_off",
        recurrenceUnit:
          task.frequency === "custom" ? (task.customUnit ?? null) : null,
        recurrenceDays: JSON.stringify(
          task.frequency === "weekly"
            ? [0]
            : task.frequency === "monthly"
              ? [1]
              : (task.recurrenceDays ?? []),
        ),
        sortOrder,
        createdAt: now,
        updatedAt: now,
      };
    });
  });
  if (values.length) await database.insert(serviceTaskTemplates).values(values);
}
