import { error, json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { requireAuthenticatedRequest } from "$lib/server/authorization/http";
import { readRequestInput } from "$lib/server/authorization/request-input";
import { getDatabase } from "$lib/server/db";
import {
  importLegacyDeliveries,
  LegacyImportValidationError,
} from "$lib/server/legacy-imports/service";
import { legacyDeliveriesImportSchema } from "$lib/server/legacy-imports/validation";

export const POST: RequestHandler = async ({ locals, request }) => {
  const context = requireAuthenticatedRequest(locals);
  const parsed = legacyDeliveriesImportSchema.safeParse(
    await readRequestInput(request),
  );
  if (!parsed.success) error(400, "Backup legado de entregas inválido.");
  try {
    return json(
      await importLegacyDeliveries(getDatabase(), context, parsed.data),
    );
  } catch (cause) {
    if (cause instanceof LegacyImportValidationError) {
      return json(
        { message: cause.message, issues: cause.issues },
        { status: cause.status },
      );
    }
    throw cause;
  }
};
