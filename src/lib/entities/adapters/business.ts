import {
  BusinessApiError,
  archiveBusiness,
  businessToEntityRecord,
  createBusiness,
  deleteBusiness,
  entityValuesToBusinessInput,
  getBusiness,
  updateBusiness,
} from "../../businesses/client";
import type { EntityPersistenceAdapter } from "./types";

export const businessEntityAdapter: EntityPersistenceAdapter = {
  async load(id) {
    return businessToEntityRecord(await getBusiness(id));
  },

  async save({ mode, values, current }) {
    const input = entityValuesToBusinessInput(values, current);
    const business =
      mode === "edit" && current
        ? await updateBusiness(current.id, input)
        : await createBusiness(input);
    return businessToEntityRecord(business);
  },

  async archive(id) {
    await archiveBusiness(id);
  },

  async delete(id) {
    await deleteBusiness(id);
  },

  isApiError(cause) {
    return cause instanceof BusinessApiError;
  },
};
