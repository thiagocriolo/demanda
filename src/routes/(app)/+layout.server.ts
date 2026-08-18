import { redirect } from "@sveltejs/kit";
import { getDatabase } from "$lib/server/db";
import { getSettingsSnapshot } from "$lib/server/settings/service";
import type { LayoutServerLoad } from "./$types";

export const load: LayoutServerLoad = async ({ locals, url }) => {
  if (!locals.auth) {
    const next = `${url.pathname}${url.search}`;
    redirect(303, `/login?next=${encodeURIComponent(next)}`);
  }

  const settingsSnapshot = await getSettingsSnapshot(
    getDatabase(),
    locals.auth,
  );

  return {
    authenticatedUser: locals.auth.user,
    authenticatedSession: locals.auth.session,
    activeWorkspace: locals.auth.activeWorkspace,
    settingsSnapshot,
  };
};
