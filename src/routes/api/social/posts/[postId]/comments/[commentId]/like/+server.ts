import { json } from "@sveltejs/kit";
import { z } from "zod";
import type { RequestHandler } from "./$types";
import { requireAuthenticatedRequest } from "$lib/server/authorization/http";
import { getDatabase } from "$lib/server/db";
import {
  setCommentLike,
  SocialOperationError,
} from "$lib/server/social/service";

async function updateLike(
  locals: App.Locals,
  params: { postId: string; commentId: string },
  liked: boolean,
) {
  const context = requireAuthenticatedRequest(locals);
  const ids = z
    .object({ postId: z.string().uuid(), commentId: z.string().uuid() })
    .safeParse(params);
  if (!ids.success) {
    return json({ message: "Comentário inválido." }, { status: 400 });
  }
  try {
    return json(
      await setCommentLike(
        getDatabase(),
        context.user.id,
        ids.data.postId,
        ids.data.commentId,
        liked,
      ),
    );
  } catch (cause) {
    if (cause instanceof SocialOperationError) {
      return json({ message: cause.message }, { status: cause.status });
    }
    throw cause;
  }
}

export const POST: RequestHandler = ({ locals, params }) =>
  updateLike(locals, params, true);

export const DELETE: RequestHandler = ({ locals, params }) =>
  updateLike(locals, params, false);
