import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { requireAuthenticatedRequest } from "$lib/server/authorization/http";
import { readRequestInput } from "$lib/server/authorization/request-input";
import { getDatabase } from "$lib/server/db";
import { throwSettingsHttpError } from "$lib/server/settings/http";
import {
  getWorkspaceSettings,
  updateWorkspaceSettings,
} from "$lib/server/settings/service";
import { workspaceSettingsUpdateSchema } from "$lib/server/settings/validation";

export const GET: RequestHandler = async ({ locals }) => {
  const context = requireAuthenticatedRequest(locals);
  try {
    return json(await getWorkspaceSettings(getDatabase(), context));
  } catch (cause) {
    throwSettingsHttpError(cause);
  }
};

export const PUT: RequestHandler = async ({ locals, request }) => {
  const context = requireAuthenticatedRequest(locals);
  const parsed = workspaceSettingsUpdateSchema.safeParse(
    await readRequestInput(request),
  );
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const location = issue?.path.length ? ` em ${issue.path.join(".")}` : "";
    return new Response(
      JSON.stringify({
        message: `Configurações do workspace inválidas${location}: ${issue?.message ?? "revise os dados enviados"}.`,
      }),
      { status: 400, headers: { "content-type": "application/json" } },
    );
  }
  try {
    return json(
      await updateWorkspaceSettings(getDatabase(), context, parsed.data),
    );
  } catch (cause) {
    throwSettingsHttpError(cause);
  }
};
