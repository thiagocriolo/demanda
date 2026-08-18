import { error, json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { requireAuthenticatedRequest } from "$lib/server/authorization/http";
import { getDatabase } from "$lib/server/db";
import { throwCronogramaHttpError } from "$lib/server/cronograma/http";
import { getWorkspaceCronograma } from "$lib/server/cronograma/service";
import { cronogramaQuerySchema } from "$lib/server/cronograma/validation";

export const GET: RequestHandler = async ({ locals, url }) => {
  const context = requireAuthenticatedRequest(locals);
  const parsed = cronogramaQuerySchema.safeParse({
    workspaceId: url.searchParams.get("workspaceId") ?? undefined,
    from: url.searchParams.get("from") ?? undefined,
    to: url.searchParams.get("to") ?? undefined,
    responsibleUserId: url.searchParams.get("responsibleUserId") ?? undefined,
  });
  if (!parsed.success) error(400, "Filtros do Cronograma inválidos.");
  try {
    return json(
      await getWorkspaceCronograma(getDatabase(), context, parsed.data),
    );
  } catch (cause) {
    throwCronogramaHttpError(cause);
  }
};
