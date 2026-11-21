import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { checkDatabaseHealth } from "$lib/server/db/health";

/** Dependency probe for load balancers and deployment checks. */
export const GET: RequestHandler = async () => {
  try {
    const database = await checkDatabaseHealth();
    return json({ ok: true, status: "ready", database });
  } catch {
    return json(
      {
        ok: false,
        status: "not_ready",
        message: "Banco de dados indisponível.",
      },
      { status: 503 },
    );
  }
};
