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

import type {
  ContactEmailType,
  ContactPhoneType,
  ContactStatus,
  ContactType,
} from "./enums";
import { users } from "./identity";
import { workspaceMembers, workspaces } from "./workspace";

export const contacts = applicationSchema.table(
  "contacts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    ownerUserId: uuid("owner_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    linkedUserId: uuid("linked_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    name: varchar("name", { length: 120 }).notNull(),
    contactType: varchar("contact_type", { length: 16 })
      .$type<ContactType>()
      .default("person")
      .notNull(),
    status: varchar("status", { length: 16 })
      .$type<ContactStatus>()
      .default("active")
      .notNull(),
    profession: varchar("profession", { length: 120 }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    archivedAt: timestamp("archived_at", {
      withTimezone: true,
      precision: 3,
    }),
  },
  (table) => [
    unique("contacts_workspace_id_id_unique").on(table.workspaceId, table.id),
    index("contacts_name_search_index").on(table.name),
    index("contacts_owner_status_archived_index").on(
      table.ownerUserId,
      table.status,
      table.archivedAt,
    ),
    uniqueIndex("contacts_owner_linked_user_unique")
      .on(table.ownerUserId, table.linkedUserId),
    check(
      "contacts_type_allowed",
      sql`${table.contactType} in ('person', 'company', 'other')`,
    ),
    check(
      "contacts_status_allowed",
      sql`${table.status} in ('lead', 'prospect', 'active', 'inactive')`,
    ),
    check(
      "contacts_profession_not_blank",
      sql`${table.profession} is null or length(btrim(${table.profession})) > 0`,
    ),
    check(
      "contacts_updated_not_before_creation",
      sql`${table.updatedAt} >= ${table.createdAt}`,
    ),
    check(
      "contacts_archive_not_before_creation",
      sql`${table.archivedAt} is null or ${table.archivedAt} >= ${table.createdAt}`,
    ),
  ],
);

export const contactPhones = applicationSchema.table(
  "contact_phones",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    contactId: uuid("contact_id").notNull(),
    type: varchar("type", { length: 16 })
      .$type<ContactPhoneType>()
      .default("mobile")
      .notNull(),
    number: varchar("number", { length: 16 }).notNull(),
    label: varchar("label", { length: 80 }),
    isPrimary: boolean("is_primary").default(false).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    foreignKey({
      name: "contact_phones_workspace_contact_foreign_key",
      columns: [table.workspaceId, table.contactId],
      foreignColumns: [contacts.workspaceId, contacts.id],
    }).onDelete("cascade"),
    uniqueIndex("contact_phones_workspace_contact_number_unique").on(
      table.workspaceId,
      table.contactId,
      table.number,
    ),
    index("contact_phones_workspace_number_index").on(
      table.workspaceId,
      table.number,
    ),
    check(
      "contact_phones_type_allowed",
      sql`${table.type} in ('mobile', 'whatsapp', 'work', 'home', 'other')`,
    ),
    check(
      "contact_phones_number_e164",
      sql`${table.number} ~ '^\\+[1-9][0-9]{7,14}$'`,
    ),
    check(
      "contact_phones_label_not_blank",
      sql`${table.label} is null or length(btrim(${table.label})) > 0`,
    ),
    check(
      "contact_phones_updated_not_before_creation",
      sql`${table.updatedAt} >= ${table.createdAt}`,
    ),
  ],
);

export const contactEmails = applicationSchema.table(
  "contact_emails",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    contactId: uuid("contact_id").notNull(),
    type: varchar("type", { length: 16 })
      .$type<ContactEmailType>()
      .default("personal")
      .notNull(),
    address: varchar("address", { length: 320 }).notNull(),
    label: varchar("label", { length: 80 }),
    isPrimary: boolean("is_primary").default(false).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    foreignKey({
      name: "contact_emails_workspace_contact_foreign_key",
      columns: [table.workspaceId, table.contactId],
      foreignColumns: [contacts.workspaceId, contacts.id],
    }).onDelete("cascade"),
    uniqueIndex("contact_emails_workspace_contact_address_unique").on(
      table.workspaceId,
      table.contactId,
      table.address,
    ),
    index("contact_emails_workspace_address_index").on(
      table.workspaceId,
      table.address,
    ),
    check(
      "contact_emails_type_allowed",
      sql`${table.type} in ('personal', 'work', 'other')`,
    ),
    check(
      "contact_emails_address_normalized",
      sql`${table.address} = lower(btrim(${table.address}))`,
    ),
    check(
      "contact_emails_address_format",
      sql`${table.address} ~ '^[^[:space:]@]+@[^[:space:]@]+\\.[^[:space:]@]+$'`,
    ),
    check(
      "contact_emails_label_not_blank",
      sql`${table.label} is null or length(btrim(${table.label})) > 0`,
    ),
    check(
      "contact_emails_updated_not_before_creation",
      sql`${table.updatedAt} >= ${table.createdAt}`,
    ),
  ],
);

export const contactNotes = applicationSchema.table(
  "contact_notes",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    contactId: uuid("contact_id").notNull(),
    body: text("body").notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    archivedAt: timestamp("archived_at", {
      withTimezone: true,
      precision: 3,
    }),
  },
  (table) => [
    foreignKey({
      name: "contact_notes_workspace_contact_foreign_key",
      columns: [table.workspaceId, table.contactId],
      foreignColumns: [contacts.workspaceId, contacts.id],
    }).onDelete("cascade"),
    index("contact_notes_workspace_contact_created_index").on(
      table.workspaceId,
      table.contactId,
      table.createdAt,
    ),
    check(
      "contact_notes_body_not_blank",
      sql`length(btrim(${table.body})) > 0`,
    ),
    check(
      "contact_notes_updated_not_before_creation",
      sql`${table.updatedAt} >= ${table.createdAt}`,
    ),
    check(
      "contact_notes_archive_not_before_creation",
      sql`${table.archivedAt} is null or ${table.archivedAt} >= ${table.createdAt}`,
    ),
  ],
);

