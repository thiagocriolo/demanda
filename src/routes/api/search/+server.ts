import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { requireAuthenticatedRequest } from "$lib/server/authorization/http";
import { getDatabase } from "$lib/server/db";
import { throwDashboardHttpError } from "$lib/server/dashboard/http";
import { searchWorkspace } from "$lib/server/dashboard/service";
import { globalSearchQuerySchema } from "$lib/server/dashboard/validation";

export const GET: RequestHandler = async ({ locals, url }) => {
  const context = requireAuthenticatedRequest(locals);
  const parsed = globalSearchQuerySchema.safeParse({
    q: url.searchParams.get("q") ?? "",
    scope: url.searchParams.get("scope") ?? undefined,
    page: url.searchParams.get("page") ?? undefined,
    pageSize: url.searchParams.get("pageSize") ?? undefined,
  });
  if (!parsed.success)
    return json({ message: "Busca inválida." }, { status: 400 });
  try {
    return json(
      await searchWorkspace(getDatabase(), context, {
        query: parsed.data.q,
        scope: parsed.data.scope,
        page: parsed.data.page,
        pageSize: parsed.data.pageSize,
      }),
    );
  } catch (cause) {
    throwDashboardHttpError(cause);
  }
};
