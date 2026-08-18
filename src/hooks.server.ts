import { building } from "$app/environment";
import type { Handle } from "@sveltejs/kit";
import { clearSessionCookie, getSessionCookie } from "$lib/server/auth/cookies";
import { resolveAuthorizationContext } from "$lib/server/authorization/workspace-context";
import { getDatabase } from "$lib/server/db";

export const handle: Handle = async ({ event, resolve }) => {
  event.locals.auth = null;
  if (building) return resolve(event);

  const token = getSessionCookie(event.cookies);
  event.locals.auth = await resolveAuthorizationContext(getDatabase(), token);
  if (token && !event.locals.auth) clearSessionCookie(event.cookies);

  return resolve(event);
};
