import { randomUUID } from "node:crypto";
import {
  and,
  asc,
  count,
  desc,
  eq,
  inArray,
  isNotNull,
  isNull,
  or,
  sql,
  type SQL,
} from "drizzle-orm";
import type {
  ProjectResponsible,
  ProjectTag,
  Service,
  ServiceList,
  ServiceMutationInput,
} from "../../projects/types";
import type { RequestAuthorizationContext } from "../authorization/workspace-context";
import {
  requireWorkspacePermission,
  requireWorkspacePermissionForUpdate,
} from "../authorization/workspace-context";
import { affectedRows, type Database } from "../db/database";
import {
  serviceResponsibles,
  services,
  serviceTags,
  tags,
  users,
  workspaceMembers,
} from "../db/schema";
import { touchWorkspaceConfiguration } from "../settings/version";
import type { ServiceListQuery } from "./validation";
import {
  ServiceNameConflictError,
  ServiceNotFoundError,
  ServiceRelationsInvalidError,
} from "./errors";
import {
  databaseConstraint,
  existingTagIds,
  iso,
  resolveAndLockTags,
  validateAndLockMembers,
  workspaceIdFromContext,
  type ProjectDatabase,
} from "./shared";

function translateServiceConstraint(error: unknown): never {
  const constraint = databaseConstraint(error);
  if (constraint === "services_workspace_active_name_unique") {
    throw new ServiceNameConflictError();
  }
  if (
    constraint?.includes("workspace_tag_foreign_key") ||
    constraint?.includes("workspace_member_foreign_key")
  ) {
    throw new ServiceRelationsInvalidError();
  }
  throw error;
}

async function findScopedServiceRow(
  database: ProjectDatabase,
  workspaceId: string,
  serviceId: string,
  lock = false,
): Promise<typeof services.$inferSelect | null> {
  let query = database
    .select()
    .from(services)
    .where(
      and(eq(services.workspaceId, workspaceId), eq(services.id, serviceId)),
    )
    .limit(1);
  if (lock) query = query.for("update") as typeof query;
  const [row] = await query;
  return row ?? null;
}

export async function hydrateServices(
  database: ProjectDatabase,
  rows: (typeof services.$inferSelect)[],
): Promise<Service[]> {
  if (!rows.length) return [];
  const workspaceId = rows[0]!.workspaceId;
  const ids = rows.map(({ id }) => id);
  const tagRows = await database
    .select({
      serviceId: serviceTags.serviceId,
      id: tags.id,
      name: tags.label,
      archivedAt: tags.archivedAt,
    })
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
        inArray(serviceTags.serviceId, ids),
      ),
    )
    .orderBy(asc(serviceTags.sortOrder), asc(tags.id));
  const responsibleRows = await database
    .select({
      serviceId: serviceResponsibles.serviceId,
      userId: workspaceMembers.userId,
      name: users.name,
      email: users.email,
      avatarUrl: users.avatarUrl,
      role: workspaceMembers.role,
    })
    .from(serviceResponsibles)
    .innerJoin(
      workspaceMembers,
      and(
        eq(workspaceMembers.workspaceId, serviceResponsibles.workspaceId),
        eq(workspaceMembers.userId, serviceResponsibles.userId),
      ),
    )
    .innerJoin(users, eq(users.id, workspaceMembers.userId))
    .where(
      and(
        eq(serviceResponsibles.workspaceId, workspaceId),
        inArray(serviceResponsibles.serviceId, ids),
      ),
    )
    .orderBy(asc(serviceResponsibles.sortOrder), asc(users.id));

  const tagsByService = new Map<string, ProjectTag[]>();
  const responsiblesByService = new Map<string, ProjectResponsible[]>();
  for (const tag of tagRows) {
    const values = tagsByService.get(tag.serviceId) ?? [];
    values.push({
      id: tag.id,
      name: tag.name,
      archivedAt: iso(tag.archivedAt),
    });
    tagsByService.set(tag.serviceId, values);
  }
  for (const responsible of responsibleRows) {
    const values = responsiblesByService.get(responsible.serviceId) ?? [];
    values.push({
      userId: responsible.userId,
      name: responsible.name,
      email: responsible.email,
      avatarUrl: responsible.avatarUrl,
      role: responsible.role,
    });
    responsiblesByService.set(responsible.serviceId, values);
  }

  return rows.map((row) => ({
    id: row.id,
    workspaceId: row.workspaceId,
    version: row.version,
    name: row.name,
    description: row.description,
    icon: row.icon,
    color: row.color,
    defaultStatus: row.defaultStatusKey,
    defaultDurationDays: row.defaultDurationDays,
    defaultBriefing: row.defaultBriefing,
    tags: tagsByService.get(row.id) ?? [],
    responsibles: responsiblesByService.get(row.id) ?? [],
    defaultContractType:
      row.defaultContractType as Service["defaultContractType"],
    defaultAmountCents: row.defaultAmountCents ?? 0,
    defaultInstallmentCount: row.defaultInstallmentCount,
    defaultPaymentMethod: row.defaultPaymentMethod ?? "",
    defaultPaymentTerms: row.defaultPaymentTerms ?? "",
    defaultFinanceNotes: row.defaultFinanceNotes ?? "",
    archivedAt: iso(row.archivedAt),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }));
}

