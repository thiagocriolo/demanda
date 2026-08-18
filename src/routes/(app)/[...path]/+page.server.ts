import { error } from "@sveltejs/kit";
import type { PageServerLoad } from "./$types";

const removedCrudRoutes = new Set([
  "pessoas",
  "negocios",
  "negócios",
  "projetos",
  "entregas",
]);

export const load: PageServerLoad = ({ params }) => {
  const normalizedPath = (params.path ?? "").toLocaleLowerCase("pt-BR");
  const rootSegment = normalizedPath.split("/")[0];
  if (normalizedPath === "social/ciclos") {
    error(404, "Página não encontrada");
  }
  if (removedCrudRoutes.has(rootSegment)) {
    error(404, "Página não encontrada");
  }
  return {};
};
