import { sql } from "drizzle-orm";
import { getDatabase } from ".";

export type DatabaseHealth = {
  ok: true;
  latencyMs: number;
};

export async function checkDatabaseHealth(): Promise<DatabaseHealth> {
  const startedAt = performance.now();
  await getDatabase().execute(sql`select 1`);
  return {
    ok: true,
    latencyMs: Math.round(performance.now() - startedAt),
  };
}
