import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  foreignKey,
  index,
  int as integer,
  text,
  varchar,
} from "drizzle-orm/mysql-core";
import {
  applicationSchema,
  check,
  createdAt,
  timestamp,
  updatedAt,
  uuid,
} from "./base";
import { users } from "./identity";

/**
 * User-owned service blueprint: a reusable commercial + operational package
 * independent of workspace, business, and responsible members.
 */
export const servicePackages = applicationSchema.table(
  "service_packages",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    ownerUserId: uuid("owner_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 140 }).notNull(),
    description: text("description").notNull(),
    icon: varchar("icon", { length: 80 }).default("package").notNull(),
    color: varchar("color", { length: 32 }).default("blue").notNull(),
    amountCents: bigint("amount_cents", { mode: "number" })
      .default(0)
      .notNull(),
    durationMonths: integer("duration_months"),
    installmentCount: integer("installment_count").default(1).notNull(),
    paymentMethod: varchar("payment_method", { length: 120 }),
    paymentTerms: text("payment_terms"),
    sortOrder: integer("sort_order").default(0).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    archivedAt: timestamp("archived_at", { withTimezone: true, precision: 3 }),
  },
  (table) => [
    index("service_packages_owner_archived_updated_index").on(
      table.ownerUserId,
      table.archivedAt,
      table.updatedAt,
      table.id,
    ),
    index("service_packages_owner_order_index").on(
      table.ownerUserId,
      table.sortOrder,
      table.id,
    ),
    check("service_packages_name_not_blank", sql`length(btrim(${table.name})) > 0`),
    check(
      "service_packages_amount_safe",
      sql`${table.amountCents} between 0 and 9007199254740991`,
    ),
    check(
      "service_packages_duration_months_range",
      sql`${table.durationMonths} is null or ${table.durationMonths} between 1 and 120`,
    ),
    check(
      "service_packages_installment_count_range",
      sql`${table.installmentCount} between 1 and 99`,
    ),
    check("service_packages_sort_order_non_negative", sql`${table.sortOrder} >= 0`),
  ],
);

/**
 * Projects belonging to a service package (1 automatic institutional project
 * + up to 99 explicit projects = max 100 projects per service).
 * Each project carries its own execution nature (one_off or recurring).
 */
export const servicePackageProjects = applicationSchema.table(
  "service_package_projects",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    servicePackageId: uuid("service_package_id").notNull(),
    isInstitutional: boolean("is_institutional").default(false).notNull(),
    name: varchar("name", { length: 140 }).notNull(),
    briefing: text("briefing").notNull(),
    projectType: varchar("project_type", { length: 16 })
      .$type<"one_off" | "recurring">()
      .default("one_off")
      .notNull(),
    durationDays: integer("duration_days"),
    sortOrder: integer("sort_order").default(0).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    foreignKey({
      name: "service_package_projects_package_fk",
      columns: [table.servicePackageId],
      foreignColumns: [servicePackages.id],
    }).onDelete("cascade"),
    index("service_package_projects_package_order_index").on(
      table.servicePackageId,
      table.sortOrder,
      table.id,
    ),
    check(
      "service_package_projects_name_not_blank",
      sql`length(btrim(${table.name})) > 0`,
    ),
    check(
      "service_package_projects_type_allowed",
      sql`${table.projectType} in ('one_off', 'recurring')`,
    ),
    check(
      "service_package_projects_institutional_always_one_off",
      sql`not ${table.isInstitutional} or ${table.projectType} = 'one_off'`,
    ),
    check(
      "service_package_projects_duration_range",
      sql`${table.durationDays} is null or ${table.durationDays} between 1 and 3650`,
    ),
    check(
      "service_package_projects_sort_order_non_negative",
      sql`${table.sortOrder} >= 0`,
    ),
  ],
);

export const servicePackageDeliveries = applicationSchema.table(
  "service_package_deliveries",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    servicePackageId: uuid("service_package_id").notNull(),
    serviceProjectId: uuid("service_project_id").notNull(),
    name: varchar("name", { length: 140 }).notNull(),
    description: text("description").notNull(),
    priorityKey: varchar("priority_key", { length: 64 })
      .default("normal")
      .notNull(),
    recurrenceType: varchar("recurrence_type", { length: 16 })
      .$type<"one_off" | "daily" | "weekly" | "monthly" | "custom">()
      .default("one_off")
      .notNull(),
    recurrenceUnit: varchar("recurrence_unit", { length: 16 }).$type<
      "week" | "month"
    >(),
    recurrenceDays: text("recurrence_days").notNull(),
    sortOrder: integer("sort_order").default(0).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    foreignKey({
      name: "service_package_deliveries_package_fk",
      columns: [table.servicePackageId],
      foreignColumns: [servicePackages.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "service_package_deliveries_project_fk",
      columns: [table.serviceProjectId],
      foreignColumns: [servicePackageProjects.id],
    }).onDelete("cascade"),
    index("service_package_deliveries_project_order_index").on(
      table.serviceProjectId,
      table.sortOrder,
      table.id,
    ),
    index("service_package_deliveries_package_index").on(table.servicePackageId),
    check(
      "service_package_deliveries_name_not_blank",
      sql`length(btrim(${table.name})) > 0`,
    ),
    check(
      "service_package_deliveries_recurrence_allowed",
      sql`${table.recurrenceType} in ('one_off', 'daily', 'weekly', 'monthly', 'custom')`,
    ),
    check(
      "service_package_deliveries_sort_order_non_negative",
      sql`${table.sortOrder} >= 0`,
    ),
  ],
);

export const servicePackageTasks = applicationSchema.table(
  "service_package_tasks",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    servicePackageId: uuid("service_package_id").notNull(),
    serviceDeliveryId: uuid("service_delivery_id").notNull(),
    name: varchar("name", { length: 120 }).notNull(),
    durationMinutes: integer("duration_minutes").default(60).notNull(),
    sortOrder: integer("sort_order").default(0).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    foreignKey({
      name: "service_package_tasks_package_fk",
      columns: [table.servicePackageId],
      foreignColumns: [servicePackages.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "service_package_tasks_delivery_fk",
      columns: [table.serviceDeliveryId],
      foreignColumns: [servicePackageDeliveries.id],
    }).onDelete("cascade"),
    index("service_package_tasks_delivery_order_index").on(
      table.serviceDeliveryId,
      table.sortOrder,
      table.id,
    ),
    index("service_package_tasks_package_index").on(table.servicePackageId),
    check(
      "service_package_tasks_name_not_blank",
      sql`length(btrim(${table.name})) > 0`,
    ),
    check(
      "service_package_tasks_duration_range",
      sql`${table.durationMinutes} between 30 and 10080`,
    ),
    check(
      "service_package_tasks_duration_half_hour",
      sql`${table.durationMinutes} % 30 = 0`,
    ),
    check(
      "service_package_tasks_sort_order_non_negative",
      sql`${table.sortOrder} >= 0`,
    ),
  ],
);
