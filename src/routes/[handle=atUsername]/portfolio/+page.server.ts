import { error } from "@sveltejs/kit";
import type { PageServerLoad } from "./$types";
import { getDatabase } from "$lib/server/db";
import { getPublicUserPortfolio } from "$lib/server/social/public-profile";

export const load: PageServerLoad = async ({ locals, params }) => {
  const portfolio = await getPublicUserPortfolio(
    getDatabase(),
    params.handle.slice(1),
    locals.auth?.user.id,
  );
  if (!portfolio) error(404, "Usuário não encontrado.");

  return portfolio;
};
