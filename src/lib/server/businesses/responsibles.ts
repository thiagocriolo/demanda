import { and, asc, eq, inArray, isNull, or, sql } from "drizzle-orm";
import type { BusinessMutationInput } from "../../businesses/types";
import {
  businessNotes,
  businessResponsibles,
  contacts,
  userConnections,
  users,
} from "../db/schema";
import type { BusinessDatabase } from "./database";
import { BusinessResponsiblesInvalidError } from "./errors";

type LinkedResponsibles = { contactIds: Set<string>; userIds: Set<string> };

export async function existingResponsibleIds(
  database: BusinessDatabase,
  workspaceId: string,
  businessId: string,
): Promise<LinkedResponsibles> {
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

export async function validateAndLockResponsibles(
  database: BusinessDatabase,
  workspaceId: string,
  ownerUserId: string,
  contactIds: string[],
  userIds: string[],
  previouslyLinked: LinkedResponsibles = {
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

export async function insertBusinessDetails(
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
