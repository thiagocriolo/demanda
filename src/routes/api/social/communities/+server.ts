import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { requireAuthenticatedRequest } from "$lib/server/authorization/http";
import { readRequestInput } from "$lib/server/authorization/request-input";
import { getDatabase } from "$lib/server/db";
import {
  createCommunity,
  listCommunities,
} from "$lib/server/social/community-service";
import { SocialOperationError } from "$lib/server/social/service";
import { createCommunitySchema } from "$lib/server/social/validation";

export const GET: RequestHandler = async ({ locals }) => {
  const context = requireAuthenticatedRequest(locals);
  return json(await listCommunities(getDatabase(), context.user.id));
};

export const POST: RequestHandler = async ({ locals, request }) => {
  const context = requireAuthenticatedRequest(locals);
  const input = createCommunitySchema.safeParse(
    await readRequestInput(request),
  );
  if (!input.success) {
    return json({ message: "Dados da comunidade inválidos." }, { status: 400 });
  }
  try {
    return json(
      await createCommunity(getDatabase(), context.user.id, input.data),
      { status: 201 },
    );
  } catch (cause) {
    if (cause instanceof SocialOperationError) {
      return json({ message: cause.message }, { status: cause.status });
    }
    throw cause;
  }
};
