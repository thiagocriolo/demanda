import { error, json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { requireAuthenticatedRequest } from "$lib/server/authorization/http";
import { readRequestInput } from "$lib/server/authorization/request-input";
import { getDatabase } from "$lib/server/db";
import { throwContactHttpError } from "$lib/server/contacts/http";
import {
  createWorkspaceContact,
  listWorkspaceContacts,
} from "$lib/server/contacts/service";
import {
  contactListQuerySchema,
  contactMutationSchema,
} from "$lib/server/contacts/validation";

function logContactFailure(operation: "list" | "create", cause: unknown): void {
  const details =
    cause instanceof Error
      ? { message: cause.message, cause: cause.cause }
      : { cause };
  console.error(`[contacts:${operation}] failed`, details);
}

export const GET: RequestHandler = async ({ locals, url }) => {
  const context = requireAuthenticatedRequest(locals);
  const parsed = contactListQuerySchema.safeParse(
    Object.fromEntries(url.searchParams),
  );
  if (!parsed.success) error(400, "Filtros de contatos inválidos.");

  try {
    return json(
      await listWorkspaceContacts(getDatabase(), context, parsed.data),
    );
  } catch (cause) {
    logContactFailure("list", cause);
    throwContactHttpError(cause);
  }
};

export const POST: RequestHandler = async ({ locals, request }) => {
  const context = requireAuthenticatedRequest(locals);
  const parsed = contactMutationSchema.safeParse(
    await readRequestInput(request),
  );
  if (!parsed.success) error(400, "Dados do contato inválidos.");

  try {
    const contact = await createWorkspaceContact(
      getDatabase(),
      context,
      parsed.data,
    );
    return json(contact, { status: 201 });
  } catch (cause) {
    logContactFailure("create", cause);
    throwContactHttpError(cause);
  }
};
