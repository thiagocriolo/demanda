import type { PageServerLoad } from "./$types";
import { requireAuthenticatedRequest } from "$lib/server/authorization/http";
import { getDatabase } from "$lib/server/db";
import { getPublicUserPage } from "$lib/server/social/public-profile";

export const load: PageServerLoad = async ({ locals }) => {
  const context = requireAuthenticatedRequest(locals);
  const page = await getPublicUserPage(
    getDatabase(),
    context.user.username,
    context.user.id,
  );
  return { posts: page?.posts ?? [] };
};
