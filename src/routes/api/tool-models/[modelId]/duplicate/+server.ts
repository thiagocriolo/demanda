import { z } from "zod";
import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { requireAuthenticatedRequest } from "$lib/server/authorization/http";
import { getDatabase } from "$lib/server/db";
import { throwToolHttpError } from "$lib/server/tools/http";
import {
  duplicateWorkspaceToolModel,
  ToolModelNotFoundError,
} from "$lib/server/tools/service";

const identifierSchema = z.string().uuid();

export const POST: RequestHandler = async ({ locals, params }) => {
  const context = requireAuthenticatedRequest(locals);
  const parsed = identifierSchema.safeParse(params.modelId);
  if (!parsed.success) throwToolHttpError(new ToolModelNotFoundError());
  try {
    return json(
      await duplicateWorkspaceToolModel(getDatabase(), context, parsed.data),
      { status: 201 },
    );
  } catch (cause) {
    throwToolHttpError(cause);
  }
};
