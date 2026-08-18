import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { requireAuthenticatedRequest } from "$lib/server/authorization/http";
import { listBusinessResponsibleUsers } from "$lib/server/businesses/service";
import { getDatabase } from "$lib/server/db";

export const GET: RequestHandler = async ({ locals }) => {
  const context = requireAuthenticatedRequest(locals);
  return json(await listBusinessResponsibleUsers(getDatabase(), context));
};
