import { sql } from "drizzle-orm";
import {
  bigint,
  date,
  foreignKey,
  index,
  int as integer,
  text,
  unique,
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
import { businesses } from "./crm";
import { users } from "./identity";
import { workspaces } from "./workspace";

/**
 * Commercial agreement. Finance belongs here, independently of how many
 * projects are executed under the agreement.
 */
export const contracts = applicationSchema.table(
  "contracts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    /** Owner of the commercial and financial relationship. */
    ownerUserId: uuid("owner_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    businessId: uuid("business_id").notNull(),
    name: varchar("name", { length: 140 }).notNull(),
    contractType: varchar("contract_type", { length: 16 })
      .$type<"one_off" | "recurring">()
      .default("one_off")
      .notNull(),
    amountCents: bigint("amount_cents", { mode: "number" })
      .default(0)
      .notNull(),
    startDate: date("start_date", { mode: "string" }),
    endDate: date("end_date", { mode: "string" }),
    firstDueDate: date("first_due_date", { mode: "string" }),
    paymentMethod: varchar("payment_method", { length: 120 }),
    paymentTerms: text("payment_terms"),
    financeNotes: text("finance_notes"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    archivedAt: timestamp("archived_at", { withTimezone: true, precision: 3 }),
  },
  (table) => [
    unique("contracts_workspace_id_id_unique").on(table.workspaceId, table.id),
    unique("contracts_workspace_id_id_business_id_unique").on(
      table.workspaceId,
      table.id,
      table.businessId,
    ),
    foreignKey({
      name: "contracts_business_foreign_key",
      columns: [table.businessId],
      foreignColumns: [businesses.id],
    }).onDelete("cascade"),
    index("contracts_owner_workspace_updated_index").on(
      table.ownerUserId,
      table.workspaceId,
      table.updatedAt,
    ),
    index("contracts_workspace_business_archived_index").on(
      table.workspaceId,
      table.businessId,
      table.archivedAt,
    ),
    index("contracts_workspace_updated_id_index").on(
      table.workspaceId,
      table.updatedAt,
      table.id,
    ),
    check("contracts_name_not_blank", sql`length(btrim(${table.name})) > 0`),
    check(
      "contracts_contract_type_allowed",
      sql`${table.contractType} in ('one_off', 'recurring')`,
    ),
    check(
      "contracts_amount_cents_safe",
      sql`${table.amountCents} between 0 and 9007199254740991`,
    ),
    check(
      "contracts_dates_chronological",
      sql`${table.endDate} is null or ${table.startDate} is null or ${table.endDate} >= ${table.startDate}`,
    ),
  ],
);

export const contractInstallments = applicationSchema.table(
  "contract_installments",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    contractId: uuid("contract_id").notNull(),
    number: integer("number").notNull(),
    dueDate: date("due_date", { mode: "string" }).notNull(),
    amountCents: bigint("amount_cents", { mode: "number" }).notNull(),
    statusKey: varchar("status_key", { length: 64 }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    unique("contract_installments_workspace_id_id_unique").on(
      table.workspaceId,
      table.id,
    ),
    unique("contract_installments_contract_number_unique").on(
      table.workspaceId,
      table.contractId,
      table.number,
    ),
    foreignKey({
      name: "contract_installments_workspace_contract_foreign_key",
      columns: [table.workspaceId, table.contractId],
      foreignColumns: [contracts.workspaceId, contracts.id],
    }).onDelete("cascade"),
    index("contract_installments_workspace_due_status_index").on(
      table.workspaceId,
      table.dueDate,
      table.statusKey,
    ),
    check(
      "contract_installments_number_range",
      sql`${table.number} between 1 and 999`,
    ),
    check(
      "contract_installments_amount_safe",
      sql`${table.amountCents} between 0 and 9007199254740991`,
    ),
  ],
);
