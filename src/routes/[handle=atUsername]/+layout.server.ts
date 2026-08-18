import type { LayoutServerLoad } from "./$types";
import { getDatabase } from "$lib/server/db";
import { getSettingsSnapshot } from "$lib/server/settings/service";

export const load: LayoutServerLoad = async ({ locals, setHeaders }) => {
  // A resposta muda conforme a sessão; ela não pode ser compartilhada por cache.
  setHeaders({ "cache-control": "private, no-store" });

  if (!locals.auth) return { shellData: null };

  return {
    shellData: {
      authenticatedUser: locals.auth.user,
      authenticatedSession: locals.auth.session,
      activeWorkspace: locals.auth.activeWorkspace,
      settingsSnapshot: await getSettingsSnapshot(getDatabase(), locals.auth),
    },
  };
};
