import { error, json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { requireAuthenticatedRequest } from "$lib/server/authorization/http";
import { readRequestInput } from "$lib/server/authorization/request-input";
import { getDatabase } from "$lib/server/db";
import { throwProjectHttpError } from "$lib/server/projects/http";
import {
  createWorkspaceService,
  listWorkspaceServices,
} from "$lib/server/projects/service";
import {
  serviceListQuerySchema,
  serviceMutationSchema,
} from "$lib/server/projects/validation";

export const GET: RequestHandler = async ({ locals, url }) => {
  const context = requireAuthenticatedRequest(locals);
  const parsed = serviceListQuerySchema.safeParse(
    Object.fromEntries(url.searchParams),
  );
  if (!parsed.success) error(400, "Filtros de servicos invalidos.");

  try {
    return json(
      await listWorkspaceServices(getDatabase(), context, parsed.data),
    );
  } catch (cause) {
    throwProjectHttpError(cause);
  }
};

export const POST: RequestHandler = async ({ locals, request }) => {
  const context = requireAuthenticatedRequest(locals);
  const parsed = serviceMutationSchema.safeParse(
    await readRequestInput(request),
  );
  if (!parsed.success) error(400, "Dados do servico invalidos.");

  try {
    return json(
      await createWorkspaceService(getDatabase(), context, parsed.data),
      { status: 201 },
    );
  } catch (cause) {
    throwProjectHttpError(cause);
  }
};
