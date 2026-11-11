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
  Contact,
  ContactEmail,
  ContactList,
  ContactMutationInput,
  ContactNote,
  ContactPhone,
  ContactStatus,
} from "../../contacts/types";
import { affectedRows, type Database } from "../db/database";
import {
  contactEmails,
  contactNotes,
  contactPhones,
  contacts,
  businessResponsibles,
  users,
  workspaces,
} from "../db/schema";
import type { RequestAuthorizationContext } from "../authorization/workspace-context";
import type { ContactListQuery } from "./validation";

type ContactDatabase = Pick<
  Database,
  "select" | "insert" | "update" | "delete"
>;

export class ContactNotFoundError extends Error {
  readonly status = 404;

  constructor() {
    super("Contato não encontrado.");
    this.name = "ContactNotFoundError";
  }
}

export class ContactLinkedUserInvalidError extends Error {
  readonly status = 400;

  constructor() {
    super("O usuário vinculado não é válido.");
    this.name = "ContactLinkedUserInvalidError";
  }
}

export class ContactConflictError extends Error {
  readonly status = 409;

  constructor() {
    super("Já existe um contato seu vinculado a este usuário.");
    this.name = "ContactConflictError";
  }
}

async function personalWorkspaceId(
  database: ContactDatabase,
  userId: string,
): Promise<string> {
  const [workspace] = await database
    .select({ id: workspaces.id })
    .from(workspaces)
    .where(
      and(
        eq(workspaces.ownerUserId, userId),
        eq(workspaces.kind, "personal"),
        isNull(workspaces.archivedAt),
      ),
    )
    .limit(1);
  if (!workspace) {
    throw new Error("O workspace pessoal do usuário não foi encontrado.");
  }
  return workspace.id;
}

async function assertLinkedUserIsValid(
  database: ContactDatabase,
  linkedUserId: string | null,
): Promise<void> {
  if (!linkedUserId) return;
  const [linkedUser] = await database
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.id, linkedUserId), isNull(users.deletedAt)))
    .limit(1);
  if (!linkedUser) throw new ContactLinkedUserInvalidError();
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
  const conditions: SQL[] = [
    sql`${contacts.name} like ${pattern} escape '!'`,
    sql`${contacts.profession} like ${pattern} escape '!'`,
    sql`exists (
      select 1 from ${contactPhones}
      where ${contactPhones.workspaceId} = ${contacts.workspaceId}
        and ${contactPhones.contactId} = ${contacts.id}
        and ${contactPhones.number} like ${pattern} escape '!'
    )`,
    sql`exists (
      select 1 from ${contactEmails}
      where ${contactEmails.workspaceId} = ${contacts.workspaceId}
        and ${contactEmails.contactId} = ${contacts.id}
        and ${contactEmails.address} like ${pattern} escape '!'
    )`,
    sql`exists (
      select 1 from ${contactNotes}
      where ${contactNotes.workspaceId} = ${contacts.workspaceId}
        and ${contactNotes.contactId} = ${contacts.id}
        and ${contactNotes.archivedAt} is null
        and ${contactNotes.body} like ${pattern} escape '!'
    )`,
  ];
  const digits = query.replace(/\D/g, "");
  if (digits.length >= 3) {
    conditions.push(
      sql`exists (
        select 1 from ${contactPhones}
        where ${contactPhones.workspaceId} = ${contacts.workspaceId}
          and ${contactPhones.contactId} = ${contacts.id}
          and ${contactPhones.number} like ${`%${digits}%`}
      )`,
    );
  }
  return or(...conditions);
}

function commonListConditions(
  ownerUserId: string,
  query: ContactListQuery,
): SQL[] {
  const conditions: SQL[] = [eq(contacts.ownerUserId, ownerUserId)];
  if (query.contactType) {
    conditions.push(eq(contacts.contactType, query.contactType));
  }
  const search = searchCondition(query.query);
  if (search) conditions.push(search);
  return conditions;
}

function listConditions(ownerUserId: string, query: ContactListQuery): SQL[] {
  const conditions = commonListConditions(ownerUserId, query);
  if (query.status) {
    conditions.push(eq(contacts.status, query.status));
    conditions.push(isNull(contacts.archivedAt));
  } else if (query.archived === "exclude") {
    conditions.push(isNull(contacts.archivedAt));
  } else if (query.archived === "only") {
    conditions.push(isNotNull(contacts.archivedAt));
  }
  return conditions;
}

