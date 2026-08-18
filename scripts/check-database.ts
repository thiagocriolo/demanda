import "dotenv/config";
import { parseServerEnvironment } from "../src/lib/server/config/env-schema";
import { createDatabasePool } from "../src/lib/server/db/pool";

async function main(): Promise<void> {
  const environment = parseServerEnvironment(process.env);
  const pool = createDatabasePool(environment);
  const startedAt = performance.now();

  try {
    await pool.query("select 1");
    const latency = Math.round(performance.now() - startedAt);
    console.log(`PostgreSQL acessível (${latency} ms).`);
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Erro desconhecido";
  console.error(`[database] Falha no diagnóstico: ${message}`);
  process.exitCode = 1;
});
