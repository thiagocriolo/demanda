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
  Business,
  BusinessList,
  BusinessMutationInput,
  BusinessNote,
  BusinessResponsible,
  BusinessResponsibleUserOption,
} from "../../businesses/types";
import {
  INSTITUTIONAL_PROJECT_NAME,
  INSTITUTIONAL_PROJECT_STATUS,
} from "../../projects/institutional";
import { affectedRows, type Database } from "../db/database";
import {
  businessNotes,
  businessResponsibles,
  businesses,
  contacts,
  projects,
  userConnections,
  users,
  workspaces,
} from "../db/schema";
import type { RequestAuthorizationContext } from "../authorization/workspace-context";
import { businessMutationSchema, type BusinessListQuery } from "./validation";

type BusinessDatabase = Pick<
  Database,
  "select" | "insert" | "update" | "delete"
>;

export class BusinessNotFoundError extends Error {
  readonly status = 404;

  constructor() {
    super("Negocio nao encontrado.");
    this.name = "BusinessNotFoundError";
  }
}

export class BusinessResponsiblesInvalidError extends Error {
  readonly status = 400;

  constructor() {
    super("Um ou mais responsaveis nao sao validos.");
    this.name = "BusinessResponsiblesInvalidError";
  }
}

async function personalWorkspaceIdForOwner(
  database: BusinessDatabase,
  ownerUserId: string,
): Promise<string> {
  const [workspace] = await database
    .select({ id: workspaces.id })
    .from(workspaces)
    .where(
      and(
        eq(workspaces.ownerUserId, ownerUserId),
        eq(workspaces.kind, "personal"),
        isNull(workspaces.archivedAt),
      ),
    )
    .limit(1);
  if (!workspace) {
    throw new Error("O workspace pessoal do usuario nao esta disponivel.");
  }
  return workspace.id;
}

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (character) => `\\${character}`);
}

function escapeLikeMySql(value: string): string {
  return value.replace(/[!%_]/g, (character) => `!${character}`);
}

function searchCondition(query: string): SQL | undefined {
  if (!query) return undefined;
  const pattern = `%${escapeLikeMySql(query)}%`;
  return or(
    sql`${businesses.name} like ${pattern} escape '!'`,
    sql`${businesses.categoryKey} like ${pattern} escape '!'`,
    sql`${businesses.stageKey} like ${pattern} escape '!'`,
    sql`exists (
      select 1
      from ${businessResponsibles}
      inner join ${contacts}
        on ${contacts.workspaceId} = ${businessResponsibles.workspaceId}
       and ${contacts.id} = ${businessResponsibles.contactId}
      where ${businessResponsibles.workspaceId} = ${businesses.workspaceId}
        and ${businessResponsibles.businessId} = ${businesses.id}
        and ${contacts.ownerUserId} = ${businesses.ownerUserId}
        and ${contacts.name} like ${pattern} escape '!'
    )`,
    sql`exists (
      select 1
      from ${businessResponsibles}
      inner join ${users}
        on ${users.id} = ${businessResponsibles.userId}
      where ${businessResponsibles.workspaceId} = ${businesses.workspaceId}
        and ${businessResponsibles.businessId} = ${businesses.id}
        and (
          ${users.name} like ${pattern} escape '!'
          or ${users.username} like ${pattern} escape '!'
          or ${users.email} like ${pattern} escape '!'
        )
    )`,
    sql`exists (
      select 1 from ${businessNotes}
      where ${businessNotes.workspaceId} = ${businesses.workspaceId}
        and ${businessNotes.businessId} = ${businesses.id}
        and ${businessNotes.archivedAt} is null
        and ${businessNotes.body} like ${pattern} escape '!'
    )`,
  );
}

function commonListConditions(
  ownerUserId: string,
  query: BusinessListQuery,
): SQL[] {
  const conditions: SQL[] = [eq(businesses.ownerUserId, ownerUserId)];
  const search = searchCondition(query.query);
  if (search) conditions.push(search);
  return conditions;
}

