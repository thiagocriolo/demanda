import "dotenv/config";
import { createConnection } from "mysql2/promise";

function mysqlUrlFromEnvironment(): string {
  const value = process.env.MYSQL_URL;
  if (!value) throw new Error("MYSQL_URL não configurada.");

  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error("MYSQL_URL deve ser uma URL MySQL válida.");
  }

  if (parsed.protocol !== "mysql:" || !parsed.hostname || !parsed.pathname || parsed.pathname === "/") {
    throw new Error("MYSQL_URL deve informar protocolo mysql, host e banco.");
  }

  return value;
}

async function main(): Promise<void> {
  const startedAt = performance.now();
  const connection = await createConnection(mysqlUrlFromEnvironment());

  try {
    const [rows] = await connection.query("SELECT DATABASE() AS database_name, VERSION() AS version");
    const latency = Math.round(performance.now() - startedAt);
    const result = rows as Array<{ database_name: string | null; version: string }>;
    const database = result[0]?.database_name;
    if (!database) throw new Error("Conectou ao MySQL sem selecionar um banco.");
    console.log(`MySQL acessível (${latency} ms; banco ${database}; versão ${result[0]?.version}).`);
  } finally {
    await connection.end();
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Erro desconhecido";
  console.error(`[mysql] Falha no diagnóstico: ${message}`);
  process.exitCode = 1;
});
