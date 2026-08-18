import { error, json } from "@sveltejs/kit";
import { z } from "zod";
import type { RequestHandler } from "./$types";
import { requireAuthenticatedRequest } from "$lib/server/authorization/http";
import { getDatabase } from "$lib/server/db";
import { throwProjectHttpError } from "$lib/server/projects/http";
import { getWorkspaceProjectOptions } from "$lib/server/projects/service";

const projectOptionsQuerySchema = z
  .object({ workspaceId: z.string().uuid().optional() })
  .strict();

export const GET: RequestHandler = async ({ locals, url }) => {
  const context = requireAuthenticatedRequest(locals);
  const parsed = projectOptionsQuerySchema.safeParse(
    Object.fromEntries(url.searchParams),
  );
  if (!parsed.success) error(400, "Filtros de projetos invalidos.");

  try {
    return json(
      await getWorkspaceProjectOptions(
        getDatabase(),
        context,
        parsed.data.workspaceId,
      ),
    );
  } catch (cause) {
    throwProjectHttpError(cause);
  }
};
