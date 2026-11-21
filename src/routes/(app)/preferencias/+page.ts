import { redirect } from "@sveltejs/kit";
import type { PageLoad } from "./$types";

/** Rota legada: a estrutura canônica de configurações vive em /config. */
export const load: PageLoad = () => {
  redirect(307, "/config/preferencias");
};
