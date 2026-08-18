import { error, json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { requireAuthenticatedRequest } from "$lib/server/authorization/http";
import { readRequestInput } from "$lib/server/authorization/request-input";
import { getDatabase } from "$lib/server/db";
import { throwToolHttpError } from "$lib/server/tools/http";
import { createWorkspaceToolModel } from "$lib/server/tools/service";
import { toolModelCreateSchema } from "$lib/server/tools/validation";

export const POST: RequestHandler = async ({ locals, request }) => {
  const context = requireAuthenticatedRequest(locals);
  const parsed = toolModelCreateSchema.safeParse(
    await readRequestInput(request),
  );
  if (!parsed.success) error(400, "Dados do Modelo inválidos.");
  try {
    return json(
      await createWorkspaceToolModel(getDatabase(), context, parsed.data),
      {
        status: 201,
      },
    );
  } catch (cause) {
    throwToolHttpError(cause);
  }
};