async function insertServiceDetails(
  database: ProjectDatabase,
  workspaceId: string,
  serviceId: string,
  tagRows: (typeof tags.$inferSelect)[],
  responsibleUserIds: string[],
): Promise<void> {
  if (tagRows.length) {
    await database.insert(serviceTags).values(
      tagRows.map((tag, sortOrder) => ({
        workspaceId,
        serviceId,
        tagId: tag.id,
        sortOrder,
      })),
    );
  }
  await database.insert(serviceResponsibles).values(
    responsibleUserIds.map((userId, sortOrder) => ({
      workspaceId,
      serviceId,
      userId,
      sortOrder,
    })),
  );
}

function mysqlLikePattern(value: string): string {
  return value.replace(/[!%_]/g, (character) => `!${character}`);
}

function serviceSearchCondition(query: string): SQL | undefined {
  if (!query) return undefined;
  const pattern = `%${mysqlLikePattern(query)}%`;
  return or(
    sql`${services.name} like ${pattern} escape '!'`,
    sql`${services.description} like ${pattern} escape '!'`,
    sql`${services.defaultBriefing} like ${pattern} escape '!'`,
    sql`exists (
      select 1 from ${serviceTags}
      inner join ${tags}
        on ${tags.workspaceId} = ${serviceTags.workspaceId}
       and ${tags.id} = ${serviceTags.tagId}
      where ${serviceTags.workspaceId} = ${services.workspaceId}
        and ${serviceTags.serviceId} = ${services.id}
        and ${tags.label} like ${pattern} escape '!'
    )`,
    sql`exists (
      select 1 from ${serviceResponsibles}
      inner join ${users} on ${users.id} = ${serviceResponsibles.userId}
      where ${serviceResponsibles.workspaceId} = ${services.workspaceId}
        and ${serviceResponsibles.serviceId} = ${services.id}
        and ${users.name} like ${pattern} escape '!'
    )`,
  );
}

function serviceListConditions(
  workspaceId: string,
  query: ServiceListQuery,
): SQL[] {
  const conditions: SQL[] = [eq(services.workspaceId, workspaceId)];
  const search = serviceSearchCondition(query.query);
  if (search) conditions.push(search);
  if (query.archived === "exclude")
    conditions.push(isNull(services.archivedAt));
  else if (query.archived === "only")
    conditions.push(isNotNull(services.archivedAt));
  return conditions;
}

function serviceOrdering(orderBy: ServiceListQuery["orderBy"]): [SQL, SQL] {
  if (orderBy === "name_asc")
    return [asc(sql`lower(${services.name})`), asc(services.id)];
  if (orderBy === "name_desc")
    return [desc(sql`lower(${services.name})`), desc(services.id)];
  return [desc(services.updatedAt), desc(services.id)];
}

