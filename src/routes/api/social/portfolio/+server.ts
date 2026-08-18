import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { requireAuthenticatedRequest } from "$lib/server/authorization/http";
import { readRequestInput } from "$lib/server/authorization/request-input";
import { getDatabase } from "$lib/server/db";
import {
  createSocialPost,
  listPortfolios,
  SocialOperationError,
} from "$lib/server/social/service";
import { createSocialPostSchema } from "$lib/server/social/validation";

export const GET: RequestHandler = async ({ locals, url }) => {
  const context = requireAuthenticatedRequest(locals);
  return json(
    await listPortfolios(
      getDatabase(),
      context.user.id,
      url.searchParams.get("cursor") ?? undefined,
    ),
  );
};

export const POST: RequestHandler = async ({ locals, request }) => {
  const context = requireAuthenticatedRequest(locals);
  const input = createSocialPostSchema.safeParse(await readRequestInput(request));
  if (!input.success || input.data.kind !== "portfolio") {
    return json({ message: "Portfólio inválido." }, { status: 400 });
  }
  try {
    return json(await createSocialPost(getDatabase(), context.user.id, input.data), {
      status: 201,
    });
  } catch (cause) {
    if (cause instanceof SocialOperationError) {
      return json({ message: cause.message }, { status: cause.status });
    }
    throw cause;
  }
};
