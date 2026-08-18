import { json } from "@sveltejs/kit";
import { z } from "zod";
import type { RequestHandler } from "./$types";
import {
  requireAuthenticatedRequest,
  throwAuthorizationHttpError,
} from "$lib/server/authorization/http";
import { WorkspaceNotFoundError } from "$lib/server/authorization/workspace-context";
import { getDatabase } from "$lib/server/db";
import { removeWorkspaceMember } from "$lib/server/workspaces/service";

const idSchema = z.string().uuid();

export const DELETE: RequestHandler = async ({ locals, params }) => {
  const context = requireAuthenticatedRequest(locals);
  const workspaceId = idSchema.safeParse(params.workspaceId);
  const userId = idSchema.safeParse(params.userId);
  if (!workspaceId.success || !userId.success) {
    throwAuthorizationHttpError(new WorkspaceNotFoundError());
  }
  try {
    await removeWorkspaceMember(
      getDatabase(),
      context.user.id,
      workspaceId.data,
      userId.data,
    );
    return json({ removed: true });
  } catch (cause) {
    throwAuthorizationHttpError(cause);
  }
};
