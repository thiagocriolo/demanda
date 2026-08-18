import { json } from "@sveltejs/kit";
import { z } from "zod";
import type { RequestHandler } from "./$types";
import {
  requireAuthenticatedRequest,
  throwAuthorizationHttpError,
} from "$lib/server/authorization/http";
import { WorkspaceNotFoundError } from "$lib/server/authorization/workspace-context";
import { getDatabase } from "$lib/server/db";
import { acceptWorkspaceInvitation } from "$lib/server/workspaces/service";

const idSchema = z.string().uuid();

export const POST: RequestHandler = async ({ locals, params }) => {
  const context = requireAuthenticatedRequest(locals);
  const invitationId = idSchema.safeParse(params.invitationId);
  if (!invitationId.success) {
    throwAuthorizationHttpError(new WorkspaceNotFoundError());
  }
  try {
    const workspaceId = await acceptWorkspaceInvitation(
      getDatabase(),
      context.user.id,
      invitationId.data,
    );
    return json({ workspaceId });
  } catch (cause) {
    throwAuthorizationHttpError(cause);
  }
};
