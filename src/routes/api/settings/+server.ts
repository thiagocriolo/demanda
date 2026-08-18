import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { requireAuthenticatedRequest } from "$lib/server/authorization/http";
import { getDatabase } from "$lib/server/db";
import { throwSettingsHttpError } from "$lib/server/settings/http";
import { getSettingsSnapshot } from "$lib/server/settings/service";

export const GET: RequestHandler = async ({ locals }) => {
  const context = requireAuthenticatedRequest(locals);
  try {
    return json(await getSettingsSnapshot(getDatabase(), context));
  } catch (cause) {
    throwSettingsHttpError(cause);
  }
};
