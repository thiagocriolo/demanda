/**
 * Carga local compatível com MySQL.
 *
 * A versão PostgreSQL gerava um cenário grande de demonstração. Como a base
 * foi reiniciada sem migração de dados, este comando seguro e idempotente
 * cria as contas locais necessárias para testar o sistema.
 */
import { seedMysqlLocalUsers } from "./seed-mysql-local-users";

seedMysqlLocalUsers().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
