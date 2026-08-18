import { error } from "@sveltejs/kit";
import { throwAuthorizationHttpError } from "../authorization/http";
import {
  BusinessNotFoundError,
  BusinessResponsiblesInvalidError,
} from "./service";

export function throwBusinessHttpError(cause: unknown): never {
  if (cause instanceof BusinessNotFoundError) {
    error(404, "Negocio nao encontrado.");
  }
  if (cause instanceof BusinessResponsiblesInvalidError) {
    error(400, cause.message);
  }
  throwAuthorizationHttpError(cause);
}
