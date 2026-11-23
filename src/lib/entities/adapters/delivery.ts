import {
  DeliveryApiError,
  archiveDelivery,
  createDelivery,
  deleteDelivery,
  entityValuesToDeliveryCreateInput,
  getDelivery,
  deliveryToEntityRecord,
  deliveryVersionFromRecord,
  updateDeliveryFromEntityValues,
} from "../../deliveries/client";
import type { EntityPersistenceAdapter } from "./types";

export const deliveryEntityAdapter: EntityPersistenceAdapter = {
  async load(id) {
    return deliveryToEntityRecord(await getDelivery(id));
  },

  async save({ mode, values, current }) {
    const delivery =
      mode === "edit" && current
        ? await updateDeliveryFromEntityValues(current.id, values, current)
        : await createDelivery(
            entityValuesToDeliveryCreateInput(values, current, {
              copy: mode === "create" && Boolean(current?.id),
            }),
          );
    return deliveryToEntityRecord(delivery);
  },

  async archive(id, current) {
    const version = current
      ? deliveryVersionFromRecord(current)
      : (await getDelivery(id)).version;
    await archiveDelivery(id, version);
  },

  async delete(id, current) {
    const version = current
      ? deliveryVersionFromRecord(current)
      : (await getDelivery(id)).version;
    await deleteDelivery(id, version);
  },

  isApiError(cause) {
    return cause instanceof DeliveryApiError;
  },
};
