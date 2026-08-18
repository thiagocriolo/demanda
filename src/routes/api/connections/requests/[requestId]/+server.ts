import { json } from "@sveltejs/kit";
import { z } from "zod";
import type { RequestHandler } from "./$types";
import { requireAuthenticatedRequest } from "$lib/server/authorization/http";
import { readRequestInput } from "$lib/server/authorization/request-input";
import { getDatabase } from "$lib/server/db";
import {
  ConnectionOperationError,
  respondToConnectionRequest,
} from "$lib/server/connections/service";

const inputSchema = z
  .object({ action: z.enum(["accept", "decline", "cancel"]) })
  .strict();

export const PATCH: RequestHandler = async ({ locals, params, request }) => {
  const context = requireAuthenticatedRequest(locals);
  const id = z.string().uuid().safeParse(params.requestId);
  const input = inputSchema.safeParse(await readRequestInput(request));
  if (!id.success || !input.success) {
    return json({ message: "Solicitação inválida." }, { status: 400 });
  }
  try {
    await respondToConnectionRequest(
      getDatabase(),
      context.user.id,
      id.data,
      input.data.action,
    );
    return json({ ok: true });
  } catch (cause) {
    if (cause instanceof ConnectionOperationError) {
      return json({ message: cause.message }, { status: cause.status });
    }
    throw cause;
  }
};
