import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { requireAuthenticatedRequest } from "$lib/server/authorization/http";
import { readRequestInput } from "$lib/server/authorization/request-input";
import { getDatabase } from "$lib/server/db";
import {
  createCommunityPost,
  listCommunityFeed,
} from "$lib/server/social/community-service";
import { SocialOperationError } from "$lib/server/social/service";
import { createSocialPostSchema } from "$lib/server/social/validation";

export const GET: RequestHandler = async ({ locals, params, url }) => {
  const context = requireAuthenticatedRequest(locals);
  try {
    return json(
      await listCommunityFeed(
        getDatabase(),
        context.user.id,
        params.communityId,
        url.searchParams.get("cursor") ?? undefined,
      ),
    );
  } catch (cause) {
    if (cause instanceof SocialOperationError) {
      return json({ message: cause.message }, { status: cause.status });
    }
    throw cause;
  }
};

export const POST: RequestHandler = async ({ locals, params, request }) => {
  const context = requireAuthenticatedRequest(locals);
  const input = createSocialPostSchema.safeParse(
    await readRequestInput(request),
  );
  if (!input.success || input.data.kind !== "feed") {
    return json({ message: "Publicação inválida." }, { status: 400 });
  }
  try {
    return json(
      await createCommunityPost(
        getDatabase(),
        context.user.id,
        params.communityId,
        input.data,
      ),
      { status: 201 },
    );
  } catch (cause) {
    if (cause instanceof SocialOperationError) {
      return json({ message: cause.message }, { status: cause.status });
    }
    throw cause;
  }
};
