import { error, json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { requireAuthenticatedRequest } from "$lib/server/authorization/http";
import { readRequestInput } from "$lib/server/authorization/request-input";
import { getDatabase } from "$lib/server/db";
import { throwProjectHttpError } from "$lib/server/projects/http";
import {
  ProjectNotFoundError,
  setWorkspaceProjectActive,
} from "$lib/server/projects/service";
import { projectActivationSchema } from "$lib/server/projects/validation";
import { z } from "zod";

const identifierSchema = z.string().uuid();

export const PUT: RequestHandler = async ({ locals, params, request }) => {
  const context = requireAuthenticatedRequest(locals);
  const id = identifierSchema.safeParse(params.projectId);
  const input = projectActivationSchema.safeParse(
    await readRequestInput(request),
  );
  if (!id.success) throwProjectHttpError(new ProjectNotFoundError());
  if (!input.success) error(400, "Estado de visibilidade do projeto inválido.");

  try {
    return json(
      await setWorkspaceProjectActive(
        getDatabase(),
        context,
        id.data,
        input.data.isActive,
      ),
    );
  } catch (cause) {
    throwProjectHttpError(cause);
  }
};
