import { createPool, type Pool } from "mysql2/promise";
import type { ServerEnvironment } from "../config/env-schema";

export function createDatabasePool(environment: ServerEnvironment): Pool {
  const pool = createPool({
    uri: environment.DATABASE_URL,
    connectionLimit: environment.DATABASE_POOL_MAX,
    connectTimeout: environment.DATABASE_CONNECT_TIMEOUT_MS,
    idleTimeout: environment.DATABASE_IDLE_TIMEOUT_MS,
    enableKeepAlive: true,
  });


  return pool;
}
