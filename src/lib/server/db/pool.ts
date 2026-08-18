import { Pool } from "pg";
import type { ServerEnvironment } from "../config/env-schema";

export function createDatabasePool(environment: ServerEnvironment): Pool {
  const pool = new Pool({
    connectionString: environment.DATABASE_URL,
    max: environment.DATABASE_POOL_MAX,
    connectionTimeoutMillis: environment.DATABASE_CONNECT_TIMEOUT_MS,
    idleTimeoutMillis: environment.DATABASE_IDLE_TIMEOUT_MS,
    application_name: "demanda",
    keepAlive: true,
  });

  pool.on("error", (error) => {
    console.error("[database] Erro inesperado em conexão ociosa:", error);
  });

  return pool;
}
