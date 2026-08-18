import { json } from "@sveltejs/kit";
import { z } from "zod";
import type { RequestHandler } from "./$types";
import {
  auditRequestMetadata,
  requireAuthenticatedRequest,
  throwAuthorizationHttpError,
} from "$lib/server/authorization/http";
import { readRequestInput } from "$lib/server/authorization/request-input";
import { transferWorkspaceOwnership } from "$lib/server/authorization/workspace-administration";
import { WorkspaceNotFoundError } from "$lib/server/authorization/workspace-context";
import { getDatabase } from "$lib/server/db";

const identifierSchema = z.string().uuid();
const inputSchema = z.object({ targetUserId: z.string().uuid() });

export const PATCH: RequestHandler = async (event) => {
  const context = requireAuthenticatedRequest(event.locals);
  const workspaceId = identifierSchema.safeParse(event.params.workspaceId);
  const input = inputSchema.safeParse(await readRequestInput(event.request));
  if (!workspaceId.success || !input.success) {
    throwAuthorizationHttpError(new WorkspaceNotFoundError());
  }

  try {
    await transferWorkspaceOwnership(getDatabase(), context, {
      workspaceId: workspaceId.data,
      targetUserId: input.data.targetUserId,
      request: auditRequestMetadata(event),
    });
    return json({ updated: true });
  } catch (cause) {
    throwAuthorizationHttpError(cause);
  }
};
