import { error } from "@sveltejs/kit";
import { throwAuthorizationHttpError } from "../authorization/http";
import {
  ContactConflictError,
  ContactLinkedUserInvalidError,
  ContactNotFoundError,
} from "./service";

export function throwContactHttpError(cause: unknown): never {
  if (cause instanceof ContactNotFoundError) {
    error(404, "Contato não encontrado.");
  }
  if (cause instanceof ContactLinkedUserInvalidError) {
    error(400, cause.message);
  }
  if (cause instanceof ContactConflictError) {
    error(409, cause.message);
  }
  throwAuthorizationHttpError(cause);
}
