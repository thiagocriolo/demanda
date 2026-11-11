import {
  ContactApiError,
  archiveContact,
  contactToEntityRecord,
  createContact,
  entityValuesToContactInput,
  getContact,
  updateContact,
} from "../../contacts/client";
import type { EntityPersistenceAdapter } from "./types";

export const contactEntityAdapter: EntityPersistenceAdapter = {
  async load(id) {
    return contactToEntityRecord(await getContact(id));
  },

  async save({ mode, values, current }) {
    const input = entityValuesToContactInput(values, current, {
      copy: mode === "create" && Boolean(current),
    });
    const contact =
      mode === "edit" && current
        ? await updateContact(current.id, input)
        : await createContact(input);
    return contactToEntityRecord(contact);
  },

  async archive(id) {
    await archiveContact(id);
  },

  isApiError(cause) {
    return cause instanceof ContactApiError;
  },
};
