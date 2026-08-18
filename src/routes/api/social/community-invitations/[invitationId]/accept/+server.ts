import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { requireAuthenticatedRequest } from "$lib/server/authorization/http";
import { getDatabase } from "$lib/server/db";
import { acceptCommunityInvitation } from "$lib/server/social/community-service";
import { SocialOperationError } from "$lib/server/social/service";

export const POST: RequestHandler = async ({ locals, params }) => {
  const context = requireAuthenticatedRequest(locals);
  try {
    return json(
      await acceptCommunityInvitation(
        getDatabase(),
        context.user.id,
        params.invitationId,
      ),
    );
  } catch (cause) {
    if (cause instanceof SocialOperationError)
      return json({ message: cause.message }, { status: cause.status });
    throw cause;
  }
};
