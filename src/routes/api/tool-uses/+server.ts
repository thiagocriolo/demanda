import { error, json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { requireAuthenticatedRequest } from "$lib/server/authorization/http";
import { readRequestInput } from "$lib/server/authorization/request-input";
import { getDatabase } from "$lib/server/db";
import { throwToolHttpError } from "$lib/server/tools/http";
import { createWorkspaceToolUse } from "$lib/server/tools/service";
import { toolUseCreateSchema } from "$lib/server/tools/validation";

export const POST: RequestHandler = async ({ locals, request }) => {
  const context = requireAuthenticatedRequest(locals);
  const parsed = toolUseCreateSchema.safeParse(await readRequestInput(request));
  if (!parsed.success) error(400, "Dados do Uso inválidos.");
  try {
    return json(
      await createWorkspaceToolUse(getDatabase(), context, parsed.data),
      {
        status: 201,
      },
    );
  } catch (cause) {
    throwToolHttpError(cause);
  }
};
