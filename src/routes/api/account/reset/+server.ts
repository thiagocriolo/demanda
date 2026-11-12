import { error, json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { requireAuthenticatedRequest } from "$lib/server/authorization/http";
import { readRequestInput } from "$lib/server/authorization/request-input";
import { getDatabase } from "$lib/server/db";
import { resetAccountData } from "$lib/server/settings/account-data-service";
import { getSettingsSnapshot } from "$lib/server/settings/snapshot-service";

export const POST: RequestHandler = async ({ locals, request }) => {
  const context = requireAuthenticatedRequest(locals);
  const input = await readRequestInput(request);
  if (input.confirmation !== "RESETAR") {
    error(400, "Confirmacao de reset invalida.");
  }

  const database = getDatabase();
  await resetAccountData(database, context);
  return json(await getSettingsSnapshot(database, context));
};
