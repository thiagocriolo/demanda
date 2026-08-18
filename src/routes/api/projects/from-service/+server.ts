import { error, json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { requireAuthenticatedRequest } from "$lib/server/authorization/http";
import { readRequestInput } from "$lib/server/authorization/request-input";
import { getDatabase } from "$lib/server/db";
import { throwProjectHttpError } from "$lib/server/projects/http";
import { createWorkspaceProjectFromService } from "$lib/server/projects/service";
import { projectFromServiceSchema } from "$lib/server/projects/validation";

export const POST: RequestHandler = async ({ locals, request }) => {
  const context = requireAuthenticatedRequest(locals);
  const parsed = projectFromServiceSchema.safeParse(
    await readRequestInput(request),
  );
  if (!parsed.success) error(400, "Dados do projeto por servico invalidos.");

  try {
    return json(
      await createWorkspaceProjectFromService(
        getDatabase(),
        context,
        parsed.data,
      ),
      { status: 201 },
    );
  } catch (cause) {
    throwProjectHttpError(cause);
  }
};
