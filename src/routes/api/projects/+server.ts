import { error, json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { requireAuthenticatedRequest } from "$lib/server/authorization/http";
import { readRequestInput } from "$lib/server/authorization/request-input";
import { getDatabase } from "$lib/server/db";
import { throwProjectHttpError } from "$lib/server/projects/http";
import {
  createWorkspaceProject,
  listWorkspaceProjects,
} from "$lib/server/projects/service";
import {
  projectListQuerySchema,
  projectMutationSchema,
} from "$lib/server/projects/validation";

export const GET: RequestHandler = async ({ locals, url }) => {
  const context = requireAuthenticatedRequest(locals);
  const parsed = projectListQuerySchema.safeParse(
    Object.fromEntries(url.searchParams),
  );
  if (!parsed.success) error(400, "Filtros de projetos invalidos.");

  try {
    return json(
      await listWorkspaceProjects(getDatabase(), context, parsed.data),
    );
  } catch (cause) {
    throwProjectHttpError(cause);
  }
};

export const POST: RequestHandler = async ({ locals, request }) => {
  const context = requireAuthenticatedRequest(locals);
  const parsed = projectMutationSchema.safeParse(
    await readRequestInput(request),
  );
  if (!parsed.success) error(400, "Dados do projeto invalidos.");

  try {
    return json(
      await createWorkspaceProject(getDatabase(), context, parsed.data),
      { status: 201 },
    );
  } catch (cause) {
    throwProjectHttpError(cause);
  }
};
