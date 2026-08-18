import { error, json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { requireAuthenticatedRequest } from "$lib/server/authorization/http";
import { readRequestInput } from "$lib/server/authorization/request-input";
import { getDatabase } from "$lib/server/db";
import { throwCronogramaHttpError } from "$lib/server/cronograma/http";
import { reorganizeCronogramaBlocks } from "$lib/server/cronograma/service";
import { cronogramaReorganizationSchema } from "$lib/server/cronograma/validation";

export const POST: RequestHandler = async ({ locals, request }) => {
  const context = requireAuthenticatedRequest(locals);
  const parsed = cronogramaReorganizationSchema.safeParse(
    await readRequestInput(request),
  );
  if (!parsed.success) error(400, "Reorganização do Cronograma inválida.");
  try {
    return json(
      await reorganizeCronogramaBlocks(getDatabase(), context, parsed.data),
    );
  } catch (cause) {
    throwCronogramaHttpError(cause);
  }
};
