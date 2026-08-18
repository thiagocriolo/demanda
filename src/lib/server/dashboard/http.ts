import { error } from "@sveltejs/kit";
import { WorkspacePermissionDeniedError } from "../authorization/policy";
import { WorkspaceNotFoundError } from "../authorization/workspace-context";

export function throwDashboardHttpError(cause: unknown): never {
  if (cause instanceof WorkspaceNotFoundError) error(404, cause.message);
  if (cause instanceof WorkspacePermissionDeniedError)
    error(403, cause.message);
  throw cause;
}
