import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { requireAuthenticatedRequest } from "$lib/server/authorization/http";
import { getDatabase } from "$lib/server/db";
import { acceptCommunityJoinRequest } from "$lib/server/social/community-service";
import { SocialOperationError } from "$lib/server/social/service";

export const POST: RequestHandler = async ({ locals, params }) => {
  const context = requireAuthenticatedRequest(locals);
  try {
    return json(
      await acceptCommunityJoinRequest(
        getDatabase(),
        context.user.id,
        params.communityId,
        params.requestId,
      ),
    );
  } catch (cause) {
    if (cause instanceof SocialOperationError)
      return json({ message: cause.message }, { status: cause.status });
    throw cause;
  }
};
