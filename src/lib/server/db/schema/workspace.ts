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
  ConnectionRequestStatus,
  StoredFileBackend,
  StoredFilePurpose,
  StoredFileStatus,
  WorkspaceCatalogKind,
  WorkspaceInvitationStatus,
  WorkspaceKind,
  WorkspaceRole,
} from "./enums";
import { users } from "./identity";

export const workspaces = applicationSchema.table(
  "workspaces",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    name: varchar("name", { length: 60 }).notNull(),
    description: varchar("description", { length: 240 }).default("").notNull(),
    icon: varchar("icon", { length: 80 })
      .default("briefcase-business")
      .notNull(),
    color: varchar("color", { length: 32 }).default("blue").notNull(),
    kind: varchar("kind", { length: 16 })
      .$type<WorkspaceKind>()
      .default("shared")
      .notNull(),
    ownerUserId: uuid("owner_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    personalOwnerId: uuid("personal_owner_id").generatedAlwaysAs(
      sql`case when kind = 'personal' then owner_user_id else null end`,
    ),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    archivedAt: timestamp("archived_at", {
      withTimezone: true,
      precision: 3,
    }),
  },
  (table) => [
    index("workspaces_owner_user_id_index").on(table.ownerUserId),
    uniqueIndex("workspaces_personal_owner_unique")
      .on(table.personalOwnerId),
    check("workspaces_name_not_blank", sql`length(btrim(${table.name})) > 0`),
    check(
      "workspaces_kind_allowed",
      sql`${table.kind} in ('personal', 'shared')`,
    ),
    check(
      "workspaces_personal_not_archived",
      sql`${table.kind} <> 'personal' or ${table.archivedAt} is null`,
    ),
  ],
);

export const workspaceMembers = applicationSchema.table(
  "workspace_members",
  {
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: varchar("role", { length: 16 })
      .$type<WorkspaceRole>()
      .default("member")
      .notNull(),
    ownerUserId: uuid("owner_user_id").generatedAlwaysAs(
      sql`case when role = 'owner' then user_id else null end`,
    ),
    joinedAt: timestamp("joined_at", {
      withTimezone: true,
      precision: 3,
    })
      .defaultNow()
      .notNull(),
    updatedAt: updatedAt(),
  },
  (table) => [
    primaryKey({
      name: "workspace_members_workspace_user_primary_key",
      columns: [table.workspaceId, table.userId],
    }),
    index("workspace_members_user_id_index").on(table.userId),
    uniqueIndex("workspace_members_one_owner_unique")
      .on(table.workspaceId, table.ownerUserId),
    check(
      "workspace_members_role_allowed",
      sql`${table.role} in ('owner', 'admin', 'member')`,
    ),
  ],
);