function contactOrdering(orderBy: ContactListQuery["orderBy"]): [SQL, SQL] {
  if (orderBy === "name_asc") {
    return [asc(sql`lower(${contacts.name})`), asc(contacts.id)];
  }
  if (orderBy === "name_desc") {
    return [desc(sql`lower(${contacts.name})`), desc(contacts.id)];
  }
  return [desc(contacts.updatedAt), desc(contacts.id)];
}

function iso(value: Date | null): string | null {
  return value?.toISOString() ?? null;
}

async function hydrateContacts(
  database: ContactDatabase,
  rows: (typeof contacts.$inferSelect)[],
): Promise<Contact[]> {
  const ids = rows.map((row) => row.id);
  if (!ids.length) return [];
  const workspaceIds = [...new Set(rows.map((row) => row.workspaceId))];

  const phones = await database
    .select()
    .from(contactPhones)
    .where(
      and(
        inArray(contactPhones.workspaceId, workspaceIds),
        inArray(contactPhones.contactId, ids),
      ),
    )
    .orderBy(desc(contactPhones.isPrimary), asc(contactPhones.createdAt));
  const emails = await database
    .select()
    .from(contactEmails)
    .where(
      and(
        inArray(contactEmails.workspaceId, workspaceIds),
        inArray(contactEmails.contactId, ids),
      ),
    )
    .orderBy(desc(contactEmails.isPrimary), asc(contactEmails.createdAt));
  const notes = await database
    .select()
    .from(contactNotes)
    .where(
      and(
        inArray(contactNotes.workspaceId, workspaceIds),
        inArray(contactNotes.contactId, ids),
        isNull(contactNotes.archivedAt),
      ),
    )
    .orderBy(desc(contactNotes.updatedAt), desc(contactNotes.id));

  const phonesByContact = new Map<string, ContactPhone[]>();
  const emailsByContact = new Map<string, ContactEmail[]>();
  const notesByContact = new Map<string, ContactNote[]>();

  for (const phone of phones) {
    const values = phonesByContact.get(phone.contactId) ?? [];
    values.push({
      id: phone.id,
      type: phone.type,
      label: phone.label ?? "",
      value: phone.number,
      isPrimary: phone.isPrimary,
    });
    phonesByContact.set(phone.contactId, values);
  }
  for (const email of emails) {
    const values = emailsByContact.get(email.contactId) ?? [];
    values.push({
      id: email.id,
      type: email.type,
      label: email.label ?? "",
      value: email.address,
      isPrimary: email.isPrimary,
    });
    emailsByContact.set(email.contactId, values);
  }
  for (const note of notes) {
    const values = notesByContact.get(note.contactId) ?? [];
    values.push({
      id: note.id,
      body: note.body,
      createdAt: note.createdAt.toISOString(),
      updatedAt: note.updatedAt.toISOString(),
    });
    notesByContact.set(note.contactId, values);
  }

  return rows.map((row) => ({
    id: row.id,
    workspaceId: row.workspaceId,
    ownerUserId: row.ownerUserId,
    linkedUserId: row.linkedUserId,
    name: row.name,
    contactType: row.contactType,
    status: row.status,
    profession: row.profession,
    phones: phonesByContact.get(row.id) ?? [],
    emails: emailsByContact.get(row.id) ?? [],
    notes: notesByContact.get(row.id) ?? [],
    archivedAt: iso(row.archivedAt),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }));
}

async function findScopedContactRow(
  database: ContactDatabase,
  ownerUserId: string,
  contactId: string,
  lock = false,
): Promise<typeof contacts.$inferSelect | null> {
  let query = database
    .select()
    .from(contacts)
    .where(
      and(eq(contacts.ownerUserId, ownerUserId), eq(contacts.id, contactId)),
    )
    .limit(1);
  if (lock) query = query.for("update") as typeof query;
  const [row] = await query;
  return row ?? null;
}

