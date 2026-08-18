import { error, json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { requireAuthenticatedRequest } from "$lib/server/authorization/http";
import { getDatabase } from "$lib/server/db";
import { throwToolHttpError } from "$lib/server/tools/http";
import { listWorkspaceTools } from "$lib/server/tools/service";
import { toolListQuerySchema } from "$lib/server/tools/validation";

export const GET: RequestHandler = async ({ locals, url }) => {
  const context = requireAuthenticatedRequest(locals);
  const parsed = toolListQuerySchema.safeParse(
    Object.fromEntries(url.searchParams),
  );
  if (!parsed.success) error(400, "Filtros de Ferramentas inválidos.");
  try {
    return json(
      await listWorkspaceTools(getDatabase(), context, parsed.data.workspaceId),
    );
  } catch (cause) {
    throwToolHttpError(cause);
  }
};
