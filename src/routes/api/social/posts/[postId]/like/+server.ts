import { json } from "@sveltejs/kit";
import { z } from "zod";
import type { RequestHandler } from "./$types";
import { requireAuthenticatedRequest } from "$lib/server/authorization/http";
import { getDatabase } from "$lib/server/db";
import { setPostLike, SocialOperationError } from "$lib/server/social/service";

async function updateLike(locals: App.Locals, postId: string, liked: boolean) {
  const context = requireAuthenticatedRequest(locals);
  const id = z.string().uuid().safeParse(postId);
  if (!id.success) {
    return json({ message: "Publicação inválida." }, { status: 400 });
  }
  try {
    return json(
      await setPostLike(getDatabase(), context.user.id, id.data, liked),
    );
  } catch (cause) {
    if (cause instanceof SocialOperationError) {
      return json({ message: cause.message }, { status: cause.status });
    }
    throw cause;
  }
}

export const POST: RequestHandler = ({ locals, params }) =>
  updateLike(locals, params.postId, true);

export const DELETE: RequestHandler = ({ locals, params }) =>
  updateLike(locals, params.postId, false);
