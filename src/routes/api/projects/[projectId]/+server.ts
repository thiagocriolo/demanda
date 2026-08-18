import { error, json } from "@sveltejs/kit";
import { z } from "zod";
import type { RequestHandler } from "./$types";
import { requireAuthenticatedRequest } from "$lib/server/authorization/http";
import { readRequestInput } from "$lib/server/authorization/request-input";
import { getDatabase } from "$lib/server/db";
import { throwProjectHttpError } from "$lib/server/projects/http";
import {
  archiveWorkspaceProject,
  getWorkspaceProject,
  ProjectNotFoundError,
  updateWorkspaceProject,
} from "$lib/server/projects/service";
import { projectMutationSchema } from "$lib/server/projects/validation";

const identifierSchema = z.string().uuid();

function projectId(value: string | undefined): string {
  const parsed = identifierSchema.safeParse(value);
  if (!parsed.success) throwProjectHttpError(new ProjectNotFoundError());
  return parsed.data;
}

export const GET: RequestHandler = async ({ locals, params }) => {
  const context = requireAuthenticatedRequest(locals);
  try {
    return json(
      await getWorkspaceProject(
        getDatabase(),
        context,
        projectId(params.projectId),
      ),
    );
  } catch (cause) {
    throwProjectHttpError(cause);
  }
};

export const PUT: RequestHandler = async ({ locals, params, request }) => {
  const context = requireAuthenticatedRequest(locals);
  const parsed = projectMutationSchema.safeParse(
    await readRequestInput(request),
  );
  if (!parsed.success) error(400, "Dados do projeto invalidos.");

  try {
    return json(
      await updateWorkspaceProject(
        getDatabase(),
        context,
        projectId(params.projectId),
        parsed.data,
      ),
    );
  } catch (cause) {
    throwProjectHttpError(cause);
  }
};

export const DELETE: RequestHandler = async ({ locals, params }) => {
  const context = requireAuthenticatedRequest(locals);
  try {
    await archiveWorkspaceProject(
      getDatabase(),
      context,
      projectId(params.projectId),
    );
    return json({ archived: true as const });
  } catch (cause) {
    throwProjectHttpError(cause);
  }
};
