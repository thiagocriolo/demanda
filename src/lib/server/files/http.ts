import { error } from "@sveltejs/kit";
import { WorkspacePermissionDeniedError } from "../authorization/policy";
import { WorkspaceNotFoundError } from "../authorization/workspace-context";
import {
  StoredFileNotFoundError,
  StoredFilePermissionDeniedError,
} from "./service";
import { StorageQuotaExceededError } from "./quota";
import { InvalidStoredFileError } from "./validation";

export function throwStoredFileHttpError(cause: unknown): never {
  if (
    cause instanceof StoredFileNotFoundError ||
    cause instanceof WorkspaceNotFoundError
  ) {
    error(404, "Arquivo não encontrado.");
  }
  if (
    cause instanceof StoredFilePermissionDeniedError ||
    cause instanceof WorkspacePermissionDeniedError
  ) {
    error(403, cause.message);
  }
  if (cause instanceof InvalidStoredFileError) error(400, cause.message);
  if (cause instanceof StorageQuotaExceededError) error(413, cause.message);
  throw cause;
}
