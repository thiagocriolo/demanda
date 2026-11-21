import { error, json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { requireAuthenticatedRequest } from "$lib/server/authorization/http";
import { getDatabase } from "$lib/server/db";
import { getHistoryReport } from "$lib/server/history/service";
import { historyQuerySchema } from "$lib/server/history/validation";

export const GET: RequestHandler = async ({ locals, url }) => {
  const context = requireAuthenticatedRequest(locals);
  const parsed = historyQuerySchema.safeParse(
    Object.fromEntries(url.searchParams),
  );
  if (!parsed.success) error(400, "Filtros do HistÃ³rico invÃ¡lidos.");
  return json(await getHistoryReport(getDatabase(), context, parsed.data));
};