async function insertContactDetails(
  database: ContactDatabase,
  workspaceId: string,
  contactId: string,
  input: ContactMutationInput,
): Promise<void> {
  if (input.phones.length) {
    await database.insert(contactPhones).values(
      input.phones.map((phone) => ({
        workspaceId,
        contactId,
        type: phone.type,
        number: phone.value,
        label: phone.label || null,
        isPrimary: phone.isPrimary,
      })),
    );
  }
  if (input.emails.length) {
    await database.insert(contactEmails).values(
      input.emails.map((email) => ({
        workspaceId,
        contactId,
        type: email.type,
        address: email.value,
        label: email.label || null,
        isPrimary: email.isPrimary,
      })),
    );
  }
  if (input.notes.length) {
    await database.insert(contactNotes).values(
      input.notes.map((note) => ({
        workspaceId,
        contactId,
        body: note.body,
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

function translateContactConstraint(error: unknown): never {
  const constraint = databaseConstraint(error);
  if (
    constraint === "contacts_linked_user_id_users_id_fk" ||
    constraint === "contacts_linked_workspace_member_foreign_key"
  ) {
    throw new ContactLinkedUserInvalidError();
  }
  if (
    constraint === "contacts_owner_linked_user_unique" ||
    constraint === "contacts_workspace_linked_user_unique"
  ) {
    throw new ContactConflictError();
  }
  throw error;
}

async function listWorkspaceContactsInTransaction(
  database: ContactDatabase,
  context: RequestAuthorizationContext,
  query: ContactListQuery,
): Promise<ContactList> {
  const ownerUserId = context.user.id;
  const workspaceId = await personalWorkspaceId(database, ownerUserId);

  const conditions = listConditions(ownerUserId, query);
  const commonConditions = commonListConditions(ownerUserId, query);
  const rows = await database
    .select()
    .from(contacts)
    .where(and(...conditions))
    .orderBy(...contactOrdering(query.orderBy))
    .limit(query.pageSize)
    .offset((query.page - 1) * query.pageSize);
  const totalRows = await database
    .select({ value: count() })
    .from(contacts)
    .where(and(...conditions));
  const facetRows = await database
    .select({
      status: contacts.status,
      archived: sql<boolean>`${contacts.archivedAt} is not null`,
      value: count(),
    })
    .from(contacts)
    .where(and(...commonConditions))
    .groupBy(contacts.status, sql`${contacts.archivedAt} is not null`);

  const facets: ContactList["facets"] = {
    all: 0,
    lead: 0,
    prospect: 0,
    active: 0,
    inactive: 0,
    archived: 0,
  };
  let unarchived = 0;
  for (const row of facetRows) {
    if (row.archived) {
      facets.archived += row.value;
    } else {
      facets[row.status as ContactStatus] += row.value;
      unarchived += row.value;
    }
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
    items: await hydrateContacts(database, rows),
    page: query.page,
    pageSize: query.pageSize,
    total,
    totalPages: Math.ceil(total / query.pageSize),
    facets,
  };
}

export async function listWorkspaceContacts(
  database: Database,
  context: RequestAuthorizationContext,
  query: ContactListQuery,
): Promise<ContactList> {
  return database.transaction(
    (transaction) =>
      listWorkspaceContactsInTransaction(transaction, context, query),
    { isolationLevel: "repeatable read", accessMode: "read only" },
  );
}

export async function getWorkspaceContact(
  database: Database,
  context: RequestAuthorizationContext,
  contactId: string,
): Promise<Contact> {
  const row = await findScopedContactRow(database, context.user.id, contactId);
  if (!row) throw new ContactNotFoundError();
  const [contact] = await hydrateContacts(database, [row]);
  if (!contact) throw new ContactNotFoundError();
  return contact;
}

export async function createWorkspaceContact(
  database: Database,
  context: RequestAuthorizationContext,
  input: ContactMutationInput,
): Promise<Contact> {
  try {
    return await database.transaction(async (transaction) => {
      const workspaceId = await personalWorkspaceId(
        transaction,
        context.user.id,
      );
      await assertLinkedUserIsValid(transaction, input.linkedUserId);
      const id = randomUUID();
      await transaction
        .insert(contacts)
        .values({
          id,
          workspaceId,
          ownerUserId: context.user.id,
          linkedUserId: input.linkedUserId,
          name: input.name,
          contactType: input.contactType,
          status: input.status,
          profession: input.profession,
        });
      const [created] = await transaction
        .select()
        .from(contacts)
        .where(eq(contacts.id, id))
        .limit(1);
      if (!created) throw new Error("O contato não pôde ser criado.");
      await insertContactDetails(transaction, workspaceId, created.id, input);
      const [contact] = await hydrateContacts(transaction, [created]);
      if (!contact) throw new Error("O contato não pôde ser carregado.");
      return contact;
    });
  } catch (error) {
    translateContactConstraint(error);
  }
}

export async function updateWorkspaceContact(
  database: Database,
  context: RequestAuthorizationContext,
  contactId: string,
  input: ContactMutationInput,
): Promise<Contact> {
  try {
    return await database.transaction(async (transaction) => {
      const existing = await findScopedContactRow(
        transaction,
        context.user.id,
        contactId,
        true,
      );
      if (!existing) throw new ContactNotFoundError();
      await assertLinkedUserIsValid(transaction, input.linkedUserId);
      const workspaceId = existing.workspaceId;

      const now = new Date();
      const updated = await transaction
        .update(contacts)
        .set({
          linkedUserId: input.linkedUserId,
          name: input.name,
          contactType: input.contactType,
          status: input.status,
          profession: input.profession,
          updatedAt: now,
        })
        .where(
          and(
            eq(contacts.ownerUserId, context.user.id),
            eq(contacts.id, contactId),
          ),
        );
      if (affectedRows(updated) !== 1) throw new ContactNotFoundError();

      await transaction
        .delete(contactPhones)
        .where(
          and(
            eq(contactPhones.workspaceId, workspaceId),
            eq(contactPhones.contactId, contactId),
          ),
        );
      await transaction
        .delete(contactEmails)
        .where(
          and(
            eq(contactEmails.workspaceId, workspaceId),
            eq(contactEmails.contactId, contactId),
          ),
        );
      await transaction
        .delete(contactNotes)
        .where(
          and(
            eq(contactNotes.workspaceId, workspaceId),
            eq(contactNotes.contactId, contactId),
            isNull(contactNotes.archivedAt),
          ),
        );
      await insertContactDetails(transaction, workspaceId, contactId, input);
      const [contact] = await hydrateContacts(transaction, [{ ...existing, linkedUserId: input.linkedUserId, name: input.name, contactType: input.contactType, status: input.status, profession: input.profession, updatedAt: now }]);
      if (!contact) throw new ContactNotFoundError();
      return contact;
    });
  } catch (error) {
    if (error instanceof ContactNotFoundError) throw error;
    translateContactConstraint(error);
  }
}

export async function archiveWorkspaceContact(
  database: Database,
  context: RequestAuthorizationContext,
  contactId: string,
): Promise<void> {
  await database.transaction(async (transaction) => {
    const existing = await findScopedContactRow(
      transaction,
      context.user.id,
      contactId,
      true,
    );
    if (!existing) throw new ContactNotFoundError();
    if (existing.archivedAt) return;
    const archived = await transaction
      .update(contacts)
      .set({ archivedAt: new Date(), updatedAt: new Date() })
      .where(
        and(
          eq(contacts.ownerUserId, context.user.id),
          eq(contacts.id, contactId),
        ),
      )
      ;
    if (affectedRows(archived) !== 1) throw new ContactNotFoundError();
  });
}

export async function deleteWorkspaceContact(
  database: Database,
  context: RequestAuthorizationContext,
  contactId: string,
): Promise<void> {
  await database.transaction(async (transaction) => {
    const existing = await findScopedContactRow(
      transaction,
      context.user.id,
      contactId,
      true,
    );
    if (!existing) throw new ContactNotFoundError();

    await transaction
      .delete(businessResponsibles)
      .where(
        and(
          eq(businessResponsibles.workspaceId, existing.workspaceId),
          eq(businessResponsibles.contactId, contactId),
        ),
      );
    const deleted = await transaction
      .delete(contacts)
      .where(
        and(
          eq(contacts.ownerUserId, context.user.id),
          eq(contacts.id, contactId),
        ),
      );
    if (affectedRows(deleted) !== 1) throw new ContactNotFoundError();
  });
}
