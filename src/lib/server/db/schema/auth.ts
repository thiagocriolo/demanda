import { sql } from "drizzle-orm";
import {
  type AnyMySqlColumn,
  bigint,
  boolean,
  char,
  date,
  foreignKey,
  index,
  int as integer,
  json as jsonb,
  decimal as numeric,
  primaryKey,
  text,
  unique,
  uniqueIndex,
  varchar,
} from "drizzle-orm/mysql-core";
import { applicationSchema, check, createdAt, timestamp, updatedAt, uuid } from "./base";

import { users } from "./identity";
import { workspaces } from "./workspace";

export const authSessions = applicationSchema.table(
  "auth_sessions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    activeWorkspaceId: uuid("active_workspace_id").references(
      () => workspaces.id,
      { onDelete: "set null" },
    ),
    tokenHash: char("token_hash", { length: 64 }).notNull(),
    remembered: boolean("remembered").default(false).notNull(),
    userAgent: varchar("user_agent", { length: 512 }),
    createdAt: createdAt(),
    lastSeenAt: timestamp("last_seen_at", {
      withTimezone: true,
      precision: 3,
    })
      .defaultNow()
      .notNull(),
    expiresAt: timestamp("expires_at", {
      withTimezone: true,
      precision: 3,
    }).notNull(),
    revokedAt: timestamp("revoked_at", {
      withTimezone: true,
      precision: 3,
    }),
  },
  (table) => [
    uniqueIndex("auth_sessions_token_hash_unique").on(table.tokenHash),
    index("auth_sessions_user_id_index").on(table.userId),
    index("auth_sessions_active_workspace_id_index").on(
      table.activeWorkspaceId,
    ),
    index("auth_sessions_expires_at_index").on(table.expiresAt),
    check(
      "auth_sessions_token_hash_hex",
      sql`${table.tokenHash} ~ '^[0-9a-f]{64}$'`,
    ),
    check(
      "auth_sessions_expiration_after_creation",
      sql`${table.expiresAt} > ${table.createdAt}`,
    ),
    check(
      "auth_sessions_last_seen_not_before_creation",
      sql`${table.lastSeenAt} >= ${table.createdAt}`,
    ),
    check(
      "auth_sessions_revocation_not_before_creation",
      sql`${table.revokedAt} is null or ${table.revokedAt} >= ${table.createdAt}`,
    ),
  ],
);

export const passwordResetTokens = applicationSchema.table(
  "password_reset_tokens",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: char("token_hash", { length: 64 }).notNull(),
    createdAt: createdAt(),
    expiresAt: timestamp("expires_at", {
      withTimezone: true,
      precision: 3,
    }).notNull(),
    usedAt: timestamp("used_at", {
      withTimezone: true,
      precision: 3,
    }),
    revokedAt: timestamp("revoked_at", {
      withTimezone: true,
      precision: 3,
    }),
  },
  (table) => [
    uniqueIndex("password_reset_tokens_token_hash_unique").on(table.tokenHash),
    index("password_reset_tokens_user_id_index").on(table.userId),
    index("password_reset_tokens_expires_at_index").on(table.expiresAt),
    check(
      "password_reset_tokens_token_hash_hex",
      sql`${table.tokenHash} ~ '^[0-9a-f]{64}$'`,
    ),
    check(
      "password_reset_tokens_expiration_after_creation",
      sql`${table.expiresAt} > ${table.createdAt}`,
    ),
    check(
      "password_reset_tokens_usage_not_before_creation",
      sql`${table.usedAt} is null or ${table.usedAt} >= ${table.createdAt}`,
    ),
    check(
      "password_reset_tokens_revocation_not_before_creation",
      sql`${table.revokedAt} is null or ${table.revokedAt} >= ${table.createdAt}`,
    ),
  ],
);