export const businesses = applicationSchema.table(
  "businesses",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    ownerUserId: uuid("owner_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 120 }).notNull(),
    categoryKey: varchar("category_key", { length: 64 }).notNull(),
    stageKey: varchar("stage_key", { length: 64 }).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    archivedAt: timestamp("archived_at", {
      withTimezone: true,
      precision: 3,
    }),
  },
  (table) => [
    unique("businesses_workspace_id_id_unique").on(table.workspaceId, table.id),
    index("businesses_owner_updated_id_index").on(
      table.ownerUserId,
      table.updatedAt,
      table.id,
    ),
    index("businesses_owner_stage_archived_index").on(
      table.ownerUserId,
      table.stageKey,
      table.archivedAt,
    ),
    index("businesses_owner_category_archived_index").on(
      table.ownerUserId,
      table.categoryKey,
      table.archivedAt,
    ),
    index("businesses_owner_name_lower_index").on(
      table.ownerUserId,
      table.name,
    ),
    index("businesses_name_search_index").on(table.name),
    check("businesses_name_not_blank", sql`length(btrim(${table.name})) > 0`),
    check(
      "businesses_category_key_normalized",
      sql`${table.categoryKey} = lower(btrim(${table.categoryKey}))`,
    ),
    check(
      "businesses_category_key_format",
      sql`${table.categoryKey} ~ '^[a-z0-9][a-z0-9_-]{0,63}$'`,
    ),
    check(
      "businesses_stage_key_normalized",
      sql`${table.stageKey} = lower(btrim(${table.stageKey}))`,
    ),
    check(
      "businesses_stage_key_format",
      sql`${table.stageKey} ~ '^[a-z0-9][a-z0-9_-]{0,63}$'`,
    ),
    check(
      "businesses_updated_not_before_creation",
      sql`${table.updatedAt} >= ${table.createdAt}`,
    ),
    check(
      "businesses_archive_not_before_creation",
      sql`${table.archivedAt} is null or ${table.archivedAt} >= ${table.createdAt}`,
    ),
  ],
);

export const businessResponsibles = applicationSchema.table(
  "business_responsibles",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    businessId: uuid("business_id")
      .notNull()
      .references(() => businesses.id),
    contactId: uuid("contact_id"),
    userId: uuid("user_id").references(() => users.id, {
      onDelete: "restrict",
    }),
    sortOrder: integer("sort_order"),
  },
  (table) => [
    foreignKey({
      name: "business_responsibles_workspace_business_foreign_key",
      columns: [table.workspaceId, table.businessId],
      foreignColumns: [businesses.workspaceId, businesses.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "business_responsibles_workspace_contact_foreign_key",
      columns: [table.workspaceId, table.contactId],
      foreignColumns: [contacts.workspaceId, contacts.id],
    }),
    index("business_responsibles_workspace_contact_index").on(
      table.workspaceId,
      table.contactId,
    ),
    index("business_responsibles_user_index").on(table.userId),
    uniqueIndex("business_responsibles_business_contact_unique")
      .on(table.workspaceId, table.businessId, table.contactId),
    uniqueIndex("business_responsibles_business_user_unique")
      .on(table.workspaceId, table.businessId, table.userId),
    index("business_responsibles_workspace_business_order_index").on(
      table.workspaceId,
      table.businessId,
      table.sortOrder,
      table.id,
    ),
    check(
      "business_responsibles_exactly_one_subject",
      sql`num_nonnulls(${table.contactId}, ${table.userId}) = 1`,
    ),
    check(
      "business_responsibles_sort_order_non_negative",
      sql`${table.sortOrder} is null or ${table.sortOrder} >= 0`,
    ),
  ],
);

export const businessNotes = applicationSchema.table(
  "business_notes",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    businessId: uuid("business_id").notNull(),
    body: text("body").notNull(),
    sortOrder: integer("sort_order").default(0).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    archivedAt: timestamp("archived_at", {
      withTimezone: true,
      precision: 3,
    }),
  },
  (table) => [
    foreignKey({
      name: "business_notes_workspace_business_foreign_key",
      columns: [table.workspaceId, table.businessId],
      foreignColumns: [businesses.workspaceId, businesses.id],
    }).onDelete("cascade"),
    index("business_notes_workspace_business_created_index").on(
      table.workspaceId,
      table.businessId,
      table.createdAt,
    ),
    index("business_notes_workspace_business_order_index").on(
      table.workspaceId,
      table.businessId,
      table.archivedAt,
      table.sortOrder,
      table.id,
    ),
    check(
      "business_notes_body_not_blank",
      sql`length(btrim(${table.body})) > 0`,
    ),
    check(
      "business_notes_sort_order_non_negative",
      sql`${table.sortOrder} >= 0`,
    ),
    check(
      "business_notes_updated_not_before_creation",
      sql`${table.updatedAt} >= ${table.createdAt}`,
    ),
    check(
      "business_notes_archive_not_before_creation",
      sql`${table.archivedAt} is null or ${table.archivedAt} >= ${table.createdAt}`,
    ),
  ],
);
