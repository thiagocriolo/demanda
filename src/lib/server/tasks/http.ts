import { error } from "@sveltejs/kit";
import { throwAuthorizationHttpError } from "../authorization/http";
import {
  TaskArchivedError,
  TaskNotFoundError,
  TaskRelationsInvalidError,
  TaskStateConflictError,
  TaskSubtaskNotFoundError,
  TaskVersionConflictError,
} from "./service";

export function throwTaskHttpError(cause: unknown): never {
  if (cause instanceof TaskNotFoundError) {
    error(404, "Tarefa não encontrada.");
  }
  if (cause instanceof TaskSubtaskNotFoundError) {
    error(404, "Subtarefa não encontrada.");
  }
  if (cause instanceof TaskRelationsInvalidError) {
    error(400, cause.message);
  }
  if (
    cause instanceof TaskVersionConflictError ||
    cause instanceof TaskStateConflictError ||
    cause instanceof TaskArchivedError
  ) {
    error(409, cause.message);
  }
  throwAuthorizationHttpError(cause);
}
