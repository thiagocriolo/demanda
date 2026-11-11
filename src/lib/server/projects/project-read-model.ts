import {
  and,
  asc,
  count,
  desc,
  eq,
  gte,
  inArray,
  isNotNull,
  isNull,
  lte,
  or,
  sql,
  type SQL,
} from "drizzle-orm";
import type {
  Project,
  ProjectList,
  ProjectOptions,
  ProjectResponsible,
  ProjectServiceSummary,
  ProjectTag,
} from "../../projects/types";
import type { RequestAuthorizationContext } from "../authorization/workspace-context";
import { requireWorkspacePermission } from "../authorization/workspace-context";
import type { Database } from "../db/database";
import {
  businesses,
  projectInstallments,
  projectResponsibles,
  projects,
  projectServices,
  projectTags,
  services,
  tags,
  tasks,
  users,
  workspaceMembers,
  workspaces,
} from "../db/schema";
import { ProjectNotFoundError } from "./errors";
import { hydrateServices } from "./service-catalog";
import {
  iso,
  memberDetails,
  workspaceIdFromContext,
  type ProjectDatabase,
} from "./shared";
import type { ProjectListQuery } from "./validation";

export async function findScopedProjectRow(
  database: ProjectDatabase,
  workspaceId: string,
  projectId: string,
  lock = false,
): Promise<typeof projects.$inferSelect | null> {
  let query = database
    .select()
    .from(projects)
    .where(
      and(eq(projects.workspaceId, workspaceId), eq(projects.id, projectId)),
    )
    .limit(1);
  if (lock) query = query.for("update") as typeof query;
  const [row] = await query;
  return row ?? null;
}

