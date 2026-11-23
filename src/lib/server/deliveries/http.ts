import { error } from "@sveltejs/kit";
import { throwAuthorizationHttpError } from "../authorization/http";
import {
  DeliveryArchivedError,
  DeliveryNotFoundError,
  DeliveryRelationsInvalidError,
  DeliveryStateConflictError,
  DeliveryTaskNotFoundError,
  DeliveryVersionConflictError,
} from "./service";

export function throwDeliveryHttpError(cause: unknown): never {
  if (cause instanceof DeliveryNotFoundError) {
    error(404, "Tarefa não encontrada.");
  }
  if (cause instanceof DeliveryTaskNotFoundError) {
    error(404, "Tarefa não encontrada.");
  }
  if (cause instanceof DeliveryRelationsInvalidError) {
    error(400, cause.message);
  }
  if (
    cause instanceof DeliveryVersionConflictError ||
    cause instanceof DeliveryStateConflictError ||
    cause instanceof DeliveryArchivedError
  ) {
    error(409, cause.message);
  }
  throwAuthorizationHttpError(cause);
}
