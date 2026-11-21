import { building } from "$app/environment";
import type { Handle } from "@sveltejs/kit";
import { clearSessionCookie, getSessionCookie } from "$lib/server/auth/cookies";
import { resolveAuthorizationContext } from "$lib/server/authorization/workspace-context";
import { getDatabase } from "$lib/server/db";
import { ensureRuntimeSchema } from "$lib/server/db/runtime-schema";

function withSecurityHeaders(response: Response): Response {
  response.headers.set("x-content-type-options", "nosniff");
  response.headers.set("x-frame-options", "SAMEORIGIN");
  response.headers.set("referrer-policy", "strict-origin-when-cross-origin");
  response.headers.set(
    "permissions-policy",
    "camera=(), geolocation=(), microphone=()",
  );
  response.headers.set("cross-origin-opener-policy", "same-origin");
  if (process.env.NODE_ENV === "production") {
    response.headers.set(
      "strict-transport-security",
      "max-age=31536000; includeSubDomains",
    );
  }
  return response;
}

export const handle: Handle = async ({ event, resolve }) => {
  event.locals.auth = null;
  if (building) return withSecurityHeaders(await resolve(event));

  // Liveness deliberately has no dependency on the database, migrations or a
  // user session, so an orchestrator can distinguish a dead process from a
  // temporarily unavailable dependency.
  if (
    event.url.pathname === "/health/live" ||
    event.url.pathname === "/health/ready"
  ) {
    return withSecurityHeaders(await resolve(event));
  }

  const database = getDatabase();
  await ensureRuntimeSchema(database);
  const token = getSessionCookie(event.cookies);
  event.locals.auth = await resolveAuthorizationContext(database, token);
  if (token && !event.locals.auth) clearSessionCookie(event.cookies);

  return withSecurityHeaders(await resolve(event));
};
