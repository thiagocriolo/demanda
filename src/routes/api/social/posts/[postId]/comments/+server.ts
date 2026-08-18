import { json } from "@sveltejs/kit";
import { z } from "zod";
import type { RequestHandler } from "./$types";
import { requireAuthenticatedRequest } from "$lib/server/authorization/http";
import { readRequestInput } from "$lib/server/authorization/request-input";
import { getDatabase } from "$lib/server/db";
import {
  createPostComment,
  listPostComments,
  SocialOperationError,
} from "$lib/server/social/service";
import { createSocialCommentSchema } from "$lib/server/social/validation";

function validPostId(postId: string) {
  return z.string().uuid().safeParse(postId);
}

export const GET: RequestHandler = async ({ locals, params }) => {
  const context = requireAuthenticatedRequest(locals);
  const id = validPostId(params.postId);
  if (!id.success) {
    return json({ message: "Publicação inválida." }, { status: 400 });
  }
  try {
    return json(
      await listPostComments(getDatabase(), context.user.id, id.data),
    );
  } catch (cause) {
    if (cause instanceof SocialOperationError) {
      return json({ message: cause.message }, { status: cause.status });
    }
    throw cause;
  }
};

export const POST: RequestHandler = async ({ locals, params, request }) => {
  const context = requireAuthenticatedRequest(locals);
  const id = validPostId(params.postId);
  const input = createSocialCommentSchema.safeParse(
    await readRequestInput(request),
  );
  if (!id.success || !input.success) {
    return json({ message: "Comentário inválido." }, { status: 400 });
  }
  try {
    return json(
      await createPostComment(
        getDatabase(),
        context.user.id,
        id.data,
        input.data.body,
        input.data.parentCommentId,
      ),
      { status: 201 },
    );
  } catch (cause) {
    if (cause instanceof SocialOperationError) {
      return json({ message: cause.message }, { status: cause.status });
    }
    throw cause;
  }
};
