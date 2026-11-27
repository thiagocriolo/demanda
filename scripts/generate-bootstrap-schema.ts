import { writeFile } from "node:fs/promises";
import {
  generateMySQLDrizzleJson,
  generateMySQLMigration,
} from "drizzle-kit/api";
import { readMigrationFiles } from "drizzle-orm/migrator";
import * as schema from "../src/lib/server/db/schema";

// This snapshot is bundled with the server: managed hosting starts build/index.js
// directly and does not necessarily ship the migration CLI or SQL directory.
const empty = await generateMySQLDrizzleJson({});
const current = await generateMySQLDrizzleJson(schema);
const statements = (await generateMySQLMigration(empty, current)).map(
  (statement) =>
    statement.startsWith("CREATE TABLE ")
      ? statement
          .trim()
          .replace(
            /;$/,
            " ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;",
          )
      : statement,
);
const migrations = readMigrationFiles({
  migrationsFolder: "drizzle-mysql-v4",
}).map(({ hash, folderMillis }) => ({ hash, createdAt: folderMillis }));
for (const statement of statements) {
  for (const [, name] of statement.matchAll(
    /(?:CONSTRAINT|INDEX) `([^`]+)`/g,
  )) {
    if (name.length > 64)
      throw new Error(`MySQL identifier exceeds 64 characters: ${name}`);
  }
}
await writeFile(
  "src/lib/server/db/bootstrap-schema.json",
  JSON.stringify({ statements, migrations }, null, 2) + "\n",
);
console.log(`Bootstrap schema generated (${statements.length} statements).`);
