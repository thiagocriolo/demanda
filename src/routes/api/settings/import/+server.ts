import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { requireAuthenticatedRequest } from "$lib/server/authorization/http";
import { readRequestInput } from "$lib/server/authorization/request-input";
import { getDatabase } from "$lib/server/db";
import { throwSettingsHttpError } from "$lib/server/settings/http";
import { importSettingsSnapshot } from "$lib/server/settings/service";
import { settingsImportSchema } from "$lib/server/settings/validation";

export const POST: RequestHandler = async ({ locals, request }) => {
  const context = requireAuthenticatedRequest(locals);
  const parsed = settingsImportSchema.safeParse(
    await readRequestInput(request),
  );
  if (!parsed.success) {
    return json(
      { message: "Arquivo de configuracoes invalido." },
      { status: 400 },
    );
  }
  try {
    return json(
      await importSettingsSnapshot(getDatabase(), context, parsed.data),
    );
  } catch (cause) {
    throwSettingsHttpError(cause);
  }
};
