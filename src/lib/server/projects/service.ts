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
  ProjectFromServiceInput,
  ProjectInstallmentInput,
  ProjectList,
  ProjectMutationInput,
  ProjectOptions,
  ProjectResponsible,
  ProjectServiceSummary,
  ProjectTag,
  Service,
  ServiceList,
  ServiceMutationInput,
} from "../../projects/types";
import type { RequestAuthorizationContext } from "../authorization/workspace-context";
import {
  requireActiveWorkspacePermission,
  requireWorkspacePermission,
  requireWorkspacePermissionForUpdate,
} from "../authorization/workspace-context";
import type { Database } from "../db/database";
import {
  businesses,
  projectInstallments,
  projectResponsibles,
  projects,
  projectServices,
  projectTags,
  serviceResponsibles,
  services,
  serviceTags,
  tags,
  tasks,
  users,
  workspaceMembers,
  workspaces,
} from "../db/schema";
import {
  normalizeProjectTagLabel,
  projectMutationSchema,
  projectTagKey,
  type ProjectListQuery,
  type ServiceListQuery,
} from "./validation";
import { touchWorkspaceConfiguration } from "../settings/version";

type ProjectDatabase = Pick<
  Database,
  "select" | "insert" | "update" | "delete"
>;

export class ProjectNotFoundError extends Error {
  readonly status = 404;

  constructor() {
    super("Projeto nao encontrado.");
    this.name = "ProjectNotFoundError";
  }
}

export class InstitutionalProjectProtectedError extends Error {
  readonly status = 409;

  constructor() {
    super(
      "O projeto institucional e gerenciado pelo sistema e nao pode ser alterado ou excluido.",
    );
    this.name = "InstitutionalProjectProtectedError";
  }
}

export class ServiceNotFoundError extends Error {
  readonly status = 404;

  constructor() {
    super("Servico nao encontrado.");
    this.name = "ServiceNotFoundError";
  }
}

export class ProjectRelationsInvalidError extends Error {
  readonly status = 400;

  constructor() {
    super("Um ou mais vinculos do projeto nao sao validos.");
    this.name = "ProjectRelationsInvalidError";
  }
}

export class ServiceRelationsInvalidError extends Error {
  readonly status = 400;

  constructor() {
    super("Um ou mais vinculos do servico nao sao validos.");
    this.name = "ServiceRelationsInvalidError";
  }
}

export class ServiceNameConflictError extends Error {
  readonly status = 409;

  constructor() {
    super("Ja existe um servico ativo com esse nome.");
    this.name = "ServiceNameConflictError";
  }
}

function workspaceIdFromContext(context: RequestAuthorizationContext): string {
  return requireActiveWorkspacePermission(context, "workspace:read").workspace
    .id;
}

function iso(value: Date | null): string | null {
  return value?.toISOString() ?? null;
}

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (character) => `\\${character}`);
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

function translateProjectConstraint(error: unknown): never {
  const constraint = databaseConstraint(error);
  if (
    constraint?.includes("workspace_business_foreign_key") ||
    constraint?.includes("workspace_service_foreign_key") ||
    constraint?.includes("workspace_tag_foreign_key") ||
    constraint?.includes("workspace_member_foreign_key") ||
    constraint?.includes("workspace_source_service_foreign_key")
  ) {
    throw new ProjectRelationsInvalidError();
  }
  throw error;
}

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

