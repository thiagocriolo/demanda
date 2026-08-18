import { redirect } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { clearSessionCookie } from "$lib/server/auth/cookies";
import { revokeAllSessions } from "$lib/server/auth/service";
import { getDatabase } from "$lib/server/db";

export const POST: RequestHandler = async ({ cookies, locals }) => {
  if (locals.auth) {
    await revokeAllSessions(getDatabase(), locals.auth.user.id);
  }
  clearSessionCookie(cookies);
  redirect(303, "/login");
};
