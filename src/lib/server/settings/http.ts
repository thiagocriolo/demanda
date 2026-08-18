import { error } from "@sveltejs/kit";
import {
  SettingsConflictError,
  SettingsRelationsInvalidError,
  SettingsVersionConflictError,
} from "./service";
import { WorkspaceNotFoundError } from "../authorization/workspace-context";
import { WorkspacePermissionDeniedError } from "../authorization/policy";
import {
  StoredFileNotFoundError,
  StoredFilePermissionDeniedError,
} from "../files/service";

export function throwSettingsHttpError(cause: unknown): never {
  if (cause instanceof WorkspacePermissionDeniedError) {
    error(403, cause.message);
  }
  if (cause instanceof StoredFilePermissionDeniedError) {
    error(403, cause.message);
  }
  if (cause instanceof StoredFileNotFoundError) {
    error(404, cause.message);
  }
  if (
    cause instanceof SettingsVersionConflictError ||
    cause instanceof SettingsRelationsInvalidError ||
    cause instanceof SettingsConflictError ||
    cause instanceof WorkspaceNotFoundError
  ) {
    error(cause.status, cause.message);
  }
  throw cause;
}
