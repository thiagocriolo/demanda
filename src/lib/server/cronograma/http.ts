import { error } from "@sveltejs/kit";
import { WorkspacePermissionDeniedError } from "../authorization/policy";
import { WorkspaceNotFoundError } from "../authorization/workspace-context";
import {
  CronogramaRuleViolationError,
  CronogramaSubtaskNotFoundError,
  CronogramaVersionConflictError,
} from "./service";

export function throwCronogramaHttpError(cause: unknown): never {
  if (cause instanceof WorkspacePermissionDeniedError)
    error(403, cause.message);
  if (
    cause instanceof WorkspaceNotFoundError ||
    cause instanceof CronogramaSubtaskNotFoundError ||
    cause instanceof CronogramaRuleViolationError ||
    cause instanceof CronogramaVersionConflictError
  ) {
    error(cause.status, cause.message);
  }
  throw cause;
}