function listConditions(ownerUserId: string, query: BusinessListQuery): SQL[] {
  const conditions = commonListConditions(ownerUserId, query);
  if (query.stage) conditions.push(eq(businesses.stageKey, query.stage));
  if (query.category) {
    conditions.push(eq(businesses.categoryKey, query.category));
  }
  if (query.archived === "exclude") {
    conditions.push(isNull(businesses.archivedAt));
  } else if (query.archived === "only") {
    conditions.push(isNotNull(businesses.archivedAt));
  }
  return conditions;
}

function businessOrdering(orderBy: BusinessListQuery["orderBy"]): [SQL, SQL] {
  if (orderBy === "name_asc") {
    return [asc(sql`lower(${businesses.name})`), asc(businesses.id)];
  }
  if (orderBy === "name_desc") {
    return [desc(sql`lower(${businesses.name})`), desc(businesses.id)];
  }
  return [desc(businesses.updatedAt), desc(businesses.id)];
}

function iso(value: Date | null): string | null {
  return value?.toISOString() ?? null;
}

async function hydrateBusinesses(
  database: BusinessDatabase,
  rows: (typeof businesses.$inferSelect)[],
  ownerUserId: string,
): Promise<Business[]> {
  const ids = rows.map((row) => row.id);
  if (!ids.length) return [];
  const workspaceIds = [...new Set(rows.map((row) => row.workspaceId))];

  const responsibleRows = await database
    .select({
      id: businessResponsibles.id,
      businessId: businessResponsibles.businessId,
      sortOrder: businessResponsibles.sortOrder,
      contactId: contacts.id,
      name: contacts.name,
      contactType: contacts.contactType,
      status: contacts.status,
      profession: contacts.profession,
      archivedAt: contacts.archivedAt,
    })
    .from(businessResponsibles)
    .innerJoin(
      contacts,
      and(
        eq(contacts.workspaceId, businessResponsibles.workspaceId),
        eq(contacts.id, businessResponsibles.contactId),
      ),
    )
    .where(
      and(
        inArray(businessResponsibles.workspaceId, workspaceIds),
        inArray(businessResponsibles.businessId, ids),
        eq(contacts.ownerUserId, ownerUserId),
      ),
    )
    .orderBy(
      asc(businessResponsibles.sortOrder),
      asc(sql`lower(${contacts.name})`),
      asc(contacts.id),
    );
  const responsibleUserRows = await database
    .select({
      id: businessResponsibles.id,
      businessId: businessResponsibles.businessId,
      sortOrder: businessResponsibles.sortOrder,
      userId: users.id,
      name: users.name,
      username: users.username,
      email: users.email,
      avatarUrl: users.avatarUrl,
      deletedAt: users.deletedAt,
    })
    .from(businessResponsibles)
    .innerJoin(users, eq(users.id, businessResponsibles.userId))
    .where(
      and(
        inArray(businessResponsibles.workspaceId, workspaceIds),
        inArray(businessResponsibles.businessId, ids),
      ),
    )
    .orderBy(
      asc(businessResponsibles.sortOrder),
      asc(sql`lower(${users.name})`),
      asc(users.id),
    );
  const noteRows = await database
    .select()
    .from(businessNotes)
    .where(
      and(
        inArray(businessNotes.workspaceId, workspaceIds),
        inArray(businessNotes.businessId, ids),
        isNull(businessNotes.archivedAt),
      ),
    )
    .orderBy(asc(businessNotes.sortOrder), asc(businessNotes.id));

  const responsibleEntriesByBusiness = new Map<
    string,
    { id: string; sortOrder: number | null; value: BusinessResponsible }[]
  >();
  const notesByBusiness = new Map<string, BusinessNote[]>();
  for (const responsible of responsibleRows) {
    const values =
      responsibleEntriesByBusiness.get(responsible.businessId) ?? [];
    values.push({
      id: responsible.id,
      sortOrder: responsible.sortOrder,
      value: {
        kind: "contact",
        contactId: responsible.contactId,
        userId: null,
        name: responsible.name,
        contactType: responsible.contactType,
        status: responsible.status,
        profession: responsible.profession,
        username: null,
        email: null,
        avatarUrl: null,
        archivedAt: iso(responsible.archivedAt),
      },
    });
    responsibleEntriesByBusiness.set(responsible.businessId, values);
  }
  for (const responsible of responsibleUserRows) {
    const values =
      responsibleEntriesByBusiness.get(responsible.businessId) ?? [];
    values.push({
      id: responsible.id,
      sortOrder: responsible.sortOrder,
      value: {
        kind: "user",
        contactId: null,
        userId: responsible.userId,
        name: responsible.name,
        contactType: null,
        status: null,
        profession: null,
        username: responsible.username,
        email: responsible.email,
        avatarUrl: responsible.avatarUrl,
        archivedAt: iso(responsible.deletedAt),
      },
    });
    responsibleEntriesByBusiness.set(responsible.businessId, values);
  }
  const responsiblesByBusiness = new Map<string, BusinessResponsible[]>();
  for (const [businessId, entries] of responsibleEntriesByBusiness) {
    entries.sort(
      (left, right) =>
        (left.sortOrder ?? 0) - (right.sortOrder ?? 0) ||
        left.id.localeCompare(right.id),
    );
    responsiblesByBusiness.set(
      businessId,
      entries.map(({ value }) => value),
    );
  }
  for (const note of noteRows) {
    const values = notesByBusiness.get(note.businessId) ?? [];
    values.push({
      id: note.id,
      body: note.body,
      createdAt: note.createdAt.toISOString(),
      updatedAt: note.updatedAt.toISOString(),
    });
    notesByBusiness.set(note.businessId, values);
  }

  return rows.map((row) => ({
    id: row.id,
    workspaceId: row.workspaceId,
    ownerUserId: row.ownerUserId,
    name: row.name,
    category: row.categoryKey,
    stage: row.stageKey,
    responsibles: responsiblesByBusiness.get(row.id) ?? [],
    notes: notesByBusiness.get(row.id) ?? [],
    archivedAt: iso(row.archivedAt),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }));
}

