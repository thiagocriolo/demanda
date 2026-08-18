import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { requireAuthenticatedRequest } from "$lib/server/authorization/http";
import { getDatabase } from "$lib/server/db";
import { listCommunityJoinRequests } from "$lib/server/social/community-service";
import { SocialOperationError } from "$lib/server/social/service";

export const GET: RequestHandler = async ({ locals, params }) => {
  const context = requireAuthenticatedRequest(locals);
  try {
    return json(
      await listCommunityJoinRequests(
        getDatabase(),
        context.user.id,
        params.communityId,
      ),
    );
  } catch (cause) {
    if (cause instanceof SocialOperationError)
      return json({ message: cause.message }, { status: cause.status });
    throw cause;
  }
};
