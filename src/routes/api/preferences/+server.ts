import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import {
  auditRequestMetadata,
  requireAuthenticatedRequest,
} from "$lib/server/authorization/http";
import { readRequestInput } from "$lib/server/authorization/request-input";
import { getDatabase } from "$lib/server/db";
import { throwSettingsHttpError } from "$lib/server/settings/http";
import {
  getUserSettings,
  updateUserSettings,
} from "$lib/server/settings/service";
import { personalSettingsUpdateSchema } from "$lib/server/settings/validation";

export const GET: RequestHandler = async ({ locals }) => {
  const context = requireAuthenticatedRequest(locals);
  return json(await getUserSettings(getDatabase(), context));
};

export const PUT: RequestHandler = async (event) => {
  const context = requireAuthenticatedRequest(event.locals);
  const parsed = personalSettingsUpdateSchema.safeParse(
    await readRequestInput(event.request),
  );
  if (!parsed.success) {
    return new Response(
      JSON.stringify({ message: "Preferências pessoais inválidas." }),
      { status: 400, headers: { "content-type": "application/json" } },
    );
  }
  try {
    return json(
      await updateUserSettings(
        getDatabase(),
        context,
        parsed.data,
        auditRequestMetadata(event),
      ),
    );
  } catch (cause) {
    throwSettingsHttpError(cause);
  }
};