async function findScopedBusinessRow(
  database: BusinessDatabase,
  ownerUserId: string,
  businessId: string,
  lock = false,
): Promise<typeof businesses.$inferSelect | null> {
  let query = database
    .select()
    .from(businesses)
    .where(
      and(
        eq(businesses.ownerUserId, ownerUserId),
        eq(businesses.id, businessId),
      ),
    )
    .limit(1);
  if (lock) query = query.for("update") as typeof query;
  const [row] = await query;
  return row ?? null;
}

async function existingResponsibleIds(
  database: BusinessDatabase,
  workspaceId: string,
  businessId: string,
): Promise<{ contactIds: Set<string>; userIds: Set<string> }> {
  const rows = await database
    .select({
      contactId: businessResponsibles.contactId,
      userId: businessResponsibles.userId,
    })
    .from(businessResponsibles)
    .where(
      and(
        eq(businessResponsibles.workspaceId, workspaceId),
        eq(businessResponsibles.businessId, businessId),
      ),
    );
  return {
    contactIds: new Set(
      rows.flatMap(({ contactId }) => (contactId ? [contactId] : [])),
    ),
    userIds: new Set(rows.flatMap(({ userId }) => (userId ? [userId] : []))),
  };
}

async function validateAndLockResponsibles(
  database: BusinessDatabase,
  workspaceId: string,
  ownerUserId: string,
  contactIds: string[],
  userIds: string[],
  previouslyLinked = {
    contactIds: new Set<string>(),
    userIds: new Set<string>(),
  },
): Promise<void> {
  if (
    contactIds.length + userIds.length < 1 ||
    contactIds.length + userIds.length > 20 ||
    new Set(contactIds).size !== contactIds.length ||
    new Set(userIds).size !== userIds.length
  ) {
    throw new BusinessResponsiblesInvalidError();
  }
  if (contactIds.length) {
    const rows = await database
      .select({ id: contacts.id, archivedAt: contacts.archivedAt })
      .from(contacts)
      .where(
        and(
          eq(contacts.workspaceId, workspaceId),
          eq(contacts.ownerUserId, ownerUserId),
          inArray(contacts.id, contactIds),
        ),
      )
      .orderBy(asc(contacts.id))
      .for("update");

    if (rows.length !== contactIds.length) {
      throw new BusinessResponsiblesInvalidError();
    }
    if (
      rows.some(
        (contact) =>
          contact.archivedAt !== null &&
          !previouslyLinked.contactIds.has(contact.id),
      )
    ) {
      throw new BusinessResponsiblesInvalidError();
    }
  }

  if (userIds.length) {
    const rows = await database
      .select({ id: users.id, deletedAt: users.deletedAt })
      .from(users)
      .where(
        and(
          inArray(users.id, userIds),
          or(
            eq(users.id, ownerUserId),
            sql`exists (
              select 1 from ${userConnections}
              where (
                ${userConnections.userAId} = ${ownerUserId}
                and ${userConnections.userBId} = ${users.id}
              ) or (
                ${userConnections.userBId} = ${ownerUserId}
                and ${userConnections.userAId} = ${users.id}
              )
            )`,
          ),
        ),
      )
      .orderBy(asc(users.id))
      .for("update");
    if (rows.length !== userIds.length) {
      throw new BusinessResponsiblesInvalidError();
    }
    if (
      rows.some(
        (user) =>
          user.deletedAt !== null && !previouslyLinked.userIds.has(user.id),
      )
    ) {
      throw new BusinessResponsiblesInvalidError();
    }
  }
}

