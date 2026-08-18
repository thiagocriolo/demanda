import { json } from "@sveltejs/kit";
import { z } from "zod";
import type { RequestHandler } from "./$types";
import { requireAuthenticatedRequest } from "$lib/server/authorization/http";
import { readRequestInput } from "$lib/server/authorization/request-input";
import { getDatabase } from "$lib/server/db";
import {
  deleteSocialPost,
  getSocialPost,
  SocialOperationError,
  updateSocialPostBody,
} from "$lib/server/social/service";
import { updateSocialPostSchema } from "$lib/server/social/validation";

function postId(value: string) {
  return z.string().uuid().safeParse(value);
}

function operationError(cause: unknown) {
  if (cause instanceof SocialOperationError) {
    return json({ message: cause.message }, { status: cause.status });
  }
  throw cause;
}

export const GET: RequestHandler = async ({ locals, params }) => {
  const context = requireAuthenticatedRequest(locals);
  const id = postId(params.postId);
  if (!id.success) {
    return json({ message: "Publicação inválida." }, { status: 400 });
  }
  try {
    return json(await getSocialPost(getDatabase(), context.user.id, id.data));
  } catch (cause) {
    return operationError(cause);
  }
};

export const PATCH: RequestHandler = async ({ locals, params, request }) => {
  const context = requireAuthenticatedRequest(locals);
  const id = postId(params.postId);
  const input = updateSocialPostSchema.safeParse(
    await readRequestInput(request),
  );
  if (!id.success || !input.success) {
    return json({ message: "Texto inválido." }, { status: 400 });
  }
  try {
    return json(
      await updateSocialPostBody(
        getDatabase(),
        context.user.id,
        id.data,
        input.data.body,
      ),
    );
  } catch (cause) {
    return operationError(cause);
  }
};

export const DELETE: RequestHandler = async ({ locals, params }) => {
  const context = requireAuthenticatedRequest(locals);
  const id = postId(params.postId);
  if (!id.success) {
    return json({ message: "Publicação inválida." }, { status: 400 });
  }
  try {
    await deleteSocialPost(getDatabase(), context.user.id, id.data);
    return json({ deleted: true });
  } catch (cause) {
    return operationError(cause);
  }
};