export const userConnections = applicationSchema.table(
  "user_connections",
  {
    userAId: uuid("user_a_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    userBId: uuid("user_b_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    manualConnectedAt: timestamp("manual_connected_at", {
      withTimezone: true,
      precision: 3,
    }),
    workspaceConnectedAt: timestamp("workspace_connected_at", {
      withTimezone: true,
      precision: 3,
    }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    primaryKey({
      name: "user_connections_user_pair_primary_key",
      columns: [table.userAId, table.userBId],
    }),
    index("user_connections_user_b_id_index").on(table.userBId),
    check(
      "user_connections_canonical_pair",
      sql`${table.userAId} < ${table.userBId}`,
    ),
    check(
      "user_connections_has_source",
      sql`${table.manualConnectedAt} is not null or ${table.workspaceConnectedAt} is not null`,
    ),
  ],
);

export const connectionRequests = applicationSchema.table(
  "connection_requests",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userAId: uuid("user_a_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    userBId: uuid("user_b_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    requestedByUserId: uuid("requested_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    status: varchar("status", { length: 16 })
      .$type<ConnectionRequestStatus>()
      .default("pending")
      .notNull(),
    respondedAt: timestamp("responded_at", {
      withTimezone: true,
      precision: 3,
    }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    unique("connection_requests_user_pair_unique").on(
      table.userAId,
      table.userBId,
    ),
    index("connection_requests_recipient_status_index").on(
      table.userBId,
      table.status,
      table.createdAt,
    ),
    check(
      "connection_requests_canonical_pair",
      sql`${table.userAId} < ${table.userBId}`,
    ),
    check(
      "connection_requests_requester_in_pair",
      sql`${table.requestedByUserId} = ${table.userAId} or ${table.requestedByUserId} = ${table.userBId}`,
    ),
    check(
      "connection_requests_status_allowed",
      sql`${table.status} in ('pending', 'accepted', 'declined', 'cancelled')`,
    ),
    check(
      "connection_requests_response_consistent",
      sql`(${table.status} = 'pending' and ${table.respondedAt} is null) or (${table.status} <> 'pending' and ${table.respondedAt} is not null)`,
    ),
  ],
);

export const workspaceInvitations = applicationSchema.table(
  "workspace_invitations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    invitedByUserId: uuid("invited_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    email: varchar("email", { length: 320 }).notNull(),
    role: varchar("role", { length: 16 })
      .$type<Exclude<WorkspaceRole, "owner">>()
      .default("member")
      .notNull(),
    status: varchar("status", { length: 16 })
      .$type<WorkspaceInvitationStatus>()
      .default("pending")
      .notNull(),
    pendingEmail: varchar("pending_email", { length: 320 }).generatedAlwaysAs(
      sql`case when status = 'pending' then email else null end`,
    ),
    acceptedByUserId: uuid("accepted_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    acceptedAt: timestamp("accepted_at", {
      withTimezone: true,
      precision: 3,
    }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index("workspace_invitations_workspace_status_index").on(
      table.workspaceId,
      table.status,
      table.createdAt,
    ),
    index("workspace_invitations_email_status_index").on(
      table.email,
      table.status,
    ),
    uniqueIndex("workspace_invitations_pending_email_unique")
      .on(table.workspaceId, table.pendingEmail),
    check(
      "workspace_invitations_email_normalized",
      sql`${table.email} = lower(btrim(${table.email}))`,
    ),
    check(
      "workspace_invitations_email_has_at_sign",
      sql`position('@' in ${table.email}) > 1`,
    ),
    check(
      "workspace_invitations_role_allowed",
      sql`${table.role} in ('admin', 'member')`,
    ),
    check(
      "workspace_invitations_status_allowed",
      sql`${table.status} in ('pending', 'accepted', 'revoked')`,
    ),
    check(
      "workspace_invitations_acceptance_consistent",
      sql`(${table.status} = 'accepted') = (${table.acceptedAt} is not null and ${table.acceptedByUserId} is not null)`,
    ),
  ],
);

export const storedFiles = applicationSchema.table(
  "stored_files",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    ownerUserId: uuid("owner_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    purpose: varchar("purpose", { length: 32 })
      .$type<StoredFilePurpose>()
      .notNull(),
    backend: varchar("backend", { length: 16 })
      .$type<StoredFileBackend>()
      .notNull(),
    status: varchar("status", { length: 16 })
      .$type<StoredFileStatus>()
      .default("ready")
      .notNull(),
    storageKey: varchar("storage_key", { length: 512 }).notNull(),
    legacyStorageKey: varchar("legacy_storage_key", { length: 512 }),
    originalName: varchar("original_name", { length: 255 }).notNull(),
    originalMimeType: varchar("original_mime_type", { length: 120 }),
    originalByteSize: integer("original_byte_size"),
    originalWidth: integer("original_width"),
    originalHeight: integer("original_height"),
    extension: varchar("extension", { length: 16 }).notNull(),
    mimeType: varchar("mime_type", { length: 120 }).notNull(),
    byteSize: integer("byte_size").notNull(),
    width: integer("width"),
    height: integer("height"),
    sha256: char("sha256", { length: 64 }).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: timestamp("deleted_at", {
      withTimezone: true,
      precision: 3,
    }),
  },
  (table) => [
    uniqueIndex("stored_files_storage_key_unique").on(table.storageKey),
    index("stored_files_workspace_created_index").on(
      table.workspaceId,
      table.deletedAt,
      table.createdAt,
    ),
    index("stored_files_owner_user_id_index").on(table.ownerUserId),
    index("stored_files_status_updated_index").on(
      table.status,
      table.updatedAt,
    ),
    check(
      "stored_files_purpose_allowed",
      sql`${table.purpose} in ('profile_avatar', 'attachment')`,
    ),
    check(
      "stored_files_backend_allowed",
      sql`${table.backend} in ('local', 's3')`,
    ),
    check(
      "stored_files_status_allowed",
      sql`${table.status} in ('pending', 'processing', 'ready', 'failed', 'deleting')`,
    ),
    check(
      "stored_files_original_name_not_blank",
      sql`length(btrim(${table.originalName})) > 0`,
    ),
    check(
      "stored_files_extension_normalized",
      sql`${table.extension} ~ '^\\.[a-z0-9]{1,15}$'`,
    ),
    check(
      "stored_files_mime_type_not_blank",
      sql`length(btrim(${table.mimeType})) > 0`,
    ),
    check("stored_files_byte_size_positive", sql`${table.byteSize} > 0`),
    check(
      "stored_files_original_byte_size_positive",
      sql`${table.originalByteSize} is null or ${table.originalByteSize} > 0`,
    ),
    check(
      "stored_files_dimensions_complete",
      sql`(${table.width} is null and ${table.height} is null) or (${table.width} > 0 and ${table.height} > 0)`,
    ),
    check("stored_files_sha256_hex", sql`${table.sha256} ~ '^[0-9a-f]{64}$'`),
    check(
      "stored_files_deletion_not_before_creation",
      sql`${table.deletedAt} is null or ${table.deletedAt} >= ${table.createdAt}`,
    ),
  ],
);

export const userStorageUsage = applicationSchema.table(
  "user_storage_usage",
  {
    userId: uuid("user_id")
      .primaryKey()
      .references(() => users.id, { onDelete: "cascade" }),
    storageUsedBytes: bigint("storage_used_bytes", { mode: "number" })
      .default(0)
      .notNull(),
    storageReservedBytes: bigint("storage_reserved_bytes", { mode: "number" })
      .default(0)
      .notNull(),
    storageLimitBytes: bigint("storage_limit_bytes", { mode: "number" }),
    updatedAt: updatedAt(),
  },
  (table) => [
    check(
      "user_storage_usage_used_non_negative",
      sql`${table.storageUsedBytes} >= 0`,
    ),
    check(
      "user_storage_usage_reserved_non_negative",
      sql`${table.storageReservedBytes} >= 0`,
    ),
    check(
      "user_storage_usage_limit_positive",
      sql`${table.storageLimitBytes} is null or ${table.storageLimitBytes} > 0`,
    ),
    check(
      "user_storage_usage_within_limit",
      sql`${table.storageLimitBytes} is null or ${table.storageUsedBytes} + ${table.storageReservedBytes} <= ${table.storageLimitBytes}`,
    ),
  ],
);

export const workspaceConfigurations = applicationSchema.table(
  "workspace_configurations",
  {
    workspaceId: uuid("workspace_id")
      .primaryKey()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    version: integer("version").default(1).notNull(),
    templateGalleryVersion: integer("template_gallery_version")
      .default(1)
      .notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    check(
      "workspace_configurations_version_positive",
      sql`${table.version} > 0`,
    ),
    check(
      "workspace_configurations_gallery_version_positive",
      sql`${table.templateGalleryVersion} > 0`,
    ),
    check(
      "workspace_configurations_updated_not_before_creation",
      sql`${table.updatedAt} >= ${table.createdAt}`,
    ),
  ],
);

export const workspaceCatalogEntries = applicationSchema.table(
  "workspace_catalog_entries",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    kind: varchar("kind", { length: 32 })
      .$type<WorkspaceCatalogKind>()
      .notNull(),
    key: varchar("key", { length: 64 }).notNull(),
    label: varchar("label", { length: 80 }).notNull(),
    icon: varchar("icon", { length: 80 }),
    color: varchar("color", { length: 32 }),
    sortOrder: integer("sort_order").default(0).notNull(),
    locked: boolean("locked").default(false).notNull(),
    version: integer("version").default(1).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    archivedAt: timestamp("archived_at", {
      withTimezone: true,
      precision: 3,
    }),
  },
  (table) => [
    unique("workspace_catalog_entries_workspace_id_id_unique").on(
      table.workspaceId,
      table.id,
    ),
    unique("workspace_catalog_entries_workspace_kind_key_unique").on(
      table.workspaceId,
      table.kind,
      table.key,
    ),
    index("workspace_catalog_entries_workspace_kind_order_index").on(
      table.workspaceId,
      table.kind,
      table.archivedAt,
      table.sortOrder,
      table.id,
    ),
    check(
      "workspace_catalog_entries_kind_allowed",
      sql`${table.kind} in ('person_status', 'business_status', 'project_status', 'task_status', 'business_category', 'task_category', 'task_priority', 'revenue_category', 'expense_category')`,
    ),
    check(
      "workspace_catalog_entries_key_normalized",
      sql`${table.key} = lower(btrim(${table.key}))`,
    ),
    check(
      "workspace_catalog_entries_key_format",
      sql`${table.key} ~ '^[a-z0-9][a-z0-9_-]{0,63}$'`,
    ),
    check(
      "workspace_catalog_entries_label_not_blank",
      sql`length(btrim(${table.label})) > 0`,
    ),
    check(
      "workspace_catalog_entries_sort_order_non_negative",
      sql`${table.sortOrder} >= 0`,
    ),
    check(
      "workspace_catalog_entries_version_positive",
      sql`${table.version} > 0`,
    ),
    check(
      "workspace_catalog_entries_updated_not_before_creation",
      sql`${table.updatedAt} >= ${table.createdAt}`,
    ),
    check(
      "workspace_catalog_entries_archive_not_before_creation",
      sql`${table.archivedAt} is null or ${table.archivedAt} >= ${table.createdAt}`,
    ),
  ],
);

export const auditLogs = applicationSchema.table(
  "audit_logs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "restrict" }),
    actorUserId: uuid("actor_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    action: varchar("action", { length: 100 }).notNull(),
    targetType: varchar("target_type", { length: 80 }).notNull(),
    targetId: varchar("target_id", { length: 160 }),
    metadata: jsonb("metadata")
      .default({})
      .notNull(),
    ipAddress: varchar("ip_address", { length: 64 }),
    userAgent: varchar("user_agent", { length: 512 }),
    createdAt: createdAt(),
  },
  (table) => [
    index("audit_logs_workspace_created_at_index").on(
      table.workspaceId,
      table.createdAt,
    ),
    index("audit_logs_actor_user_id_index").on(table.actorUserId),
    check(
      "audit_logs_action_not_blank",
      sql`length(btrim(${table.action})) > 0`,
    ),
    check(
      "audit_logs_target_type_not_blank",
      sql`length(btrim(${table.targetType})) > 0`,
    ),
    check(
      "audit_logs_target_id_not_blank",
      sql`${table.targetId} is null or length(btrim(${table.targetId})) > 0`,
    ),
    check(
      "audit_logs_metadata_is_object",
      sql`jsonb_typeof(${table.metadata}) = 'object'`,
    ),
  ],
);
