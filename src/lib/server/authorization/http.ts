import { error, redirect, type RequestEvent } from "@sveltejs/kit";
import { WorkspacePermissionDeniedError } from "./policy";
import type { AuditRequestMetadata } from "./audit";
import {
  ActiveWorkspaceRequiredError,
  WorkspaceNotFoundError,
  type RequestAuthorizationContext,
} from "./workspace-context";
import { WorkspaceOperationNotAllowedError } from "./workspace-administration";

export function requireAuthenticatedRequest(
  locals: App.Locals,
): RequestAuthorizationContext {
  if (!locals.auth) error(401, "Autenticação necessária.");
  return locals.auth;
}

export function requireAuthenticatedPageRequest(
  locals: App.Locals,
  returnTo: string,
): RequestAuthorizationContext {
  if (!locals.auth) {
    redirect(303, `/login?next=${encodeURIComponent(returnTo)}`);
  }
  return locals.auth;
}

export function throwAuthorizationHttpError(cause: unknown): never {
  if (cause instanceof WorkspaceNotFoundError) {
    error(404, "Recurso não encontrado.");
  }
  if (cause instanceof WorkspacePermissionDeniedError) {
    error(403, "Acesso não autorizado.");
  }
  if (
    cause instanceof ActiveWorkspaceRequiredError ||
    cause instanceof WorkspaceOperationNotAllowedError
  ) {
    error(409, cause.message);
  }
  throw cause;
}

export function auditRequestMetadata(
  event: Pick<RequestEvent, "getClientAddress" | "request">,
): AuditRequestMetadata {
  let ipAddress: string | null = null;
  try {
    ipAddress = event.getClientAddress();
  } catch {
    // Alguns adaptadores não expõem o endereço; a auditoria continua válida.
  }
  return {
    ipAddress,
    userAgent: event.request.headers.get("user-agent"),
  };
}
