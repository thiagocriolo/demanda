import "dotenv/config";
import { eq } from "drizzle-orm";
import { AccountAlreadyExistsError, registerAccount } from "../src/lib/server/auth/service";
import { parseServerEnvironment } from "../src/lib/server/config/env-schema";
import { createDatabase } from "../src/lib/server/db/database";
import { createDatabasePool } from "../src/lib/server/db/pool";
import { users } from "../src/lib/server/db/schema";

const LOCAL_ACCOUNTS = ["teste1", "teste2", "teste3"] as const;
const LOCAL_PASSWORD = "Demanda123";

export async function seedMysqlLocalUsers(): Promise<void> {
  if (process.env.NODE_ENV === "production") {
    throw new Error("O seed local não pode rodar em produção.");
  }

  const environment = parseServerEnvironment(process.env);
  const pool = createDatabasePool(environment);
  const database = createDatabase(pool);

  try {
    let created = 0;
    for (const username of LOCAL_ACCOUNTS) {
      const [existing] = await database
        .select({ id: users.id })
        .from(users)
        .where(eq(users.username, username))
        .limit(1);
      if (existing) continue;

      try {
        await registerAccount(database, {
          username,
          email: `${username}@demanda.local`,
          password: LOCAL_PASSWORD,
          remembered: false,
          userAgent: "demanda-mysql-local-seed",
        });
        created += 1;
      } catch (error) {
        if (!(error instanceof AccountAlreadyExistsError)) throw error;
      }
    }

    console.log(
      `Seed MySQL concluído: ${created} conta(s) criada(s); contas locais: ${LOCAL_ACCOUNTS.join(", ")}.`,
    );
  } finally {
    await pool.end();
  }
}

if (process.argv[1]?.includes("seed-mysql-local-users")) {
  seedMysqlLocalUsers().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : "Erro desconhecido";
    console.error(`[seed:mysql] ${message}`);
    process.exitCode = 1;
  });
}
