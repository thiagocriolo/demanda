import type { SQL } from "drizzle-orm";
import { MySqlDialect } from "drizzle-orm/mysql-core";
import { describe, expect, it, vi } from "vitest";
import { initializeEmptyDatabase } from "./bootstrap";
import snapshot from "./bootstrap-schema.json";
import type { Database } from "./database";

function fakeDatabase(initialTables: string[] = []) {
  const tables = new Set(initialTables);
  const foreignKeys = new Set<string>();
  const indexes = new Set<string>();
  const executed: string[] = [];
  let completed = false;
  let failOnForeignKey = false;
  const dialect = new MySqlDialect();
  const database = {
    transaction: vi.fn(async (run: (tx: unknown) => Promise<void>) =>
      run(database),
    ),
    async execute(query: SQL) {
      const { sql: text, params } = dialect.sqlToQuery(query);
      executed.push(text);
      if (text.includes("from information_schema.tables"))
        return [[...tables].map((name) => ({ name }))];
      if (text.startsWith("select completed"))
        return [[{ completed: Number(completed) }]];
      if (text.includes("select get_lock")) return [[{ acquired: 1 }]];
      if (text.includes("from information_schema.table_constraints")) {
        return [
          foreignKeys.has(`${params[0]}.${params[1]}`) ? [{ present: 1 }] : [],
        ];
      }
      if (text.includes("from information_schema.statistics")) {
        return [
          indexes.has(`${params[0]}.${params[1]}`) ? [{ present: 1 }] : [],
        ];
      }
      const create = /^CREATE TABLE IF NOT EXISTS `([^`]+)`/.exec(text);
      if (create) tables.add(create[1]);
      const foreignKey =
        /^ALTER TABLE `([^`]+)` ADD CONSTRAINT `([^`]+)` FOREIGN KEY/.exec(
          text,
        );
      if (foreignKey) {
        if (failOnForeignKey) {
          failOnForeignKey = false;
          throw new Error("Connection interrupted");
        }
        const key = `${foreignKey[1]}.${foreignKey[2]}`;
        if (foreignKeys.has(key)) throw new Error("Duplicate foreign key");
        foreignKeys.add(key);
      }
      const index = /^CREATE (?:UNIQUE )?INDEX `([^`]+)` ON `([^`]+)`/.exec(
        text,
      );
      if (index) {
        const key = `${index[2]}.${index[1]}`;
        if (indexes.has(key)) throw new Error("Duplicate index");
        indexes.add(key);
      }
      if (text.startsWith("UPDATE `__demanda_schema_bootstrap`"))
        completed = true;
      return [[]];
    },
  };
  return {
    database: database as unknown as Database,
    executed,
    tables,
    interrupt: () => {
      failOnForeignKey = true;
    },
    transaction: database.transaction,
  };
}

describe("initializeEmptyDatabase", () => {
  it("creates all base tables before foreign keys and records the migration baseline", async () => {
    const { database, executed, tables } = fakeDatabase();
    await initializeEmptyDatabase(database);
    for (const table of [
      "users",
      "workspaces",
      "workspace_members",
      "auth_sessions",
      "projects",
      "deliveries",
      "service_packages",
    ]) {
      expect(tables.has(table)).toBe(true);
    }
    const lastCreate = executed.findLastIndex((text) =>
      text.startsWith("CREATE TABLE IF NOT EXISTS `"),
    );
    const firstForeignKey = executed.findIndex((text) =>
      text.startsWith("ALTER TABLE"),
    );
    expect(lastCreate).toBeLessThan(firstForeignKey);
    expect(
      executed.filter((text) =>
        text.startsWith("insert into __drizzle_migrations"),
      ),
    ).toHaveLength(snapshot.migrations.length);
    expect(
      executed.some((text) => /^\s*(DROP|DELETE|TRUNCATE)\b/.test(text)),
    ).toBe(false);
    const firstRunCount = executed.length;
    await initializeEmptyDatabase(database);
    expect(executed.slice(firstRunCount)).toHaveLength(2);
  });

  it("leaves an existing application database untouched", async () => {
    const { database, executed, transaction } = fakeDatabase([
      "users",
      "workspaces",
    ]);
    await initializeEmptyDatabase(database);
    expect(executed).toHaveLength(1);
    expect(transaction).not.toHaveBeenCalled();
  });

  it("refuses an unknown partial database without changing it", async () => {
    const { database, executed } = fakeDatabase(["service_packages"]);
    await expect(initializeEmptyDatabase(database)).rejects.toThrow(
      "banco vazio",
    );
    expect(executed).toHaveLength(1);
  });

  it("resumes an interrupted installation and releases the connection lock", async () => {
    const { database, executed, interrupt } = fakeDatabase();
    interrupt();
    await expect(initializeEmptyDatabase(database)).rejects.toThrow(
      "Connection interrupted",
    );
    expect(executed.at(-1)).toContain("release_lock");
    await initializeEmptyDatabase(database);
    expect(
      executed.some((text) =>
        text.startsWith("UPDATE `__demanda_schema_bootstrap`"),
      ),
    ).toBe(true);
  });
});
