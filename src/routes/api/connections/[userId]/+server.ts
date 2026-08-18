import { json } from "@sveltejs/kit";
import { z } from "zod";
import type { RequestHandler } from "./$types";
import { requireAuthenticatedRequest } from "$lib/server/authorization/http";
import { getDatabase } from "$lib/server/db";
import {
  ConnectionOperationError,
  disconnectUsers,
} from "$lib/server/connections/service";

export const DELETE: RequestHandler = async ({ locals, params }) => {
  const context = requireAuthenticatedRequest(locals);
  const userId = z.string().uuid().safeParse(params.userId);
  if (!userId.success) return json({ message: "Usuário inválido." }, { status: 400 });
  try {
    await disconnectUsers(getDatabase(), context.user.id, userId.data);
    return new Response(null, { status: 204 });
  } catch (cause) {
    if (cause instanceof ConnectionOperationError) {
      return json({ message: cause.message }, { status: cause.status });
    }
    throw cause;
  }
};
