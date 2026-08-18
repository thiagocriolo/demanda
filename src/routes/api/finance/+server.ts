import { error, json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { requireAuthenticatedRequest } from "$lib/server/authorization/http";
import { readRequestInput } from "$lib/server/authorization/request-input";
import { getDatabase } from "$lib/server/db";
import { throwFinanceHttpError } from "$lib/server/finance/http";
import {
  createFinancialEntry,
  getFinancialSnapshot,
} from "$lib/server/finance/service";
import {
  financialCreateSchema,
  financialQuerySchema,
} from "$lib/server/finance/validation";

export const GET: RequestHandler = async ({ locals, url }) => {
  const context = requireAuthenticatedRequest(locals);
  const parsed = financialQuerySchema.safeParse({
    workspaceId: url.searchParams.get("workspaceId") ?? undefined,
    from: url.searchParams.get("from") ?? undefined,
    to: url.searchParams.get("to") ?? undefined,
    type: url.searchParams.get("type") ?? undefined,
    basis: url.searchParams.get("basis") ?? undefined,
  });
  if (!parsed.success) error(400, "Filtros financeiros inválidos.");
  try {
    return json(
      await getFinancialSnapshot(getDatabase(), context, parsed.data),
    );
  } catch (cause) {
    throwFinanceHttpError(cause);
  }
};

export const POST: RequestHandler = async ({ locals, request }) => {
  const context = requireAuthenticatedRequest(locals);
  const parsed = financialCreateSchema.safeParse(
    await readRequestInput(request),
  );
  if (!parsed.success) error(400, "Lançamento financeiro inválido.");
  try {
    return json(
      await createFinancialEntry(getDatabase(), context, parsed.data),
      {
        status: 201,
      },
    );
  } catch (cause) {
    throwFinanceHttpError(cause);
  }
};
