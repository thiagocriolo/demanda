import type { PageServerLoad } from "./$types";
import { requireAuthenticatedPageRequest } from "$lib/server/authorization/http";
import { listActiveSessions } from "$lib/server/auth/service";
import { getDatabase } from "$lib/server/db";

export { actions } from "../+page.server";

export const load: PageServerLoad = async ({ locals, url }) => {
  const principal = requireAuthenticatedPageRequest(
    locals,
    `${url.pathname}${url.search}`,
  );
  const sessions = await listActiveSessions(getDatabase(), principal.user.id);
  return {
    security: {
      currentSessionId: principal.session.id,
      sessions,
    },
  };
};