export async function listWorkspaceServices(
  database: Database,
  context: RequestAuthorizationContext,
  query: ServiceListQuery,
): Promise<ServiceList> {
  return database.transaction(
    async (transaction) => {
      const workspaceId = workspaceIdFromContext(context);
      await requireWorkspacePermission(
        transaction,
        context.user.id,
        workspaceId,
        "workspace:read",
      );
      const conditions = serviceListConditions(workspaceId, query);
      const rows = await transaction
        .select()
        .from(services)
        .where(and(...conditions))
        .orderBy(...serviceOrdering(query.orderBy))
        .limit(query.pageSize)
        .offset((query.page - 1) * query.pageSize);
      const [totalRow] = await transaction
        .select({ value: count() })
        .from(services)
        .where(and(...conditions));
      const facetConditions = and(
        eq(services.workspaceId, workspaceId),
        serviceSearchCondition(query.query),
      );
      const [facetRow] = await transaction
        .select({ all: count() })
        .from(services)
        .where(facetConditions);
      const [archivedFacetRow] = await transaction
        .select({ archived: count() })
        .from(services)
        .where(and(facetConditions, isNotNull(services.archivedAt)));
      const total = totalRow?.value ?? 0;
      const archived = archivedFacetRow?.archived ?? 0;
      const active = (facetRow?.all ?? 0) - archived;
      return {
        workspaceId,
        items: await hydrateServices(transaction, rows),
        page: query.page,
        pageSize: query.pageSize,
        total,
        totalPages: Math.ceil(total / query.pageSize),
        facets: {
          all:
            query.archived === "only"
              ? archived
              : query.archived === "include"
                ? (facetRow?.all ?? 0)
                : active,
          archived,
        },
      };
    },
    { isolationLevel: "repeatable read", accessMode: "read only" },
  );
}

export async function getWorkspaceService(
  database: Database,
  context: RequestAuthorizationContext,
  serviceId: string,
): Promise<Service> {
  const workspaceId = workspaceIdFromContext(context);
  await requireWorkspacePermission(
    database,
    context.user.id,
    workspaceId,
    "workspace:read",
  );
  const row = await findScopedServiceRow(database, workspaceId, serviceId);
  if (!row) throw new ServiceNotFoundError();
  const [service] = await hydrateServices(database, [row]);
  if (!service) throw new ServiceNotFoundError();
  return service;
}

export async function createWorkspaceService(
  database: Database,
  context: RequestAuthorizationContext,
  input: ServiceMutationInput,
): Promise<Service> {
  const workspaceId = workspaceIdFromContext(context);
  try {
    return await database.transaction(async (transaction) => {
      await requireWorkspacePermissionForUpdate(
        transaction,
        context.user.id,
        workspaceId,
        "workspace:write",
      );
      await validateAndLockMembers(
        transaction,
        workspaceId,
        input.responsibleUserIds,
        () => new ServiceRelationsInvalidError(),
      );
      const tagRows = await resolveAndLockTags(
        transaction,
        workspaceId,
        input.tagLabels,
        new Set(),
        () => new ServiceRelationsInvalidError(),
      );
      const id = randomUUID();
      await transaction
        .insert(services)
        .values({
          id,
          workspaceId,
          name: input.name,
          description: input.description,
          icon: input.icon,
          color: input.color,
          defaultStatusKey: input.defaultStatus,
          defaultDurationDays: input.defaultDurationDays,
          defaultBriefing: input.defaultBriefing,
          defaultContractType: input.defaultContractType,
          defaultAmountCents: input.defaultAmountCents,
          defaultInstallmentCount: input.defaultInstallmentCount,
          defaultPaymentMethod: input.defaultPaymentMethod || null,
          defaultPaymentTerms: input.defaultPaymentTerms || null,
          defaultFinanceNotes: input.defaultFinanceNotes || null,
        });
      const [created] = await transaction
        .select()
        .from(services)
        .where(eq(services.id, id))
        .limit(1);
      if (!created) throw new Error("O servico nao pode ser criado.");
      await insertServiceDetails(
        transaction,
        workspaceId,
        created.id,
        tagRows,
        input.responsibleUserIds,
      );
      await touchWorkspaceConfiguration(transaction, workspaceId);
      const [service] = await hydrateServices(transaction, [created]);
      if (!service) throw new Error("O servico nao pode ser carregado.");
      return service;
    });
  } catch (error) {
    if (error instanceof ServiceRelationsInvalidError) throw error;
    translateServiceConstraint(error);
  }
}

