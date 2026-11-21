import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";

/** Process-only probe. It must stay independent of the database. */
export const GET: RequestHandler = async () =>
  json({ ok: true, status: "live" });