async function findScopedProjectRow(
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

async function memberDetails(
  database: ProjectDatabase,
  workspaceId: string,
  userIds?: string[],
): Promise<ProjectResponsible[]> {
  if (userIds && !userIds.length) return [];
  const conditions: SQL[] = [eq(workspaceMembers.workspaceId, workspaceId)];
  if (userIds) conditions.push(inArray(workspaceMembers.userId, userIds));
  const rows = await database
    .select({
      userId: workspaceMembers.userId,
      name: users.name,
      email: users.email,
      avatarUrl: users.avatarUrl,
      role: workspaceMembers.role,
    })
    .from(workspaceMembers)
    .innerJoin(users, eq(users.id, workspaceMembers.userId))
    .where(and(...conditions))
    .orderBy(asc(sql`lower(${users.name})`), asc(users.id));
  return rows;
}

async function hydrateServices(
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

async function hydrateProjects(
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

async function validateAndLockMembers(
  database: ProjectDatabase,
  workspaceId: string,
  userIds: string[],
  errorFactory: () => Error,
): Promise<void> {
  if (
    userIds.length < 1 ||
    userIds.length > 20 ||
    new Set(userIds).size !== userIds.length
  ) {
    throw errorFactory();
  }
  const rows = await database
    .select({ userId: workspaceMembers.userId })
    .from(workspaceMembers)
    .where(
      and(
        eq(workspaceMembers.workspaceId, workspaceId),
        inArray(workspaceMembers.userId, [...userIds].sort()),
      ),
    )
    .orderBy(asc(workspaceMembers.userId))
    .for("update");
  if (rows.length !== userIds.length) throw errorFactory();
}

async function validateAndLockBusiness(
  database: ProjectDatabase,
  businessId: string,
  actorUserId: string,
  previouslyLinkedId?: string,
): Promise<void> {
  const [row] = await database
    .select({
      id: businesses.id,
      ownerUserId: businesses.ownerUserId,
      archivedAt: businesses.archivedAt,
    })
    .from(businesses)
    .where(eq(businesses.id, businessId))
    .limit(1)
    .for("update");
  const retainingExistingLink = row?.id === previouslyLinkedId;
  if (
    !row ||
    (!retainingExistingLink &&
      (row.ownerUserId !== actorUserId || row.archivedAt !== null))
  ) {
    throw new ProjectRelationsInvalidError();
  }
}

async function validateAndLockServices(
  database: ProjectDatabase,
  workspaceId: string,
  serviceIds: string[],
  previouslyLinked = new Set<string>(),
): Promise<(typeof services.$inferSelect)[]> {
  if (
    serviceIds.length > 20 ||
    new Set(serviceIds).size !== serviceIds.length
  ) {
    throw new ProjectRelationsInvalidError();
  }
  if (!serviceIds.length) return [];
  const rows = await database
    .select()
    .from(services)
    .where(
      and(
        eq(services.workspaceId, workspaceId),
        inArray(services.id, [...serviceIds].sort()),
      ),
    )
    .orderBy(asc(services.id))
    .for("update");
  if (
    rows.length !== serviceIds.length ||
    rows.some((row) => row.archivedAt && !previouslyLinked.has(row.id))
  ) {
    throw new ProjectRelationsInvalidError();
  }
  return rows;
}

async function existingTagIds(
  database: ProjectDatabase,
  table: typeof serviceTags | typeof projectTags,
  workspaceId: string,
  parentId: string,
): Promise<Set<string>> {
  const parentColumn =
    table === serviceTags ? serviceTags.serviceId : projectTags.projectId;
  const rows = await database
    .select({ tagId: table.tagId })
    .from(table)
    .where(and(eq(table.workspaceId, workspaceId), eq(parentColumn, parentId)));
  return new Set(rows.map(({ tagId }) => tagId));
}

async function resolveAndLockTags(
  database: ProjectDatabase,
  workspaceId: string,
  labels: string[],
  previouslyLinked = new Set<string>(),
  errorFactory: () => Error,
): Promise<(typeof tags.$inferSelect)[]> {
  const normalized = labels.map((label) => ({
    key: projectTagKey(label),
    label: normalizeProjectTagLabel(label),
  }));
  if (
    normalized.length > 30 ||
    normalized.some(({ key }) => !/^[a-z0-9][a-z0-9_-]{0,63}$/u.test(key)) ||
    new Set(normalized.map(({ key }) => key)).size !== normalized.length
  ) {
    throw errorFactory();
  }
  if (!normalized.length) return [];
  const createdTags = await database
    .insert(tags)
    .values(normalized.map(({ key, label }) => ({ workspaceId, key, label })))
    .onConflictDoNothing({ target: [tags.workspaceId, tags.key] })
    .returning({ id: tags.id });
  if (createdTags.length) {
    await touchWorkspaceConfiguration(database, workspaceId);
  }
  const rows = await database
    .select()
    .from(tags)
    .where(
      and(
        eq(tags.workspaceId, workspaceId),
        inArray(tags.key, normalized.map(({ key }) => key).sort()),
      ),
    )
    .orderBy(asc(tags.key))
    .for("update");
  if (
    rows.length !== normalized.length ||
    rows.some((row) => row.archivedAt && !previouslyLinked.has(row.id))
  ) {
    throw errorFactory();
  }
  const byKey = new Map(rows.map((row) => [row.key, row]));
  return normalized.map(({ key }) => byKey.get(key)!).filter(Boolean);
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

async function insertProjectDetails(
  database: ProjectDatabase,
  workspaceId: string,
  projectId: string,
  input: ProjectMutationInput,
  tagRows: (typeof tags.$inferSelect)[],
): Promise<void> {
  if (input.serviceIds.length) {
    await database.insert(projectServices).values(
      input.serviceIds.map((serviceId, sortOrder) => ({
        workspaceId,
        projectId,
        serviceId,
        sortOrder,
      })),
    );
  }
  if (tagRows.length) {
    await database.insert(projectTags).values(
      tagRows.map((tag, sortOrder) => ({
        workspaceId,
        projectId,
        tagId: tag.id,
        sortOrder,
      })),
    );
  }
  await database.insert(projectResponsibles).values(
    input.responsibleUserIds.map((userId, sortOrder) => ({
      workspaceId,
      projectId,
      userId,
      sortOrder,
    })),
  );
  if (input.installments.length) {
    await database.insert(projectInstallments).values(
      input.installments.map((installment) => ({
        workspaceId,
        projectId,
        number: installment.number,
        dueDate: installment.dueDate,
        amountCents: installment.amountCents,
        statusKey: installment.status,
      })),
    );
  }
}

function serviceSearchCondition(query: string): SQL | undefined {
  if (!query) return undefined;
  const pattern = `%${escapeLike(query)}%`;
  return or(
    sql`${services.name} ilike ${pattern} escape '\\'`,
    sql`${services.description} ilike ${pattern} escape '\\'`,
    sql`${services.defaultBriefing} ilike ${pattern} escape '\\'`,
    sql`exists (
      select 1 from ${serviceTags}
      inner join ${tags}
        on ${tags.workspaceId} = ${serviceTags.workspaceId}
       and ${tags.id} = ${serviceTags.tagId}
      where ${serviceTags.workspaceId} = ${services.workspaceId}
        and ${serviceTags.serviceId} = ${services.id}
        and ${tags.label} ilike ${pattern} escape '\\'
    )`,
    sql`exists (
      select 1 from ${serviceResponsibles}
      inner join ${users} on ${users.id} = ${serviceResponsibles.userId}
      where ${serviceResponsibles.workspaceId} = ${services.workspaceId}
        and ${serviceResponsibles.serviceId} = ${services.id}
        and ${users.name} ilike ${pattern} escape '\\'
    )`,
  );
}

function projectSearchCondition(query: string): SQL | undefined {
  if (!query) return undefined;
  const pattern = `%${escapeLike(query)}%`;
  return or(
    sql`${projects.name} ilike ${pattern} escape '\\'`,
    sql`${projects.briefing} ilike ${pattern} escape '\\'`,
    sql`exists (
      select 1 from ${businesses}
      where ${businesses.id} = ${projects.businessId}
        and ${businesses.name} ilike ${pattern} escape '\\'
    )`,
    sql`exists (
      select 1 from ${projectServices}
      inner join ${services}
        on ${services.workspaceId} = ${projectServices.workspaceId}
       and ${services.id} = ${projectServices.serviceId}
      where ${projectServices.workspaceId} = ${projects.workspaceId}
        and ${projectServices.projectId} = ${projects.id}
        and ${services.name} ilike ${pattern} escape '\\'
    )`,
    sql`exists (
      select 1 from ${projectTags}
      inner join ${tags}
        on ${tags.workspaceId} = ${projectTags.workspaceId}
       and ${tags.id} = ${projectTags.tagId}
      where ${projectTags.workspaceId} = ${projects.workspaceId}
        and ${projectTags.projectId} = ${projects.id}
        and ${tags.label} ilike ${pattern} escape '\\'
    )`,
    sql`exists (
      select 1 from ${projectResponsibles}
      inner join ${users} on ${users.id} = ${projectResponsibles.userId}
      where ${projectResponsibles.workspaceId} = ${projects.workspaceId}
        and ${projectResponsibles.projectId} = ${projects.id}
        and ${users.name} ilike ${pattern} escape '\\'
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

function serviceOrdering(orderBy: ServiceListQuery["orderBy"]): [SQL, SQL] {
  if (orderBy === "name_asc")
    return [asc(sql`lower(${services.name})`), asc(services.id)];
  if (orderBy === "name_desc")
    return [desc(sql`lower(${services.name})`), desc(services.id)];
  return [desc(services.updatedAt), desc(services.id)];
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
      const [created] = await transaction
        .insert(services)
        .values({
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
        })
        .returning();
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
      const [updated] = await transaction
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
        )
        .returning();
      if (!updated) throw new ServiceNotFoundError();
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
      const [service] = await hydrateServices(transaction, [updated]);
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
      )
      .returning({ id: services.id });
    if (updated.length !== 1) throw new ServiceNotFoundError();
    await touchWorkspaceConfiguration(transaction, workspaceId, now);
  });
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

async function createProjectInTransaction(
  transaction: ProjectDatabase,
  workspaceId: string,
  actorUserId: string,
  input: ProjectMutationInput,
  sourceServiceId: string | null,
): Promise<Project> {
  await validateAndLockBusiness(transaction, input.businessId, actorUserId);
  await validateAndLockServices(transaction, workspaceId, input.serviceIds);
  await validateAndLockMembers(
    transaction,
    workspaceId,
    input.responsibleUserIds,
    () => new ProjectRelationsInvalidError(),
  );
  const tagRows = await resolveAndLockTags(
    transaction,
    workspaceId,
    input.tagLabels,
    new Set(),
    () => new ProjectRelationsInvalidError(),
  );
  const [created] = await transaction
    .insert(projects)
    .values({
      workspaceId,
      businessId: input.businessId,
      sourceServiceId,
      name: input.name,
      statusKey: input.status,
      briefing: input.briefing,
      startDate: input.startDate,
      endDate: input.endDate,
      contractType: input.contractType,
      amountCents: input.amountCents,
      firstDueDate: input.firstDueDate,
      paymentMethod: input.paymentMethod || null,
      paymentTerms: input.paymentTerms || null,
      financeNotes: input.financeNotes || null,
    })
    .returning();
  if (!created) throw new Error("O projeto nao pode ser criado.");
  await insertProjectDetails(
    transaction,
    workspaceId,
    created.id,
    input,
    tagRows,
  );
  const [project] = await hydrateProjects(transaction, [created], actorUserId);
  if (!project) throw new Error("O projeto nao pode ser carregado.");
  return project;
}

export async function createWorkspaceProject(
  database: Database,
  context: RequestAuthorizationContext,
  input: ProjectMutationInput,
): Promise<Project> {
  const workspaceId = workspaceIdFromContext(context);
  try {
    return await database.transaction(async (transaction) => {
      await requireWorkspacePermissionForUpdate(
        transaction,
        context.user.id,
        workspaceId,
        "workspace:write",
      );
      return createProjectInTransaction(
        transaction,
        workspaceId,
        context.user.id,
        input,
        null,
      );
    });
  } catch (error) {
    if (error instanceof ProjectRelationsInvalidError) throw error;
    translateProjectConstraint(error);
  }
}

export async function updateWorkspaceProject(
  database: Database,
  context: RequestAuthorizationContext,
  projectId: string,
  input: ProjectMutationInput,
): Promise<Project> {
  const workspaceId = workspaceIdFromContext(context);
  try {
    return await database.transaction(async (transaction) => {
      await requireWorkspacePermissionForUpdate(
        transaction,
        context.user.id,
        workspaceId,
        "workspace:write",
      );
      const existing = await findScopedProjectRow(
        transaction,
        workspaceId,
        projectId,
        true,
      );
      if (!existing) throw new ProjectNotFoundError();
      if (existing.isInstitutional) {
        throw new InstitutionalProjectProtectedError();
      }
      await validateAndLockBusiness(
        transaction,
        input.businessId,
        context.user.id,
        existing.businessId,
      );
      const previousServices = new Set(
        (
          await transaction
            .select({ serviceId: projectServices.serviceId })
            .from(projectServices)
            .where(
              and(
                eq(projectServices.workspaceId, workspaceId),
                eq(projectServices.projectId, projectId),
              ),
            )
        ).map(({ serviceId }) => serviceId),
      );
      await validateAndLockServices(
        transaction,
        workspaceId,
        input.serviceIds,
        previousServices,
      );
      await validateAndLockMembers(
        transaction,
        workspaceId,
        input.responsibleUserIds,
        () => new ProjectRelationsInvalidError(),
      );
      const previousTags = await existingTagIds(
        transaction,
        projectTags,
        workspaceId,
        projectId,
      );
      const tagRows = await resolveAndLockTags(
        transaction,
        workspaceId,
        input.tagLabels,
        previousTags,
        () => new ProjectRelationsInvalidError(),
      );
      const businessChanged = existing.businessId !== input.businessId;
      const now = new Date();
      const updatedRows = await transaction
        .update(projects)
        .set({
          businessId: input.businessId,
          name: input.name,
          statusKey: input.status,
          briefing: input.briefing,
          startDate: input.startDate,
          endDate: input.endDate,
          contractType: input.contractType,
          amountCents: input.amountCents,
          firstDueDate: input.firstDueDate,
          paymentMethod: input.paymentMethod || null,
          paymentTerms: input.paymentTerms || null,
          financeNotes: input.financeNotes || null,
          updatedAt: now,
        })
        .where(
          and(
            eq(projects.workspaceId, workspaceId),
            eq(projects.id, projectId),
          ),
        )
        .returning();
      if (updatedRows.length !== 1) throw new ProjectNotFoundError();
      const updated = updatedRows[0]!;
      if (businessChanged) {
        await transaction
          .update(tasks)
          .set({
            boardOrder: sql`${tasks.boardOrder} - 'business'`,
            version: sql`${tasks.version} + 1`,
            updatedAt: now,
          })
          .where(
            and(
              eq(tasks.workspaceId, workspaceId),
              eq(tasks.projectId, projectId),
            ),
          );
      }
      await transaction
        .delete(projectServices)
        .where(
          and(
            eq(projectServices.workspaceId, workspaceId),
            eq(projectServices.projectId, projectId),
          ),
        );
      await transaction
        .delete(projectTags)
        .where(
          and(
            eq(projectTags.workspaceId, workspaceId),
            eq(projectTags.projectId, projectId),
          ),
        );
      await transaction
        .delete(projectResponsibles)
        .where(
          and(
            eq(projectResponsibles.workspaceId, workspaceId),
            eq(projectResponsibles.projectId, projectId),
          ),
        );
      await transaction
        .delete(projectInstallments)
        .where(
          and(
            eq(projectInstallments.workspaceId, workspaceId),
            eq(projectInstallments.projectId, projectId),
          ),
        );
      await insertProjectDetails(
        transaction,
        workspaceId,
        projectId,
        input,
        tagRows,
      );
      const [project] = await hydrateProjects(
        transaction,
        [updated],
        context.user.id,
      );
      if (!project) throw new ProjectNotFoundError();
      return project;
    });
  } catch (error) {
    if (
      error instanceof InstitutionalProjectProtectedError ||
      error instanceof ProjectNotFoundError ||
      error instanceof ProjectRelationsInvalidError
    ) {
      throw error;
    }
    translateProjectConstraint(error);
  }
}

export async function archiveWorkspaceProject(
  database: Database,
  context: RequestAuthorizationContext,
  projectId: string,
): Promise<void> {
  const workspaceId = workspaceIdFromContext(context);
  await database.transaction(async (transaction) => {
    await requireWorkspacePermissionForUpdate(
      transaction,
      context.user.id,
      workspaceId,
      "workspace:write",
    );
    const existing = await findScopedProjectRow(
      transaction,
      workspaceId,
      projectId,
      true,
    );
    if (!existing) throw new ProjectNotFoundError();
    if (existing.isInstitutional) {
      throw new InstitutionalProjectProtectedError();
    }
    if (existing.archivedAt) return;
    const updated = await transaction
      .update(projects)
      .set({ archivedAt: new Date(), updatedAt: new Date() })
      .where(
        and(eq(projects.workspaceId, workspaceId), eq(projects.id, projectId)),
      )
      .returning({ id: projects.id });
    if (updated.length !== 1) throw new ProjectNotFoundError();
  });
}

function addDays(dateValue: string, days: number): string {
  const date = new Date(`${dateValue}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function addCalendarMonths(dateValue: string, months: number): string {
  const [year, month, day] = dateValue.split("-").map(Number);
  const first = new Date(Date.UTC(year!, month! - 1 + months, 1));
  const lastDay = new Date(
    Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0),
  ).getUTCDate();
  first.setUTCDate(Math.min(day!, lastDay));
  return first.toISOString().slice(0, 10);
}

function generateInstallments(
  amountCents: number,
  count: number,
  firstDueDate: string,
): ProjectInstallmentInput[] {
  if (amountCents <= 0) return [];
  const base = Math.trunc(amountCents / count);
  return Array.from({ length: count }, (_, index) => ({
    number: index + 1,
    dueDate: addCalendarMonths(firstDueDate, index),
    amountCents: index === count - 1 ? amountCents - base * (count - 1) : base,
    status: "pending",
  }));
}

export async function createWorkspaceProjectFromService(
  database: Database,
  context: RequestAuthorizationContext,
  input: ProjectFromServiceInput,
): Promise<Project> {
  const workspaceId = workspaceIdFromContext(context);
  try {
    return await database.transaction(async (transaction) => {
      await requireWorkspacePermissionForUpdate(
        transaction,
        context.user.id,
        workspaceId,
        "workspace:write",
      );
      const serviceIds = [
        input.serviceId,
        ...(input.additionalServiceIds ?? []),
      ];
      const serviceRows = await validateAndLockServices(
        transaction,
        workspaceId,
        serviceIds,
      );
      const source = serviceRows.find(({ id }) => id === input.serviceId);
      if (!source || source.archivedAt)
        throw new ProjectRelationsInvalidError();
      const sourceTagRows = await transaction
        .select({ id: tags.id, label: tags.label, archivedAt: tags.archivedAt })
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
            eq(serviceTags.serviceId, source.id),
          ),
        )
        .orderBy(asc(serviceTags.sortOrder));
      if (sourceTagRows.some(({ archivedAt }) => archivedAt)) {
        throw new ProjectRelationsInvalidError();
      }
      const sourceResponsibleRows = await transaction
        .select({ userId: serviceResponsibles.userId })
        .from(serviceResponsibles)
        .where(
          and(
            eq(serviceResponsibles.workspaceId, workspaceId),
            eq(serviceResponsibles.serviceId, source.id),
          ),
        )
        .orderBy(asc(serviceResponsibles.sortOrder));
      const contractType =
        input.contractType ??
        (source.defaultContractType as "one_off" | "recurring");
      const amountCents = input.amountCents ?? source.defaultAmountCents ?? 0;
      const firstDueDate =
        input.firstDueDate === undefined
          ? contractType === "one_off" && amountCents > 0
            ? input.startDate
            : null
          : input.firstDueDate;
      const installments =
        input.installments ??
        (contractType === "one_off" && amountCents > 0
          ? generateInstallments(
              amountCents,
              source.defaultInstallmentCount,
              firstDueDate ?? input.startDate,
            )
          : []);
      const parsedEffective = projectMutationSchema.safeParse({
        name: input.name,
        businessId: input.businessId,
        serviceIds,
        status: input.status ?? source.defaultStatusKey,
        startDate: input.startDate,
        endDate:
          input.endDate !== undefined
            ? input.endDate
            : source.defaultDurationDays
              ? addDays(input.startDate, source.defaultDurationDays)
              : null,
        briefing: input.briefing ?? source.defaultBriefing,
        tagLabels: input.tagLabels ?? sourceTagRows.map(({ label }) => label),
        responsibleUserIds:
          input.responsibleUserIds ??
          sourceResponsibleRows.map(({ userId }) => userId),
        contractType,
        amountCents,
        firstDueDate,
        paymentMethod: input.paymentMethod ?? source.defaultPaymentMethod ?? "",
        paymentTerms: input.paymentTerms ?? source.defaultPaymentTerms ?? "",
        financeNotes: input.financeNotes ?? source.defaultFinanceNotes ?? "",
        installments,
      });
      if (!parsedEffective.success) throw new ProjectRelationsInvalidError();
      const effective = parsedEffective.data;
      return createProjectInTransaction(
        transaction,
        workspaceId,
        context.user.id,
        effective,
        source.id,
      );
    });
  } catch (error) {
    if (error instanceof ProjectRelationsInvalidError) throw error;
    translateProjectConstraint(error);
  }
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
