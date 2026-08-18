import { json } from "@sveltejs/kit";
import { z } from "zod";
import type { RequestHandler } from "./$types";
import { requireAuthenticatedRequest } from "$lib/server/authorization/http";
import { searchConnectionUsers } from "$lib/server/connections/service";
import { getDatabase } from "$lib/server/db";

const querySchema = z.string().trim().min(1).max(320);

export const GET: RequestHandler = async ({ locals, url }) => {
  const context = requireAuthenticatedRequest(locals);
  const query = querySchema.safeParse(url.searchParams.get("q") ?? "");
  if (!query.success) return json({ results: [] });

  return json({
    results: await searchConnectionUsers(
      getDatabase(),
      context.user.id,
      query.data,
      3,
    ),
  });
};
