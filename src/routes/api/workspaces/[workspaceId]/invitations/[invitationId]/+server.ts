import { z } from "zod";
import type { RequestHandler } from "./$types";
import {
  requireAuthenticatedRequest,
  throwAuthorizationHttpError,
} from "$lib/server/authorization/http";
import { WorkspaceNotFoundError } from "$lib/server/authorization/workspace-context";
import { getDatabase } from "$lib/server/db";
import { revokeWorkspaceInvitation } from "$lib/server/workspaces/service";

const idSchema = z.string().uuid();

export const DELETE: RequestHandler = async ({ locals, params }) => {
  const context = requireAuthenticatedRequest(locals);
  const workspaceId = idSchema.safeParse(params.workspaceId);
  const invitationId = idSchema.safeParse(params.invitationId);
  if (!workspaceId.success || !invitationId.success) {
    throwAuthorizationHttpError(new WorkspaceNotFoundError());
  }
  try {
    await revokeWorkspaceInvitation(
      getDatabase(),
      context.user.id,
      workspaceId.data,
      invitationId.data,
    );
    return new Response(null, { status: 204 });
  } catch (cause) {
    throwAuthorizationHttpError(cause);
  }
};
