import { building } from "$app/environment";
import type { Handle } from "@sveltejs/kit";
import { clearSessionCookie, getSessionCookie } from "$lib/server/auth/cookies";
import { resolveAuthorizationContext } from "$lib/server/authorization/workspace-context";
import { getDatabase } from "$lib/server/db";
import { ensureRuntimeSchema } from "$lib/server/db/runtime-schema";

export const handle: Handle = async ({ event, resolve }) => {
  event.locals.auth = null;
  if (building) return resolve(event);

  const database = getDatabase();
  await ensureRuntimeSchema(database);
  const token = getSessionCookie(event.cookies);
  event.locals.auth = await resolveAuthorizationContext(database, token);
  if (token && !event.locals.auth) clearSessionCookie(event.cookies);

  return resolve(event);
};
