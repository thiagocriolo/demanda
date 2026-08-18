import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import {
  requireAuthenticatedRequest,
  throwAuthorizationHttpError,
} from "$lib/server/authorization/http";
import { readRequestInput } from "$lib/server/authorization/request-input";
import { getDatabase } from "$lib/server/db";
import {
  createUserWorkspace,
  listUserWorkspaces,
} from "$lib/server/workspaces/service";
import { workspaceInputSchema } from "$lib/server/workspaces/validation";

export const GET: RequestHandler = async ({ locals }) => {
  const context = requireAuthenticatedRequest(locals);
  return json(
    await listUserWorkspaces(
      getDatabase(),
      context.user.id,
      context.session.activeWorkspaceId,
    ),
  );
};

export const POST: RequestHandler = async ({ locals, request }) => {
  const context = requireAuthenticatedRequest(locals);
  const parsed = workspaceInputSchema.safeParse(
    await readRequestInput(request),
  );
  if (!parsed.success) {
    return json({ message: "Dados do workspace inválidos." }, { status: 400 });
  }
  try {
    const id = await createUserWorkspace(
      getDatabase(),
      context.user.id,
      parsed.data,
    );
    return json({ id }, { status: 201 });
  } catch (cause) {
    throwAuthorizationHttpError(cause);
  }
};