export async function hydrateProjects(
  database: ProjectDatabase,
  rows: (typeof projects.$inferSelect)[],
  viewerUserId: string,
): Promise<Project[]> {
  if (!rows.length) return [];
  const workspaceId = rows[0]!.workspaceId;
  const ids = rows.map(({ id }) => id);
  const businessIds = [...new Set(rows.map(({ businessId }) => businessId))];
  const businessRows = await database
    .select({
      id: businesses.id,
      name: businesses.name,
      ownerUserId: businesses.ownerUserId,
      archivedAt: businesses.archivedAt,
    })
    .from(businesses)
    .where(inArray(businesses.id, businessIds));
  const serviceRows = await database
    .select({
      projectId: projectServices.projectId,
      id: services.id,
      name: services.name,
      description: services.description,
      icon: services.icon,
      color: services.color,
      archivedAt: services.archivedAt,
    })
    .from(projectServices)
    .innerJoin(
      services,
      and(
        eq(services.workspaceId, projectServices.workspaceId),
        eq(services.id, projectServices.serviceId),
      ),
    )
    .where(
      and(
        eq(projectServices.workspaceId, workspaceId),
        inArray(projectServices.projectId, ids),
      ),
    )
    .orderBy(asc(projectServices.sortOrder), asc(services.id));
  const tagRows = await database
    .select({
      projectId: projectTags.projectId,
      id: tags.id,
      name: tags.label,
      archivedAt: tags.archivedAt,
    })
    .from(projectTags)
    .innerJoin(
      tags,
      and(
        eq(tags.workspaceId, projectTags.workspaceId),
        eq(tags.id, projectTags.tagId),
      ),
    )
    .where(
      and(
        eq(projectTags.workspaceId, workspaceId),
        inArray(projectTags.projectId, ids),
      ),
    )
    .orderBy(asc(projectTags.sortOrder), asc(tags.id));
  const responsibleRows = await database
    .select({
      projectId: projectResponsibles.projectId,
      userId: workspaceMembers.userId,
      name: users.name,
      email: users.email,
      avatarUrl: users.avatarUrl,
      role: workspaceMembers.role,
    })
    .from(projectResponsibles)
    .innerJoin(
      workspaceMembers,
      and(
        eq(workspaceMembers.workspaceId, projectResponsibles.workspaceId),
        eq(workspaceMembers.userId, projectResponsibles.userId),
      ),
    )
    .innerJoin(users, eq(users.id, workspaceMembers.userId))
    .where(
      and(
        eq(projectResponsibles.workspaceId, workspaceId),
        inArray(projectResponsibles.projectId, ids),
      ),
    )
    .orderBy(asc(projectResponsibles.sortOrder), asc(users.id));
  const installmentRows = await database
    .select()
    .from(projectInstallments)
    .where(
      and(
        eq(projectInstallments.workspaceId, workspaceId),
        inArray(projectInstallments.projectId, ids),
      ),
    )
    .orderBy(asc(projectInstallments.number), asc(projectInstallments.id));

  const businessById = new Map(
    businessRows.map((business) => [business.id, business]),
  );
  const servicesByProject = new Map<string, ProjectServiceSummary[]>();
  const tagsByProject = new Map<string, ProjectTag[]>();
  const responsiblesByProject = new Map<string, ProjectResponsible[]>();
  const installmentsByProject = new Map<string, Project["installments"]>();
  for (const service of serviceRows) {
    const values = servicesByProject.get(service.projectId) ?? [];
    values.push({
      id: service.id,
      name: service.name,
      description: service.description,
      icon: service.icon,
      color: service.color,
      archivedAt: iso(service.archivedAt),
    });
    servicesByProject.set(service.projectId, values);
  }
  for (const tag of tagRows) {
    const values = tagsByProject.get(tag.projectId) ?? [];
    values.push({
      id: tag.id,
      name: tag.name,
      archivedAt: iso(tag.archivedAt),
    });
    tagsByProject.set(tag.projectId, values);
  }
  for (const responsible of responsibleRows) {
    const values = responsiblesByProject.get(responsible.projectId) ?? [];
    values.push({
      userId: responsible.userId,
      name: responsible.name,
      email: responsible.email,
      avatarUrl: responsible.avatarUrl,
      role: responsible.role,
    });
    responsiblesByProject.set(responsible.projectId, values);
  }
  for (const installment of installmentRows) {
    const values = installmentsByProject.get(installment.projectId) ?? [];
    values.push({
      id: installment.id,
      number: installment.number,
      dueDate: installment.dueDate,
      amountCents: installment.amountCents,
      status: installment.statusKey ?? "pending",
    });
    installmentsByProject.set(installment.projectId, values);
  }

  return rows.map((row) => {
    const business = businessById.get(row.businessId);
    if (!business) throw new ProjectNotFoundError();
    return {
      id: row.id,
      workspaceId: row.workspaceId,
      sourceServiceId: row.sourceServiceId,
      isInstitutional: row.isInstitutional,
      name: row.name,
      business: {
        id: business.id,
        name: business.name,
        archivedAt:
          business.ownerUserId === viewerUserId
            ? iso(business.archivedAt)
            : null,
      },
      services: servicesByProject.get(row.id) ?? [],
      status: row.statusKey,
      startDate: row.startDate ?? "",
      endDate: row.endDate,
      briefing: row.briefing,
      tags: tagsByProject.get(row.id) ?? [],
      responsibles: responsiblesByProject.get(row.id) ?? [],
      contractType: row.contractType as Project["contractType"],
      amountCents: row.amountCents ?? 0,
      firstDueDate: row.firstDueDate,
      paymentMethod: row.paymentMethod ?? "",
      paymentTerms: row.paymentTerms ?? "",
      financeNotes: row.financeNotes ?? "",
      installments: installmentsByProject.get(row.id) ?? [],
      archivedAt: iso(row.archivedAt),
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  });
}

function projectSearchCondition(query: string): SQL | undefined {
  if (!query) return undefined;
  const pattern = `%${query.replace(/[!%_]/g, (character) => `!${character}`)}%`;
  return or(
    sql`${projects.name} like ${pattern} escape '!'`,
    sql`${projects.briefing} like ${pattern} escape '!'`,
    sql`exists (
      select 1 from ${businesses}
      where ${businesses.id} = ${projects.businessId}
        and ${businesses.name} like ${pattern} escape '!'
    )`,
    sql`exists (
      select 1 from ${projectServices}
      inner join ${services}
        on ${services.workspaceId} = ${projectServices.workspaceId}
       and ${services.id} = ${projectServices.serviceId}
      where ${projectServices.workspaceId} = ${projects.workspaceId}
        and ${projectServices.projectId} = ${projects.id}
        and ${services.name} like ${pattern} escape '!'
    )`,
    sql`exists (
      select 1 from ${projectTags}
      inner join ${tags}
        on ${tags.workspaceId} = ${projectTags.workspaceId}
       and ${tags.id} = ${projectTags.tagId}
      where ${projectTags.workspaceId} = ${projects.workspaceId}
        and ${projectTags.projectId} = ${projects.id}
        and ${tags.label} like ${pattern} escape '!'
    )`,
    sql`exists (
      select 1 from ${projectResponsibles}
      inner join ${users} on ${users.id} = ${projectResponsibles.userId}
      where ${projectResponsibles.workspaceId} = ${projects.workspaceId}
        and ${projectResponsibles.projectId} = ${projects.id}
        and ${users.name} like ${pattern} escape '!'
    )`,
  );
}

function projectCommonConditions(
  workspaceId: string,
  query: ProjectListQuery,
): SQL[] {
  const conditions: SQL[] = [eq(projects.workspaceId, workspaceId)];
  if (!query.includeEmptyInstitutional) {
    conditions.push(sql`(
      not ${projects.isInstitutional}
      or exists (
        select 1 from ${tasks}
        where ${tasks.workspaceId} = ${projects.workspaceId}
          and ${tasks.projectId} = ${projects.id}
      )
    )`);
  }
  const search = projectSearchCondition(query.query);
  if (search) conditions.push(search);
  if (query.businessId)
    conditions.push(eq(projects.businessId, query.businessId));
  if (query.responsibleUserId) {
    conditions.push(sql`exists (
      select 1 from ${projectResponsibles}
      where ${projectResponsibles.workspaceId} = ${projects.workspaceId}
        and ${projectResponsibles.projectId} = ${projects.id}
        and ${projectResponsibles.userId} = ${query.responsibleUserId}
    )`);
  }
  if (query.tagId) {
    conditions.push(sql`exists (
      select 1 from ${projectTags}
      where ${projectTags.workspaceId} = ${projects.workspaceId}
        and ${projectTags.projectId} = ${projects.id}
        and ${projectTags.tagId} = ${query.tagId}
    )`);
  }
  if (query.startFrom)
    conditions.push(gte(projects.startDate, query.startFrom));
  if (query.startTo) conditions.push(lte(projects.startDate, query.startTo));
  if (query.endFrom) conditions.push(gte(projects.endDate, query.endFrom));
  if (query.endTo) conditions.push(lte(projects.endDate, query.endTo));
  return conditions;
}

function projectListConditions(
  workspaceId: string,
  query: ProjectListQuery,
): SQL[] {
  const conditions = projectCommonConditions(workspaceId, query);
  if (query.status) conditions.push(eq(projects.statusKey, query.status));
  if (query.serviceId) {
    conditions.push(sql`exists (
      select 1 from ${projectServices}
      where ${projectServices.workspaceId} = ${projects.workspaceId}
        and ${projectServices.projectId} = ${projects.id}
        and ${projectServices.serviceId} = ${query.serviceId}
    )`);
  }
  if (query.archived === "exclude")
    conditions.push(isNull(projects.archivedAt));
  else if (query.archived === "only")
    conditions.push(isNotNull(projects.archivedAt));
  return conditions;
}

function projectOrdering(orderBy: ProjectListQuery["orderBy"]): [SQL, SQL] {
  if (orderBy === "name_asc")
    return [asc(sql`lower(${projects.name})`), asc(projects.id)];
  if (orderBy === "name_desc")
    return [desc(sql`lower(${projects.name})`), desc(projects.id)];
  if (orderBy === "start_asc")
    return [asc(projects.startDate), asc(projects.id)];
  if (orderBy === "end_asc") return [asc(projects.endDate), asc(projects.id)];
  return [desc(projects.updatedAt), desc(projects.id)];
}

export async function listWorkspaceProjects(
  database: Database,
  context: RequestAuthorizationContext,
  query: ProjectListQuery,
): Promise<ProjectList> {
  return database.transaction(
    async (transaction) => {
      const workspaceId = query.workspaceId ?? workspaceIdFromContext(context);
      await requireWorkspacePermission(
        transaction,
        context.user.id,
        workspaceId,
        "workspace:read",
      );
      const conditions = projectListConditions(workspaceId, query);
      const common = projectCommonConditions(workspaceId, query);
      const serviceFacetConditions = [...common];
      if (query.status) {
        serviceFacetConditions.push(eq(projects.statusKey, query.status));
      }
      if (query.archived === "exclude") {
        serviceFacetConditions.push(isNull(projects.archivedAt));
      } else if (query.archived === "only") {
        serviceFacetConditions.push(isNotNull(projects.archivedAt));
      }
      const rows = await transaction
        .select()
        .from(projects)
        .where(and(...conditions))
        .orderBy(...projectOrdering(query.orderBy))
        .limit(query.pageSize)
        .offset((query.page - 1) * query.pageSize);
      const [totalRow] = await transaction
        .select({ value: count() })
        .from(projects)
        .where(and(...conditions));
      const statusRows = await transaction
        .select({
          status: projects.statusKey,
          archived: sql<boolean>`${projects.archivedAt} is not null`,
          value: count(),
        })
        .from(projects)
        .where(and(...common))
        .groupBy(projects.statusKey, sql`${projects.archivedAt} is not null`);
      const serviceRows = await transaction
        .select({ serviceId: projectServices.serviceId, value: count() })
        .from(projectServices)
        .innerJoin(
          projects,
          and(
            eq(projects.workspaceId, projectServices.workspaceId),
            eq(projects.id, projectServices.projectId),
          ),
        )
        .where(and(...serviceFacetConditions))
        .groupBy(projectServices.serviceId);
      const facets: ProjectList["facets"] = {
        all: 0,
        archived: 0,
        statuses: {},
        services: {},
      };
      let active = 0;
      for (const row of statusRows) {
        if (row.archived) facets.archived += row.value;
        else {
          active += row.value;
          facets.statuses[row.status] =
            (facets.statuses[row.status] ?? 0) + row.value;
        }
      }
      for (const row of serviceRows) facets.services[row.serviceId] = row.value;
      facets.all =
        query.archived === "only"
          ? facets.archived
          : query.archived === "include"
            ? active + facets.archived
            : active;
      const total = totalRow?.value ?? 0;
      return {
        workspaceId,
        items: await hydrateProjects(transaction, rows, context.user.id),
        page: query.page,
        pageSize: query.pageSize,
        total,
        totalPages: Math.ceil(total / query.pageSize),
        facets,
      };
    },
    { isolationLevel: "repeatable read", accessMode: "read only" },
  );
}

export async function getWorkspaceProject(
  database: Database,
  context: RequestAuthorizationContext,
  projectId: string,
): Promise<Project> {
  const workspaceId = workspaceIdFromContext(context);
  await requireWorkspacePermission(
    database,
    context.user.id,
    workspaceId,
    "workspace:read",
  );
  const row = await findScopedProjectRow(database, workspaceId, projectId);
  if (!row) throw new ProjectNotFoundError();
  const [project] = await hydrateProjects(database, [row], context.user.id);
  if (!project) throw new ProjectNotFoundError();
  return project;
}

export async function getWorkspaceProjectOptions(
  database: Database,
  context: RequestAuthorizationContext,
  requestedWorkspaceId?: string,
): Promise<ProjectOptions> {
  return database.transaction(
    async (transaction) => {
      const workspaceId =
        requestedWorkspaceId ?? workspaceIdFromContext(context);
      await requireWorkspacePermission(
        transaction,
        context.user.id,
        workspaceId,
        "workspace:read",
      );
      const [workspace] = await transaction
        .select({ id: workspaces.id, name: workspaces.name })
        .from(workspaces)
        .where(eq(workspaces.id, workspaceId))
        .limit(1);
      if (!workspace) throw new ProjectNotFoundError();
      const serviceRows = await transaction
        .select()
        .from(services)
        .where(
          and(
            eq(services.workspaceId, workspaceId),
            isNull(services.archivedAt),
          ),
        )
        .orderBy(asc(sql`lower(${services.name})`), asc(services.id));
      const tagRows = await transaction
        .select({
          id: tags.id,
          name: tags.label,
          archivedAt: sql<null>`null`,
        })
        .from(tags)
        .where(and(eq(tags.workspaceId, workspaceId), isNull(tags.archivedAt)))
        .orderBy(asc(sql`lower(${tags.label})`), asc(tags.id));
      return {
        workspaceId,
        workspaceName: workspace.name,
        members: await memberDetails(transaction, workspaceId),
        services: await hydrateServices(transaction, serviceRows),
        tags: tagRows,
      };
    },
    { isolationLevel: "repeatable read", accessMode: "read only" },
  );
}
