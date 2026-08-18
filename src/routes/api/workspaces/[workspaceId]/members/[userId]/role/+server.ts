import { json } from "@sveltejs/kit";
import { z } from "zod";
import type { RequestHandler } from "./$types";
import {
  auditRequestMetadata,
  requireAuthenticatedRequest,
  throwAuthorizationHttpError,
} from "$lib/server/authorization/http";
import { readRequestInput } from "$lib/server/authorization/request-input";
import { changeWorkspaceMemberRole } from "$lib/server/authorization/workspace-administration";
import { WorkspaceNotFoundError } from "$lib/server/authorization/workspace-context";
import { getDatabase } from "$lib/server/db";

const identifierSchema = z.string().uuid();
const inputSchema = z.object({ role: z.enum(["admin", "member"]) });

export const PATCH: RequestHandler = async (event) => {
  const context = requireAuthenticatedRequest(event.locals);
  const workspaceId = identifierSchema.safeParse(event.params.workspaceId);
  const userId = identifierSchema.safeParse(event.params.userId);
  const input = inputSchema.safeParse(await readRequestInput(event.request));
  if (!workspaceId.success || !userId.success || !input.success) {
    throwAuthorizationHttpError(new WorkspaceNotFoundError());
  }

  try {
    await changeWorkspaceMemberRole(getDatabase(), context, {
      workspaceId: workspaceId.data,
      targetUserId: userId.data,
      role: input.data.role,
      request: auditRequestMetadata(event),
    });
    return json({ updated: true });
  } catch (cause) {
    throwAuthorizationHttpError(cause);
  }
};
