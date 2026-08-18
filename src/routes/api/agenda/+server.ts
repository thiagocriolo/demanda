import { error, json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { requireAuthenticatedRequest } from "$lib/server/authorization/http";
import { readRequestInput } from "$lib/server/authorization/request-input";
import { getDatabase } from "$lib/server/db";
import { throwAgendaHttpError } from "$lib/server/agenda/http";
import {
  getWorkspaceAgenda,
  moveWorkspaceAgenda,
} from "$lib/server/agenda/service";
import {
  agendaMoveSchema,
  agendaQuerySchema,
} from "$lib/server/agenda/validation";

export const GET: RequestHandler = async ({ locals, url }) => {
  const context = requireAuthenticatedRequest(locals);
  const parsed = agendaQuerySchema.safeParse(
    Object.fromEntries(url.searchParams),
  );
  if (!parsed.success) error(400, "Filtros da Agenda invalidos.");
  try {
    return json(await getWorkspaceAgenda(getDatabase(), context, parsed.data));
  } catch (cause) {
    throwAgendaHttpError(cause);
  }
};

export const PUT: RequestHandler = async ({ locals, request }) => {
  const context = requireAuthenticatedRequest(locals);
  const parsed = agendaMoveSchema.safeParse(await readRequestInput(request));
  if (!parsed.success) error(400, "Movimento da Agenda invalido.");
  try {
    return json(await moveWorkspaceAgenda(getDatabase(), context, parsed.data));
  } catch (cause) {
    throwAgendaHttpError(cause);
  }
};
