import { redirect } from "@sveltejs/kit";

/** A raiz sempre direciona para a primeira área útil da aplicação. */
export function load(): never {
  redirect(307, "/dashboard");
}
