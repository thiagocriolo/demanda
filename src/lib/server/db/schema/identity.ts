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

export const users = applicationSchema.table(
  "users",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    name: varchar("name", { length: 120 }).notNull(),
    username: varchar("username", { length: 40 }).notNull(),
    email: varchar("email", { length: 320 }).notNull(),
    avatarUrl: text("avatar_url"),
    emailVerifiedAt: timestamp("email_verified_at", {
      withTimezone: true,
      precision: 3,
    }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: timestamp("deleted_at", {
      withTimezone: true,
      precision: 3,
    }),
  },
  (table) => [
    uniqueIndex("users_email_lower_unique").on(table.email),
    uniqueIndex("users_username_lower_unique").on(
      table.username,
    ),
    check("users_name_not_blank", sql`length(btrim(${table.name})) > 0`),
    check(
      "users_username_normalized",
      sql`${table.username} = lower(btrim(${table.username}))`,
    ),
    check(
      "users_username_format",
      sql`${table.username} ~ '^[a-z0-9._-]{3,40}$'`,
    ),
    check(
      "users_email_normalized",
      sql`${table.email} = lower(btrim(${table.email}))`,
    ),
    check("users_email_has_at_sign", sql`position('@' in ${table.email}) > 1`),
  ],
);

export const userPreferences = applicationSchema.table(
  "user_preferences",
  {
    userId: uuid("user_id")
      .primaryKey()
      .references(() => users.id, { onDelete: "cascade" }),
    settings: jsonb("settings")
      .$type<Record<string, unknown>>()
      .default({})
      .notNull(),
    version: integer("version").default(1).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    check("user_preferences_version_positive", sql`${table.version} > 0`),
    check(
      "user_preferences_settings_object",
      sql`jsonb_typeof(${table.settings}) = 'object'`,
    ),
    check(
      "user_preferences_updated_not_before_creation",
      sql`${table.updatedAt} >= ${table.createdAt}`,
    ),
  ],
);

export const personalTasks = applicationSchema.table(
  "personal_tasks",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: varchar("title", { length: 80 }).notNull(),
    completed: boolean("completed").default(false).notNull(),
    sortOrder: integer("sort_order").default(0).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index("personal_tasks_user_order_index").on(
      table.userId,
      table.sortOrder,
      table.createdAt,
    ),
    check(
      "personal_tasks_title_not_blank",
      sql`length(btrim(${table.title})) > 0`,
    ),
    check(
      "personal_tasks_sort_order_nonnegative",
      sql`${table.sortOrder} >= 0`,
    ),
  ],
);

export const userCredentials = applicationSchema.table(
  "user_credentials",
  {
    userId: uuid("user_id")
      .primaryKey()
      .references(() => users.id, { onDelete: "cascade" }),
    passwordHash: text("password_hash").notNull(),
    passwordChangedAt: timestamp("password_changed_at", {
      withTimezone: true,
      precision: 3,
    })
      .defaultNow()
      .notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    check(
      "user_credentials_password_hash_not_blank",
      sql`length(btrim(${table.passwordHash})) > 0`,
    ),
    check(
      "user_credentials_password_changed_not_before_creation",
      sql`${table.passwordChangedAt} >= ${table.createdAt}`,
    ),
  ],
);
