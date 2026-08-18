import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { requireAuthenticatedRequest } from "$lib/server/authorization/http";
import { getDatabase } from "$lib/server/db";
import {
  ConnectionOperationError,
  listConnectionDashboard,
  requestConnection,
} from "$lib/server/connections/service";
import { readRequestInput } from "$lib/server/authorization/request-input";
import { z } from "zod";

const requestSchema = z.object({ userId: z.string().uuid() }).strict();

function failure(cause: unknown): Response {
  if (cause instanceof ConnectionOperationError) {
    return json({ message: cause.message }, { status: cause.status });
  }
  throw cause;
}

export const GET: RequestHandler = async ({ locals }) => {
  const context = requireAuthenticatedRequest(locals);
  return json(await listConnectionDashboard(getDatabase(), context.user.id));
};

export const POST: RequestHandler = async ({ locals, request }) => {
  const context = requireAuthenticatedRequest(locals);
  const input = requestSchema.safeParse(await readRequestInput(request));
  if (!input.success) return json({ message: "Usuário inválido." }, { status: 400 });
  try {
    return json(
      await requestConnection(getDatabase(), context.user.id, input.data.userId),
      { status: 201 },
    );
  } catch (cause) {
    return failure(cause);
  }
};
