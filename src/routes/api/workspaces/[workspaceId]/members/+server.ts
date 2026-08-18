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
import { addWorkspaceCollaboratorByEmail } from "$lib/server/workspaces/service";
import { workspaceMemberInputSchema } from "$lib/server/workspaces/validation";
import { deliverWorkspaceInvitation } from "$lib/server/workspaces/invitation-delivery";

const idSchema = z.string().uuid();

export const POST: RequestHandler = async ({ locals, params, request }) => {
  const context = requireAuthenticatedRequest(locals);
  const id = idSchema.safeParse(params.workspaceId);
  const input = workspaceMemberInputSchema.safeParse(
    await readRequestInput(request),
  );
  if (!id.success || !input.success) {
    throwAuthorizationHttpError(new WorkspaceNotFoundError());
  }
  try {
    const result = await addWorkspaceCollaboratorByEmail(
      getDatabase(),
      context.user.id,
      id.data,
      input.data,
    );
    if (result.status === "pending") {
      await deliverWorkspaceInvitation(result.invitation.email);
    }
    return json(result, { status: 201 });
  } catch (cause) {
    throwAuthorizationHttpError(cause);
  }
};
