import { env } from "$env/dynamic/private";
import { parseServerEnvironment, type ServerEnvironment } from "./env-schema";

let cachedEnvironment: ServerEnvironment | undefined;

/** Faz a validação sob demanda para que build e páginas públicas não abram DB. */
export function getServerEnvironment(): ServerEnvironment {
  cachedEnvironment ??= parseServerEnvironment(env);
  return cachedEnvironment;
}
