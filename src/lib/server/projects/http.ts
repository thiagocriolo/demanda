import { error } from "@sveltejs/kit";
import { throwAuthorizationHttpError } from "../authorization/http";
import {
  InstitutionalProjectProtectedError,
  ProjectFrequencyLockedError,
  ProjectNotFoundError,
  ProjectRelationsInvalidError,
  ServiceNameConflictError,
  ServiceNotFoundError,
  ServiceRelationsInvalidError,
} from "./service";

export function throwProjectHttpError(cause: unknown): never {
  if (cause instanceof ProjectNotFoundError) {
    error(404, "Projeto nao encontrado.");
  }
  if (cause instanceof ServiceNotFoundError) {
    error(404, "Servico nao encontrado.");
  }
  if (
    cause instanceof ProjectRelationsInvalidError ||
    cause instanceof ServiceRelationsInvalidError
  ) {
    error(400, cause.message);
  }
  if (cause instanceof ServiceNameConflictError) {
    error(409, cause.message);
  }
  if (
    cause instanceof InstitutionalProjectProtectedError ||
    cause instanceof ProjectFrequencyLockedError
  ) {
    error(409, cause.message);
  }
  throwAuthorizationHttpError(cause);
}
