import { error, json } from "@sveltejs/kit";
import { z } from "zod";
import type { RequestHandler } from "./$types";
import { requireAuthenticatedRequest } from "$lib/server/authorization/http";
import { readRequestInput } from "$lib/server/authorization/request-input";
import { getDatabase } from "$lib/server/db";
import { throwToolHttpError } from "$lib/server/tools/http";
import {
  listWorkspaceToolResponses,
  submitWorkspaceToolResponse,
  ToolUseNotFoundError,
} from "$lib/server/tools/service";
import { toolResponseInputSchema } from "$lib/server/tools/validation";

const identifierSchema = z.string().uuid();
function useId(value: string | undefined): string {
  const parsed = identifierSchema.safeParse(value);
  if (!parsed.success) throwToolHttpError(new ToolUseNotFoundError());
  return parsed.data;
}

export const GET: RequestHandler = async ({ locals, params }) => {
  const context = requireAuthenticatedRequest(locals);
  try {
    return json(
      await listWorkspaceToolResponses(
        getDatabase(),
        context,
        useId(params.useId),
      ),
    );
  } catch (cause) {
    throwToolHttpError(cause);
  }
};

export const POST: RequestHandler = async ({ locals, params, request }) => {
  const context = requireAuthenticatedRequest(locals);
  const parsed = toolResponseInputSchema.safeParse(
    await readRequestInput(request),
  );
  if (!parsed.success) error(400, "Resposta inválida.");
  try {
    return json(
      await submitWorkspaceToolResponse(
        getDatabase(),
        context,
        useId(params.useId),
        parsed.data.payload,
      ),
      { status: 201 },
    );
  } catch (cause) {
    throwToolHttpError(cause);
  }
};
