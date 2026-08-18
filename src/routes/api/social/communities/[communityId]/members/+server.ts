import { json } from "@sveltejs/kit";
import { z } from "zod";
import type { RequestHandler } from "./$types";
import { requireAuthenticatedRequest } from "$lib/server/authorization/http";
import { readRequestInput } from "$lib/server/authorization/request-input";
import { getDatabase } from "$lib/server/db";
import {
  inviteCommunityMember,
  searchCommunityMemberCandidates,
} from "$lib/server/social/community-service";
import { SocialOperationError } from "$lib/server/social/service";
import { addCommunityMemberSchema } from "$lib/server/social/validation";

const querySchema = z.string().trim().min(1).max(320);

export const GET: RequestHandler = async ({ locals, params, url }) => {
  const context = requireAuthenticatedRequest(locals);
  const query = querySchema.safeParse(url.searchParams.get("q") ?? "");
  if (!query.success) return json({ results: [] });

  try {
    return json({
      results: await searchCommunityMemberCandidates(
        getDatabase(),
        context.user.id,
        params.communityId,
        query.data,
      ),
    });
  } catch (cause) {
    if (cause instanceof SocialOperationError)
      return json({ message: cause.message }, { status: cause.status });
    throw cause;
  }
};

export const POST: RequestHandler = async ({ locals, params, request }) => {
  const context = requireAuthenticatedRequest(locals);
  const input = addCommunityMemberSchema.safeParse(
    await readRequestInput(request),
  );
  if (!input.success)
    return json({ message: "Pessoa inválida." }, { status: 400 });

  try {
    await inviteCommunityMember(
      getDatabase(),
      context.user.id,
      params.communityId,
      input.data.userId,
    );
    return json({ sent: true }, { status: 201 });
  } catch (cause) {
    if (cause instanceof SocialOperationError)
      return json({ message: cause.message }, { status: cause.status });
    throw cause;
  }
};
