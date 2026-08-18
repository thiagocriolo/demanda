import { error } from "@sveltejs/kit";
import { z } from "zod";
import type { PageServerLoad } from "./$types";
import { requireAuthenticatedPageRequest } from "$lib/server/authorization/http";
import { getDatabase } from "$lib/server/db";
import {
  getSocialPost,
  SocialOperationError,
} from "$lib/server/social/service";

export const load: PageServerLoad = async ({ locals, params }) => {
  const context = requireAuthenticatedPageRequest(
    locals,
    `/social/publicacoes/${params.postId}`,
  );
  const id = z.string().uuid().safeParse(params.postId);
  if (!id.success) error(404, "Publicação não encontrada.");
  try {
    return {
      post: await getSocialPost(getDatabase(), context.user.id, id.data),
    };
  } catch (cause) {
    if (cause instanceof SocialOperationError)
      error(cause.status, cause.message);
    throw cause;
  }
};
