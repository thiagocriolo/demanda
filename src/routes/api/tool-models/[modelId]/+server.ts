import { error, json } from "@sveltejs/kit";
import { z } from "zod";
import type { RequestHandler } from "./$types";
import { requireAuthenticatedRequest } from "$lib/server/authorization/http";
import { readRequestInput } from "$lib/server/authorization/request-input";
import { getDatabase } from "$lib/server/db";
import { throwToolHttpError } from "$lib/server/tools/http";
import {
  archiveWorkspaceToolModel,
  ToolModelNotFoundError,
  updateWorkspaceToolModel,
} from "$lib/server/tools/service";
import {
  toolArchiveQuerySchema,
  toolModelUpdateSchema,
} from "$lib/server/tools/validation";

const identifierSchema = z.string().uuid();
function modelId(value: string | undefined): string {
  const parsed = identifierSchema.safeParse(value);
  if (!parsed.success) throwToolHttpError(new ToolModelNotFoundError());
  return parsed.data;
}

export const PUT: RequestHandler = async ({ locals, params, request }) => {
  const context = requireAuthenticatedRequest(locals);
  const parsed = toolModelUpdateSchema.safeParse(
    await readRequestInput(request),
  );
  if (!parsed.success) error(400, "Dados do Modelo inválidos.");
  try {
    return json(
      await updateWorkspaceToolModel(
        getDatabase(),
        context,
        modelId(params.modelId),
        parsed.data,
      ),
    );
  } catch (cause) {
    throwToolHttpError(cause);
  }
};

export const DELETE: RequestHandler = async ({ locals, params, url }) => {
  const context = requireAuthenticatedRequest(locals);
  const parsed = toolArchiveQuerySchema.safeParse(
    Object.fromEntries(url.searchParams),
  );
  if (!parsed.success) error(400, "Versão do Modelo inválida.");
  try {
    return json(
      await archiveWorkspaceToolModel(
        getDatabase(),
        context,
        modelId(params.modelId),
        parsed.data.version,
      ),
    );
  } catch (cause) {
    throwToolHttpError(cause);
  }
};
