import { error, json } from "@sveltejs/kit";
import { z } from "zod";
import type { RequestHandler } from "./$types";
import { requireAuthenticatedRequest } from "$lib/server/authorization/http";
import { readRequestInput } from "$lib/server/authorization/request-input";
import { getDatabase } from "$lib/server/db";
import { throwToolHttpError } from "$lib/server/tools/http";
import {
  ToolUseNotFoundError,
  updateWorkspaceToolUse,
} from "$lib/server/tools/service";
import { toolUseUpdateSchema } from "$lib/server/tools/validation";

const identifierSchema = z.string().uuid();
function useId(value: string | undefined): string {
  const parsed = identifierSchema.safeParse(value);
  if (!parsed.success) throwToolHttpError(new ToolUseNotFoundError());
  return parsed.data;
}

export const PUT: RequestHandler = async ({ locals, params, request }) => {
  const context = requireAuthenticatedRequest(locals);
  const parsed = toolUseUpdateSchema.safeParse(await readRequestInput(request));
  if (!parsed.success) error(400, "Dados do Uso inválidos.");
  try {
    return json(
      await updateWorkspaceToolUse(
        getDatabase(),
        context,
        useId(params.useId),
        parsed.data,
      ),
    );
  } catch (cause) {
    throwToolHttpError(cause);
  }
};
