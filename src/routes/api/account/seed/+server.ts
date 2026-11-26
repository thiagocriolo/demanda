import { error, json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { requireAuthenticatedRequest } from "$lib/server/authorization/http";
import { getDatabase } from "$lib/server/db";
import {
  AccountSeedUnavailableError,
  seedAccountData,
} from "$lib/server/settings/account-seed-service";

export const POST: RequestHandler = async ({ locals, request }) => {
  const { user } = requireAuthenticatedRequest(locals);
  if (
    request.headers.get("content-type")?.split(";")[0] !== "application/json"
  ) {
    error(415, "Envie a solicitação de Seed em JSON.");
  }
  try {
    const result = await seedAccountData(getDatabase(), user.id);
    return json(result, { status: result.created ? 201 : 200 });
  } catch (cause) {
    if (cause instanceof AccountSeedUnavailableError) error(409, cause.message);
    throw cause;
  }
};
