import { json } from "@sveltejs/kit";
import { z } from "zod";
import type { RequestHandler } from "./$types";
import { requireAuthenticatedRequest } from "$lib/server/authorization/http";
import { getDatabase } from "$lib/server/db";
import { getPortfolio, SocialOperationError } from "$lib/server/social/service";

export const GET: RequestHandler = async ({ locals, params }) => {
  const context = requireAuthenticatedRequest(locals);
  const id = z.string().uuid().safeParse(params.postId);
  if (!id.success) return json({ message: "Portfólio inválido." }, { status: 400 });
  try {
    return json(await getPortfolio(getDatabase(), context.user.id, id.data));
  } catch (cause) {
    if (cause instanceof SocialOperationError) {
      return json({ message: cause.message }, { status: cause.status });
    }
    throw cause;
  }
};
