import { redirect } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { clearSessionCookie, getSessionCookie } from "$lib/server/auth/cookies";
import { revokeSessionByToken } from "$lib/server/auth/service";
import { getDatabase } from "$lib/server/db";

export const POST: RequestHandler = async ({ cookies }) => {
  await revokeSessionByToken(getDatabase(), getSessionCookie(cookies));
  clearSessionCookie(cookies);
  redirect(303, "/login");
};
