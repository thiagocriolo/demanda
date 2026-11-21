import { redirect } from "@sveltejs/kit";
import type { PageLoad } from "./$types";

export const load: PageLoad = ({ params }) => {
  if (params.tab.toLocaleLowerCase("pt-BR") === "contratos") {
    redirect(307, "/contratos");
  }
};
