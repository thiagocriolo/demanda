import { error } from "@sveltejs/kit";
import { WorkspaceNotFoundError } from "../authorization/workspace-context";
import { WorkspacePermissionDeniedError } from "../authorization/policy";
import {
  AgendaInvalidMovementError,
  AgendaVersionConflictError,
} from "./service";

export function throwAgendaHttpError(cause: unknown): never {
  if (cause instanceof WorkspacePermissionDeniedError)
    error(403, cause.message);
  if (
    cause instanceof WorkspaceNotFoundError ||
    cause instanceof AgendaInvalidMovementError ||
    cause instanceof AgendaVersionConflictError
  ) {
    error(cause.status, cause.message);
  }
  throw cause;
}