export async function updateWorkspaceService(
  database: Database,
  context: RequestAuthorizationContext,
  serviceId: string,
  input: ServiceMutationInput,
): Promise<Service> {
  const workspaceId = workspaceIdFromContext(context);
  try {
    return await database.transaction(async (transaction) => {
      await requireWorkspacePermissionForUpdate(
        transaction,
        context.user.id,
        workspaceId,
        "workspace:write",
      );
      const existing = await findScopedServiceRow(
        transaction,
        workspaceId,
        serviceId,
        true,
      );
      if (!existing) throw new ServiceNotFoundError();
      await validateAndLockMembers(
        transaction,
        workspaceId,
        input.responsibleUserIds,
        () => new ServiceRelationsInvalidError(),
      );
      const previousTags = await existingTagIds(
        transaction,
        serviceTags,
        workspaceId,
        serviceId,
      );
      const tagRows = await resolveAndLockTags(
        transaction,
        workspaceId,
        input.tagLabels,
        previousTags,
        () => new ServiceRelationsInvalidError(),
      );
      const updated = await transaction
        .update(services)
        .set({
          name: input.name,
          description: input.description,
          icon: input.icon,
          color: input.color,
          defaultStatusKey: input.defaultStatus,
          defaultDurationDays: input.defaultDurationDays,
          defaultBriefing: input.defaultBriefing,
          defaultContractType: input.defaultContractType,
          defaultAmountCents: input.defaultAmountCents,
          defaultInstallmentCount: input.defaultInstallmentCount,
          defaultPaymentMethod: input.defaultPaymentMethod || null,
          defaultPaymentTerms: input.defaultPaymentTerms || null,
          defaultFinanceNotes: input.defaultFinanceNotes || null,
          version: sql`${services.version} + 1`,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(services.workspaceId, workspaceId),
            eq(services.id, serviceId),
          ),
        );
      if (affectedRows(updated) !== 1) throw new ServiceNotFoundError();
      await transaction
        .delete(serviceTags)
        .where(
          and(
            eq(serviceTags.workspaceId, workspaceId),
            eq(serviceTags.serviceId, serviceId),
          ),
        );
      await transaction
        .delete(serviceResponsibles)
        .where(
          and(
            eq(serviceResponsibles.workspaceId, workspaceId),
            eq(serviceResponsibles.serviceId, serviceId),
          ),
        );
      await insertServiceDetails(
        transaction,
        workspaceId,
        serviceId,
        tagRows,
        input.responsibleUserIds,
      );
      await touchWorkspaceConfiguration(transaction, workspaceId);
      const [service] = await hydrateServices(transaction, [{ ...existing, ...input, id: existing.id, workspaceId, version: existing.version + 1, updatedAt: new Date() }]);
      if (!service) throw new ServiceNotFoundError();
      return service;
    });
  } catch (error) {
    if (
      error instanceof ServiceNotFoundError ||
      error instanceof ServiceRelationsInvalidError
    ) {
      throw error;
    }
    translateServiceConstraint(error);
  }
}

export async function archiveWorkspaceService(
  database: Database,
  context: RequestAuthorizationContext,
  serviceId: string,
): Promise<void> {
  const workspaceId = workspaceIdFromContext(context);
  await database.transaction(async (transaction) => {
    await requireWorkspacePermissionForUpdate(
      transaction,
      context.user.id,
      workspaceId,
      "workspace:write",
    );
    const existing = await findScopedServiceRow(
      transaction,
      workspaceId,
      serviceId,
      true,
    );
    if (!existing) throw new ServiceNotFoundError();
    if (existing.archivedAt) return;
    const now = new Date();
    const updated = await transaction
      .update(services)
      .set({
        archivedAt: now,
        version: sql`${services.version} + 1`,
        updatedAt: now,
      })
      .where(
        and(eq(services.workspaceId, workspaceId), eq(services.id, serviceId)),
      );
    if (affectedRows(updated) !== 1) throw new ServiceNotFoundError();
    await touchWorkspaceConfiguration(transaction, workspaceId, now);
  });
}
