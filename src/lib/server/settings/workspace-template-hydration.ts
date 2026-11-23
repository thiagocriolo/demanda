import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import type {
  DeliveryTemplate,
  ServiceTemplate,
  WorkspaceSettingsState,
} from "../../settings/types";
import {
  deliveryTemplateResponsibles,
  deliveryTemplateTasks,
  deliveryTemplates,
  deliveryTemplateTags,
  serviceResponsibles,
  serviceDeliveryTemplates,
  services,
  serviceTags,
  tags,
  users,
} from "../db/schema";
import type { SettingsDatabase } from "./database";

function formatAmount(cents: number | null): string {
  if (!cents) return "";
  return Number.isInteger(cents / 100)
    ? String(cents / 100)
    : (cents / 100).toFixed(2).replace(".", ",");
}

function durationHours(value: number | null): string {
  if (!value) return "";
  const hours = value / 60;
  return Number.isInteger(hours) ? String(hours) : hours.toFixed(1);
}

async function hydrateServiceTemplates(
  database: SettingsDatabase,
  workspaceId: string,
): Promise<ServiceTemplate[]> {
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
  const serviceDeliveryRows = serviceIds.length
    ? await database
        .select()
        .from(serviceDeliveryTemplates)
        .where(
          and(
            eq(serviceDeliveryTemplates.workspaceId, workspaceId),
            inArray(serviceDeliveryTemplates.serviceId, serviceIds),
          ),
        )
        .orderBy(
          asc(serviceDeliveryTemplates.sortOrder),
          asc(serviceDeliveryTemplates.id),
        )
    : [];

  return serviceRows.map((row): ServiceTemplate => {
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
      deliveries: serviceDeliveryRows
        .filter(({ serviceId }) => serviceId === row.id)
        .map((delivery) => ({
          id: delivery.id,
          templateId: delivery.deliveryTemplateId,
          name: delivery.name,
          frequency: delivery.recurrenceType as
            "one_off" | "weekly" | "monthly" | "custom",
          customUnit: (delivery.recurrenceUnit || undefined) as
            "week" | "month" | undefined,
          recurrenceDays: (() => {
            try {
              const parsed: unknown = JSON.parse(delivery.recurrenceDays);
              return Array.isArray(parsed)
                ? parsed.filter((item): item is number =>
                    Number.isInteger(item),
                  )
                : [];
            } catch {
              return [];
            }
          })(),
        })),
    };
  });
}

async function hydrateDeliveryTemplates(
  database: SettingsDatabase,
  workspaceId: string,
): Promise<DeliveryTemplate[]> {
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
  const taskRows = deliveryIds.length
    ? await database
        .select()
        .from(deliveryTemplateTasks)
        .where(
          and(
            eq(deliveryTemplateTasks.workspaceId, workspaceId),
            inArray(deliveryTemplateTasks.deliveryTemplateId, deliveryIds),
          ),
        )
        .orderBy(
          asc(deliveryTemplateTasks.sortOrder),
          asc(deliveryTemplateTasks.id),
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

  return deliveryRows.map((row): DeliveryTemplate => {
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
      tasks: taskRows
        .filter(({ deliveryTemplateId }) => deliveryTemplateId === row.id)
        .map((task) => ({
          id: task.id,
          nome: task.name,
          duracao: durationHours(task.durationMinutes),
          status: task.defaultStatusKey,
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
}

export async function hydrateWorkspaceTemplates(
  database: SettingsDatabase,
  workspaceId: string,
  settings: WorkspaceSettingsState,
): Promise<void> {
  settings.serviceTemplates = await hydrateServiceTemplates(
    database,
    workspaceId,
  );
  settings.deliveryTemplates = await hydrateDeliveryTemplates(
    database,
    workspaceId,
  );
  settings.services = [];
}
