import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { requireAuthenticatedRequest } from "$lib/server/authorization/http";
import { getDatabase } from "$lib/server/db";
import { throwDashboardHttpError } from "$lib/server/dashboard/http";
import { getDashboardSnapshot } from "$lib/server/dashboard/service";
import { dashboardQuerySchema } from "$lib/server/dashboard/validation";

export const GET: RequestHandler = async ({ locals, url }) => {
  const context = requireAuthenticatedRequest(locals);
  const parsed = dashboardQuerySchema.safeParse(
    Object.fromEntries(url.searchParams),
  );
  if (!parsed.success)
    return json(
      { message: "Consulta do Dashboard inválida." },
      { status: 400 },
    );
  try {
    return json(
      await getDashboardSnapshot(getDatabase(), context, parsed.data),
    );
  } catch (cause) {
    throwDashboardHttpError(cause);
  }
};
