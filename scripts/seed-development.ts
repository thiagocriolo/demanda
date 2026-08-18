import "dotenv/config";
import { parseServerEnvironment } from "../src/lib/server/config/env-schema";
import { createDatabase } from "../src/lib/server/db/database";
import { createDatabasePool } from "../src/lib/server/db/pool";
import { seedDevelopmentDatabase } from "../src/lib/server/db/seeds/development";

async function main(): Promise<void> {
  if (process.env.NODE_ENV === "production") {
    throw new Error("O seed de desenvolvimento não pode rodar em produção.");
  }

  const environment = parseServerEnvironment(process.env);
  const pool = createDatabasePool(environment);

  try {
    await seedDevelopmentDatabase(createDatabase(pool));
    console.log("Seed de desenvolvimento aplicado.");
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Erro desconhecido";
  console.error(`[database] Falha ao aplicar seed: ${message}`);
  process.exitCode = 1;
});
