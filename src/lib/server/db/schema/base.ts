import { randomUUID } from "node:crypto";
import {
  char,
  mysqlTable,
  timestamp as mysqlTimestamp,
} from "drizzle-orm/mysql-core";

/**
 * MySQL uses the selected database as its schema. Keeping this small facade
 * lets table modules retain their domain-oriented declarations without
 * prefixing every table name with a PostgreSQL-only schema.
 */
const mysqlTableWithoutPostgresOnlyChecks = ((name: any, columns: any, extraConfig: any) =>
  mysqlTable(name, columns, extraConfig
    ? (table: any) => {
        const values = extraConfig(table);
        return Array.isArray(values) ? values.filter(Boolean) : values;
      }
    : undefined)) as typeof mysqlTable;

export const applicationSchema = {
  table: mysqlTableWithoutPostgresOnlyChecks,
} as const;

/** PostgreSQL validation checks are enforced by the application during the MySQL transition. */
export const check: (..._args: unknown[]) => any = () => undefined;

export const uuid = (name: string) => {
  const column = char(name, { length: 36 });
  return Object.assign(column, {
    defaultRandom: () => column.$defaultFn(() => randomUUID()),
  });
};

export const timestamp = (
  name: string,
  options?: { precision?: 0 | 1 | 2 | 3 | 4 | 5 | 6; withTimezone?: boolean },
) => mysqlTimestamp(name, { fsp: options?.precision });

export const createdAt = () =>
  timestamp("created_at", { withTimezone: true, precision: 3 })
    .$defaultFn(() => new Date())
    .notNull();

export const updatedAt = () =>
  timestamp("updated_at", { withTimezone: true, precision: 3 })
    .$defaultFn(() => new Date())
    .notNull();
