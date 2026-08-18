import { json } from "@sveltejs/kit";
import { z } from "zod";
import type { RequestHandler } from "./$types";
import {
  requireAuthenticatedRequest,
  throwAuthorizationHttpError,
} from "$lib/server/authorization/http";
import { readRequestInput } from "$lib/server/authorization/request-input";
import { WorkspaceNotFoundError } from "$lib/server/authorization/workspace-context";
import { getDatabase } from "$lib/server/db";
import {
  archiveUserWorkspace,
  updateUserWorkspace,
} from "$lib/server/workspaces/service";
import { workspaceInputSchema } from "$lib/server/workspaces/validation";

const idSchema = z.string().uuid();

export const PATCH: RequestHandler = async ({ locals, params, request }) => {
  const context = requireAuthenticatedRequest(locals);
  const id = idSchema.safeParse(params.workspaceId);
  const input = workspaceInputSchema.safeParse(await readRequestInput(request));
  if (!id.success || !input.success) {
    throwAuthorizationHttpError(new WorkspaceNotFoundError());
  }
  try {
    await updateUserWorkspace(
      getDatabase(),
      context.user.id,
      id.data,
      input.data,
    );
    return json({ updated: true });
  } catch (cause) {
    throwAuthorizationHttpError(cause);
  }
};

export const DELETE: RequestHandler = async ({ locals, params }) => {
  const context = requireAuthenticatedRequest(locals);
  const id = idSchema.safeParse(params.workspaceId);
  if (!id.success) throwAuthorizationHttpError(new WorkspaceNotFoundError());
  try {
    await archiveUserWorkspace(getDatabase(), context.user.id, id.data);
    return json({ archived: true });
  } catch (cause) {
    throwAuthorizationHttpError(cause);
  }
};
