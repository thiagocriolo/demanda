import { error, json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { requireAuthenticatedRequest } from "$lib/server/authorization/http";
import { readRequestInput } from "$lib/server/authorization/request-input";
import { getDatabase } from "$lib/server/db";
import { throwTaskHttpError } from "$lib/server/tasks/http";
import { updateWorkspaceTaskBoard } from "$lib/server/tasks/service";
import { taskBoardSchema } from "$lib/server/tasks/validation";

export const PUT: RequestHandler = async ({ locals, request }) => {
  const context = requireAuthenticatedRequest(locals);
  const parsed = taskBoardSchema.safeParse(await readRequestInput(request));
  if (!parsed.success) error(400, "Reordenação da pauta inválida.");

  try {
    return json(
      await updateWorkspaceTaskBoard(getDatabase(), context, parsed.data),
    );
  } catch (cause) {
    throwTaskHttpError(cause);
  }
};