async function insertBusinessDetails(
  database: BusinessDatabase,
  workspaceId: string,
  businessId: string,
  input: BusinessMutationInput,
): Promise<void> {
  await database.insert(businessResponsibles).values([
    ...input.responsibleContactIds.map((contactId, sortOrder) => ({
      workspaceId,
      businessId,
      contactId,
      sortOrder,
    })),
    ...(input.responsibleUserIds ?? []).map((userId, index) => ({
      workspaceId,
      businessId,
      userId,
      sortOrder: input.responsibleContactIds.length + index,
    })),
  ]);
  if (input.notes.length) {
    await database.insert(businessNotes).values(
      input.notes.map((note, sortOrder) => ({
        workspaceId,
        businessId,
        body: note.body,
        sortOrder,
      })),
    );
  }
}

function databaseConstraint(error: unknown): string | undefined {
  const visited = new Set<unknown>();
  let current = error;
  while (current && typeof current === "object" && !visited.has(current)) {
    visited.add(current);
    if ("constraint" in current && typeof current.constraint === "string") {
      return current.constraint;
    }
    if ("sqlMessage" in current && typeof current.sqlMessage === "string") {
      const match = /CONSTRAINT `([^`]+)`/u.exec(current.sqlMessage);
      if (match?.[1]) return match[1];
    }
    current = "cause" in current ? current.cause : undefined;
  }
  return undefined;
}

function translateBusinessConstraint(error: unknown): never {
  const constraint = databaseConstraint(error);
  if (
    constraint === "business_responsibles_workspace_contact_foreign_key" ||
    constraint === "business_responsibles_user_id_users_id_fk" ||
    constraint === "business_responsibles_exactly_one_subject" ||
    constraint === "business_responsibles_same_owner"
  ) {
    throw new BusinessResponsiblesInvalidError();
  }
  throw error;
}

export async function listBusinessResponsibleUsers(
  database: Database,
  context: RequestAuthorizationContext,
): Promise<BusinessResponsibleUserOption[]> {
  const actorUserId = context.user.id;
  const rows = await database
    .select({
      id: users.id,
      name: users.name,
      username: users.username,
      email: users.email,
      avatarUrl: users.avatarUrl,
    })
    .from(users)
    .where(
      and(
        isNull(users.deletedAt),
        or(
          eq(users.id, actorUserId),
          sql`exists (
            select 1 from ${userConnections}
            where (
              ${userConnections.userAId} = ${actorUserId}
              and ${userConnections.userBId} = ${users.id}
            ) or (
              ${userConnections.userBId} = ${actorUserId}
              and ${userConnections.userAId} = ${users.id}
            )
          )`,
        ),
      ),
    )
    .orderBy(
      desc(sql`${users.id} = ${actorUserId}`),
      asc(sql`lower(${users.name})`),
      asc(users.id),
    );
  return rows.map((user) => ({
    ...user,
    current: user.id === actorUserId,
  }));
}

async function listWorkspaceBusinessesInTransaction(
  database: BusinessDatabase,
  context: RequestAuthorizationContext,
  query: BusinessListQuery,
): Promise<BusinessList> {
  const ownerUserId = context.user.id;
  const workspaceId = await personalWorkspaceIdForOwner(database, ownerUserId);
  const conditions = listConditions(ownerUserId, query);
  const commonConditions = commonListConditions(ownerUserId, query);
  const rows = await database
    .select()
    .from(businesses)
    .where(and(...conditions))
    .orderBy(...businessOrdering(query.orderBy))
    .limit(query.pageSize)
    .offset((query.page - 1) * query.pageSize);
  const totalRows = await database
    .select({ value: count() })
    .from(businesses)
    .where(and(...conditions));
  const facetRows = await database
    .select({
      stage: businesses.stageKey,
      category: businesses.categoryKey,
      archived: sql<boolean>`${businesses.archivedAt} is not null`,
      value: count(),
    })
    .from(businesses)
    .where(and(...commonConditions))
    .groupBy(
      businesses.stageKey,
      businesses.categoryKey,
      sql`${businesses.archivedAt} is not null`,
    );

  const facets: BusinessList["facets"] = {
    all: 0,
    archived: 0,
    stages: {},
    categories: {},
  };
  let unarchived = 0;
  for (const row of facetRows) {
    if (row.archived) {
      facets.archived += row.value;
      continue;
    }
    unarchived += row.value;
    facets.stages[row.stage] = (facets.stages[row.stage] ?? 0) + row.value;
    facets.categories[row.category] =
      (facets.categories[row.category] ?? 0) + row.value;
  }
  facets.all =
    query.archived === "only"
      ? facets.archived
      : query.archived === "include"
        ? unarchived + facets.archived
        : unarchived;

  const total = totalRows[0]?.value ?? 0;
  return {
    workspaceId,
    ownerUserId,
    items: await hydrateBusinesses(database, rows, ownerUserId),
    page: query.page,
    pageSize: query.pageSize,
    total,
    totalPages: Math.ceil(total / query.pageSize),
    facets,
  };
}

export async function listWorkspaceBusinesses(
  database: Database,
  context: RequestAuthorizationContext,
  query: BusinessListQuery,
): Promise<BusinessList> {
  return database.transaction(
    (transaction) =>
      listWorkspaceBusinessesInTransaction(transaction, context, query),
    { isolationLevel: "repeatable read", accessMode: "read only" },
  );
}

export async function getWorkspaceBusiness(
  database: Database,
  context: RequestAuthorizationContext,
  businessId: string,
): Promise<Business> {
  const ownerUserId = context.user.id;
  const row = await findScopedBusinessRow(database, ownerUserId, businessId);
  if (!row) throw new BusinessNotFoundError();
  const [business] = await hydrateBusinesses(database, [row], ownerUserId);
  if (!business) throw new BusinessNotFoundError();
  return business;
}

export async function createWorkspaceBusiness(
  database: Database,
  context: RequestAuthorizationContext,
  input: BusinessMutationInput,
): Promise<Business> {
  input = businessMutationSchema.parse(input);
  const ownerUserId = context.user.id;
  try {
    return await database.transaction(async (transaction) => {
      const workspaceId = await personalWorkspaceIdForOwner(
        transaction,
        ownerUserId,
      );
      await validateAndLockResponsibles(
        transaction,
        workspaceId,
        ownerUserId,
        input.responsibleContactIds,
        input.responsibleUserIds ?? [],
      );
      const id = randomUUID();
      await transaction
        .insert(businesses)
        .values({
          id,
          workspaceId,
          ownerUserId,
          name: input.name,
          categoryKey: input.category,
          stageKey: input.stage,
        });
      const [created] = await transaction
        .select()
        .from(businesses)
        .where(eq(businesses.id, id))
        .limit(1);
      if (!created) throw new Error("O negocio nao pode ser criado.");
      await transaction.insert(projects).values({
        workspaceId,
        businessId: created.id,
        isInstitutional: true,
        name: INSTITUTIONAL_PROJECT_NAME,
        statusKey: INSTITUTIONAL_PROJECT_STATUS,
        startDate: created.createdAt.toISOString().slice(0, 10),
      });
      await insertBusinessDetails(transaction, workspaceId, created.id, input);
      const [business] = await hydrateBusinesses(
        transaction,
        [created],
        ownerUserId,
      );
      if (!business) throw new Error("O negocio nao pode ser carregado.");
      return business;
    });
  } catch (error) {
    if (error instanceof BusinessResponsiblesInvalidError) throw error;
    translateBusinessConstraint(error);
  }
}

export async function updateWorkspaceBusiness(
  database: Database,
  context: RequestAuthorizationContext,
  businessId: string,
  input: BusinessMutationInput,
): Promise<Business> {
  const ownerUserId = context.user.id;
  try {
    return await database.transaction(async (transaction) => {
      const existing = await findScopedBusinessRow(
        transaction,
        ownerUserId,
        businessId,
        true,
      );
      if (!existing) throw new BusinessNotFoundError();
      const workspaceId = existing.workspaceId;
      const previouslyLinked = await existingResponsibleIds(
        transaction,
        workspaceId,
        businessId,
      );
      await validateAndLockResponsibles(
        transaction,
        workspaceId,
        ownerUserId,
        input.responsibleContactIds,
        input.responsibleUserIds ?? [],
        previouslyLinked,
      );

      const now = new Date();
      const updated = await transaction
        .update(businesses)
        .set({
          name: input.name,
          categoryKey: input.category,
          stageKey: input.stage,
          updatedAt: now,
        })
        .where(
          and(
            eq(businesses.workspaceId, workspaceId),
            eq(businesses.ownerUserId, ownerUserId),
            eq(businesses.id, businessId),
          ),
        );
      if (affectedRows(updated) !== 1) throw new BusinessNotFoundError();

      await transaction
        .delete(businessResponsibles)
        .where(
          and(
            eq(businessResponsibles.workspaceId, workspaceId),
            eq(businessResponsibles.businessId, businessId),
          ),
        );
      await transaction
        .delete(businessNotes)
        .where(
          and(
            eq(businessNotes.workspaceId, workspaceId),
            eq(businessNotes.businessId, businessId),
            isNull(businessNotes.archivedAt),
          ),
        );
      await insertBusinessDetails(transaction, workspaceId, businessId, input);
      const [business] = await hydrateBusinesses(
        transaction,
        [{ ...existing, name: input.name, categoryKey: input.category, stageKey: input.stage, updatedAt: now }],
        ownerUserId,
      );
      if (!business) throw new BusinessNotFoundError();
      return business;
    });
  } catch (error) {
    if (
      error instanceof BusinessNotFoundError ||
      error instanceof BusinessResponsiblesInvalidError
    ) {
      throw error;
    }
    translateBusinessConstraint(error);
  }
}

export async function archiveWorkspaceBusiness(
  database: Database,
  context: RequestAuthorizationContext,
  businessId: string,
): Promise<void> {
  const ownerUserId = context.user.id;
  await database.transaction(async (transaction) => {
    const existing = await findScopedBusinessRow(
      transaction,
      ownerUserId,
      businessId,
      true,
    );
    if (!existing) throw new BusinessNotFoundError();
    if (existing.archivedAt) return;
    const workspaceId = existing.workspaceId;
    const now = new Date();
    const archived = await transaction
      .update(businesses)
      .set({ archivedAt: now, updatedAt: now })
      .where(
        and(
          eq(businesses.workspaceId, workspaceId),
          eq(businesses.ownerUserId, ownerUserId),
          eq(businesses.id, businessId),
        ),
      )
      ;
    if (affectedRows(archived) !== 1) throw new BusinessNotFoundError();
  });
}
