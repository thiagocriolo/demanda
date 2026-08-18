import { json } from "@sveltejs/kit";
import { z } from "zod";
import type { RequestHandler } from "./$types";
import { requireAuthenticatedRequest } from "$lib/server/authorization/http";
import { getDatabase } from "$lib/server/db";
import {
  deletePostComment,
  SocialOperationError,
} from "$lib/server/social/service";

export const DELETE: RequestHandler = async ({ locals, params }) => {
  const context = requireAuthenticatedRequest(locals);
  const ids = z
    .object({ postId: z.string().uuid(), commentId: z.string().uuid() })
    .safeParse(params);
  if (!ids.success) {
    return json({ message: "Comentário inválido." }, { status: 400 });
  }
  try {
    return json(
      await deletePostComment(
        getDatabase(),
        context.user.id,
        ids.data.postId,
        ids.data.commentId,
      ),
    );
  } catch (cause) {
    if (cause instanceof SocialOperationError) {
      return json({ message: cause.message }, { status: cause.status });
    }
    throw cause;
  }
};
