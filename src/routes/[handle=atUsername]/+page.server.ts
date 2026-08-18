import { error } from "@sveltejs/kit";
import type { PageServerLoad } from "./$types";
import { getDatabase } from "$lib/server/db";
import { getPublicUserPage } from "$lib/server/social/public-profile";

export const load: PageServerLoad = async ({ locals, params }) => {
  const page = await getPublicUserPage(
    getDatabase(),
    params.handle.slice(1),
    locals.auth?.user.id,
  );
  if (!page) error(404, "Usuário não encontrado.");

  return page;
};
