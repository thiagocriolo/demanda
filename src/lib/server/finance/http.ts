import { error } from "@sveltejs/kit";
import { WorkspacePermissionDeniedError } from "../authorization/policy";
import { WorkspaceNotFoundError } from "../authorization/workspace-context";
import {
  FinancialEntryNotFoundError,
  FinancialInvalidOperationError,
  FinancialVersionConflictError,
} from "./service";

export function throwFinanceHttpError(cause: unknown): never {
  if (cause instanceof WorkspacePermissionDeniedError)
    error(403, cause.message);
  if (
    cause instanceof WorkspaceNotFoundError ||
    cause instanceof FinancialEntryNotFoundError ||
    cause instanceof FinancialInvalidOperationError ||
    cause instanceof FinancialVersionConflictError
  ) {
    error(cause.status, cause.message);
  }
  throw cause;
}
