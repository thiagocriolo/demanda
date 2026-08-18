import { json } from "@sveltejs/kit";
import { z } from "zod";
import type { RequestHandler } from "./$types";
import {
  requireAuthenticatedRequest,
  throwAuthorizationHttpError,
} from "$lib/server/authorization/http";
import { readRequestInput } from "$lib/server/authorization/request-input";
import {
  switchActiveWorkspace,
  WorkspaceNotFoundError,
} from "$lib/server/authorization/workspace-context";
import { getDatabase } from "$lib/server/db";

const inputSchema = z.object({ workspaceId: z.string().uuid() });

export const POST: RequestHandler = async ({ locals, request }) => {
  const context = requireAuthenticatedRequest(locals);
  const parsed = inputSchema.safeParse(await readRequestInput(request));
  if (!parsed.success)
    throwAuthorizationHttpError(new WorkspaceNotFoundError());

  try {
    const access = await switchActiveWorkspace(
      getDatabase(),
      context,
      parsed.data.workspaceId,
    );
    return json({
      activeWorkspace: {
        id: access.workspace.id,
        name: access.workspace.name,
        role: access.membership.role,
      },
    });
  } catch (cause) {
    throwAuthorizationHttpError(cause);
  }
};
