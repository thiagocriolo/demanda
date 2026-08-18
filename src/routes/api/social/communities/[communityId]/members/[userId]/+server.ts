import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { requireAuthenticatedRequest } from "$lib/server/authorization/http";
import { readRequestInput } from "$lib/server/authorization/request-input";
import { getDatabase } from "$lib/server/db";
import { promoteCommunityMember } from "$lib/server/social/community-service";
import { SocialOperationError } from "$lib/server/social/service";
import { updateCommunityMemberSchema } from "$lib/server/social/validation";

export const PATCH: RequestHandler = async ({ locals, params, request }) => {
  const context = requireAuthenticatedRequest(locals);
  const input = updateCommunityMemberSchema.safeParse(
    await readRequestInput(request),
  );
  if (!input.success)
    return json({ message: "Papel de membro inválido." }, { status: 400 });
  try {
    return json(
      await promoteCommunityMember(
        getDatabase(),
        context.user.id,
        params.communityId,
        params.userId,
      ),
    );
  } catch (cause) {
    if (cause instanceof SocialOperationError)
      return json({ message: cause.message }, { status: cause.status });
    throw cause;
  }
};
