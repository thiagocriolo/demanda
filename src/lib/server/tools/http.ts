import { error } from "@sveltejs/kit";
import { throwAuthorizationHttpError } from "../authorization/http";
import {
  ToolInputError,
  ToolModelNotFoundError,
  ToolStateConflictError,
  ToolUseNotFoundError,
  ToolVersionConflictError,
} from "./service";

export function throwToolHttpError(cause: unknown): never {
  if (
    cause instanceof ToolModelNotFoundError ||
    cause instanceof ToolUseNotFoundError
  ) {
    error(404, cause.message);
  }
  if (cause instanceof ToolInputError) error(400, cause.message);
  if (
    cause instanceof ToolStateConflictError ||
    cause instanceof ToolVersionConflictError
  ) {
    error(409, cause.message);
  }
  throwAuthorizationHttpError(cause);
}
