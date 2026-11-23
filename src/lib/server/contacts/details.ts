import { and, eq, isNull } from "drizzle-orm";
import type { ContactMutationInput } from "../../contacts/types";
import { contactEmails, contactNotes, contactPhones, users } from "../db/schema";
import type { ContactDatabase } from "./database";
import { ContactLinkedUserInvalidError } from "./errors";

export async function assertLinkedUserIsValid(
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

export async function insertContactDetails(
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
