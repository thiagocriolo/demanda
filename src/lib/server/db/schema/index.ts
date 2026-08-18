import { relations, sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  bigint,
  boolean,
  char,
  check,
  date,
  foreignKey,
  index,
  integer,
  jsonb,
  numeric,
  pgSchema,
  primaryKey,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import {
  contactEmailTypes,
  contactPhoneTypes,
  contactStatuses,
  contactTypes,
  type ContactEmailType,
  type ContactPhoneType,
  type ContactStatus,
  type ContactType,
} from "../../../contacts/types";
import type {
  ToolConfig,
  ToolKey,
  ToolResponsePayload,
  ToolUseContent,
  ToolUseStatus,
} from "../../../tools/types";

export { contactEmailTypes, contactPhoneTypes, contactStatuses, contactTypes };
export type { ContactEmailType, ContactPhoneType, ContactStatus, ContactType };

export const applicationSchema = pgSchema("app");

export const workspaceRoles = ["owner", "admin", "member"] as const;
export type WorkspaceRole = (typeof workspaceRoles)[number];

export const workspaceKinds = ["personal", "shared"] as const;
export type WorkspaceKind = (typeof workspaceKinds)[number];

export const workspaceInvitationStatuses = [
  "pending",
  "accepted",
  "revoked",
] as const;
export type WorkspaceInvitationStatus =
  (typeof workspaceInvitationStatuses)[number];

export const connectionRequestStatuses = [
  "pending",
  "accepted",
  "declined",
  "cancelled",
] as const;
export type ConnectionRequestStatus =
  (typeof connectionRequestStatuses)[number];

export const socialPostKinds = ["feed", "portfolio"] as const;
export type SocialPostKind = (typeof socialPostKinds)[number];

export const socialBlockKinds = ["text", "image", "video"] as const;
export type SocialBlockKind = (typeof socialBlockKinds)[number];

export const communityVisibilities = ["public", "private"] as const;
export type CommunityVisibility = (typeof communityVisibilities)[number];

export const communityMemberRoles = ["owner", "admin", "member"] as const;
export type CommunityMemberRole = (typeof communityMemberRoles)[number];

export const communityJoinRequestStatuses = [
  "pending",
  "accepted",
  "declined",
] as const;
export type CommunityJoinRequestStatus =
  (typeof communityJoinRequestStatuses)[number];

export const communityInvitationStatuses = ["pending", "accepted"] as const;
export type CommunityInvitationStatus =
  (typeof communityInvitationStatuses)[number];

export const storedFilePurposes = ["profile_avatar", "attachment"] as const;
export type StoredFilePurpose = (typeof storedFilePurposes)[number];

export const storedFileBackends = ["local", "s3"] as const;
export type StoredFileBackend = (typeof storedFileBackends)[number];

export const storedFileStatuses = [
  "pending",
  "processing",
  "ready",
  "failed",
  "deleting",
] as const;
export type StoredFileStatus = (typeof storedFileStatuses)[number];

export const taskBoardViews = [
  "status",
  "priority",
  "business",
  "project",
] as const;
export type TaskBoardView = (typeof taskBoardViews)[number];
export type TaskBoardOrder = Partial<Record<TaskBoardView, number>>;

export const agendaEntityKinds = ["project", "task"] as const;
export type AgendaEntityKind = (typeof agendaEntityKinds)[number];

export const workspaceCatalogKinds = [
  "person_status",
  "business_status",
  "project_status",
  "task_status",
  "business_category",
  "task_category",
  "task_priority",
  "revenue_category",
  "expense_category",
] as const;
export type WorkspaceCatalogKind = (typeof workspaceCatalogKinds)[number];

const createdAt = () =>
  timestamp("created_at", { withTimezone: true, precision: 3 })
    .defaultNow()
    .notNull();

const updatedAt = () =>
  timestamp("updated_at", { withTimezone: true, precision: 3 })
    .defaultNow()
    .notNull();

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
    uniqueIndex("users_email_lower_unique").on(sql`lower(${table.email})`),
    uniqueIndex("users_username_lower_unique").on(
      sql`lower(${table.username})`,
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
      .default(sql`'{}'::jsonb`)
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
      .on(table.ownerUserId)
      .where(sql`${table.kind} = 'personal'`),
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
      .on(table.workspaceId)
      .where(sql`${table.role} = 'owner'`),
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
      .on(table.workspaceId, sql`lower(${table.email})`)
      .where(sql`${table.status} = 'pending'`),
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

export const communities = applicationSchema.table(
  "communities",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    ownerUserId: uuid("owner_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    coverFileId: uuid("cover_file_id").references(() => storedFiles.id, {
      onDelete: "restrict",
    }),
    linkName: varchar("link_name", { length: 40 }).notNull(),
    name: varchar("name", { length: 80 }).notNull(),
    description: varchar("description", { length: 240 }).notNull(),
    topic: varchar("topic", { length: 60 }).notNull(),
    visibility: varchar("visibility", { length: 16 })
      .$type<CommunityVisibility>()
      .default("public")
      .notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: timestamp("deleted_at", {
      withTimezone: true,
      precision: 3,
    }),
  },
  (table) => [
    index("communities_owner_created_index").on(
      table.ownerUserId,
      table.createdAt,
    ),
    index("communities_cover_file_index").on(table.coverFileId),
    uniqueIndex("communities_link_name_unique").on(table.linkName),
    check(
      "communities_link_name_normalized",
      sql`${table.linkName} = lower(btrim(${table.linkName}))`,
    ),
    check(
      "communities_link_name_format",
      sql`${table.linkName} ~ '^[a-z0-9._-]{3,40}$'`,
    ),
    check("communities_name_not_blank", sql`length(btrim(${table.name})) > 0`),
    check(
      "communities_description_not_blank",
      sql`length(btrim(${table.description})) > 0`,
    ),
    check(
      "communities_topic_not_blank",
      sql`length(btrim(${table.topic})) > 0`,
    ),
    check(
      "communities_visibility_allowed",
      sql`${table.visibility} in ('public', 'private')`,
    ),
  ],
);

export const communityMembers = applicationSchema.table(
  "community_members",
  {
    communityId: uuid("community_id")
      .notNull()
      .references(() => communities.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: varchar("role", { length: 16 })
      .$type<CommunityMemberRole>()
      .default("member")
      .notNull(),
    joinedAt: timestamp("joined_at", { withTimezone: true, precision: 3 })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.communityId, table.userId] }),
    index("community_members_user_joined_index").on(
      table.userId,
      table.joinedAt,
    ),
    check(
      "community_members_role_allowed",
      sql`${table.role} in ('owner', 'admin', 'member')`,
    ),
  ],
);

export const communityInvitations = applicationSchema.table(
  "community_invitations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    communityId: uuid("community_id")
      .notNull()
      .references(() => communities.id, { onDelete: "cascade" }),
    invitedUserId: uuid("invited_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    invitedByUserId: uuid("invited_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    status: varchar("status", { length: 16 })
      .$type<CommunityInvitationStatus>()
      .default("pending")
      .notNull(),
    invitedAt: timestamp("invited_at", { withTimezone: true, precision: 3 })
      .defaultNow()
      .notNull(),
    acceptedAt: timestamp("accepted_at", {
      withTimezone: true,
      precision: 3,
    }),
  },
  (table) => [
    uniqueIndex("community_invitations_community_user_unique").on(
      table.communityId,
      table.invitedUserId,
    ),
    index("community_invitations_invited_user_status_index").on(
      table.invitedUserId,
      table.status,
      table.invitedAt,
    ),
    check(
      "community_invitations_status_allowed",
      sql`${table.status} in ('pending', 'accepted')`,
    ),
  ],
);

export const communityJoinRequests = applicationSchema.table(
  "community_join_requests",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    communityId: uuid("community_id")
      .notNull()
      .references(() => communities.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    status: varchar("status", { length: 16 })
      .$type<CommunityJoinRequestStatus>()
      .default("pending")
      .notNull(),
    requestedAt: timestamp("requested_at", {
      withTimezone: true,
      precision: 3,
    })
      .defaultNow()
      .notNull(),
    reviewedAt: timestamp("reviewed_at", {
      withTimezone: true,
      precision: 3,
    }),
    reviewedByUserId: uuid("reviewed_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
  },
  (table) => [
    uniqueIndex("community_join_requests_community_user_unique").on(
      table.communityId,
      table.userId,
    ),
    index("community_join_requests_pending_index").on(
      table.communityId,
      table.status,
      table.requestedAt,
    ),
    check(
      "community_join_requests_status_allowed",
      sql`${table.status} in ('pending', 'accepted', 'declined')`,
    ),
  ],
);

export const socialPosts = applicationSchema.table(
  "social_posts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    authorUserId: uuid("author_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    communityId: uuid("community_id").references(() => communities.id, {
      onDelete: "cascade",
    }),
    kind: varchar("kind", { length: 16 }).$type<SocialPostKind>().notNull(),
    title: varchar("title", { length: 160 }),
    body: text("body"),
    linkUrl: text("link_url"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: timestamp("deleted_at", {
      withTimezone: true,
      precision: 3,
    }),
  },
  (table) => [
    index("social_posts_author_created_index").on(
      table.authorUserId,
      table.createdAt,
    ),
    index("social_posts_kind_created_index").on(table.kind, table.createdAt),
    index("social_posts_community_created_index").on(
      table.communityId,
      table.createdAt,
    ),
    check(
      "social_posts_kind_allowed",
      sql`${table.kind} in ('feed', 'portfolio')`,
    ),
    check(
      "social_posts_portfolio_has_title",
      sql`${table.kind} <> 'portfolio' or nullif(btrim(coalesce(${table.title}, '')), '') is not null`,
    ),
  ],
);

export const socialPostBlocks = applicationSchema.table(
  "social_post_blocks",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    postId: uuid("post_id")
      .notNull()
      .references(() => socialPosts.id, { onDelete: "cascade" }),
    kind: varchar("kind", { length: 16 }).$type<SocialBlockKind>().notNull(),
    textContent: text("text_content"),
    fileId: uuid("file_id").references(() => storedFiles.id, {
      onDelete: "restrict",
    }),
    caption: varchar("caption", { length: 240 }),
    position: integer("position").notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    unique("social_post_blocks_post_position_unique").on(
      table.postId,
      table.position,
    ),
    index("social_post_blocks_file_id_index").on(table.fileId),
    check(
      "social_post_blocks_kind_allowed",
      sql`${table.kind} in ('text', 'image', 'video')`,
    ),
    check(
      "social_post_blocks_position_non_negative",
      sql`${table.position} >= 0`,
    ),
    check(
      "social_post_blocks_content_consistent",
      sql`(${table.kind} = 'text' and nullif(btrim(coalesce(${table.textContent}, '')), '') is not null and ${table.fileId} is null)
        or (${table.kind} in ('image', 'video') and ${table.fileId} is not null and ${table.textContent} is null)`,
    ),
  ],
);

export const socialPostLikes = applicationSchema.table(
  "social_post_likes",
  {
    postId: uuid("post_id")
      .notNull()
      .references(() => socialPosts.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: createdAt(),
  },
  (table) => [
    primaryKey({
      name: "social_post_likes_post_user_primary_key",
      columns: [table.postId, table.userId],
    }),
    index("social_post_likes_user_created_index").on(
      table.userId,
      table.createdAt,
    ),
  ],
);

export const socialPostComments = applicationSchema.table(
  "social_post_comments",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    postId: uuid("post_id")
      .notNull()
      .references(() => socialPosts.id, { onDelete: "cascade" }),
    parentCommentId: uuid("parent_comment_id").references(
      (): AnyPgColumn => socialPostComments.id,
      { onDelete: "cascade" },
    ),
    authorUserId: uuid("author_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    body: text("body").notNull(),
    depth: integer("depth").default(0).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: timestamp("deleted_at", {
      withTimezone: true,
      precision: 3,
    }),
  },
  (table) => [
    index("social_post_comments_post_created_index").on(
      table.postId,
      table.createdAt,
    ),
    index("social_post_comments_author_index").on(table.authorUserId),
    index("social_post_comments_parent_created_index").on(
      table.parentCommentId,
      table.createdAt,
    ),
    check(
      "social_post_comments_body_not_blank",
      sql`nullif(btrim(${table.body}), '') is not null`,
    ),
    check(
      "social_post_comments_depth_allowed",
      sql`${table.depth} between 0 and 10`,
    ),
  ],
);

export const socialCommentLikes = applicationSchema.table(
  "social_comment_likes",
  {
    commentId: uuid("comment_id")
      .notNull()
      .references(() => socialPostComments.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: createdAt(),
  },
  (table) => [
    primaryKey({
      name: "social_comment_likes_comment_user_primary_key",
      columns: [table.commentId, table.userId],
    }),
    index("social_comment_likes_user_created_index").on(
      table.userId,
      table.createdAt,
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
      .default(sql`'{}'::jsonb`)
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
    uniqueIndex("contacts_owner_linked_user_unique")
      .on(table.ownerUserId, table.linkedUserId)
      .where(
        sql`${table.linkedUserId} is not null and ${table.archivedAt} is null`,
      ),
    index("contacts_owner_status_archived_index").on(
      table.ownerUserId,
      table.status,
      table.archivedAt,
    ),
    index("contacts_owner_name_lower_index").on(
      table.ownerUserId,
      sql`lower(${table.name})`,
    ),
    index("contacts_name_search_index").using(
      "gin",
      sql`to_tsvector('simple', lower(${table.name}))`,
    ),
    index("contacts_owner_updated_id_index").on(
      table.ownerUserId,
      table.updatedAt,
      table.id,
    ),
    check("contacts_name_not_blank", sql`length(btrim(${table.name})) > 0`),
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
    uniqueIndex("contact_phones_one_primary_unique")
      .on(table.workspaceId, table.contactId)
      .where(sql`${table.isPrimary}`),
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
    uniqueIndex("contact_emails_one_primary_unique")
      .on(table.workspaceId, table.contactId)
      .where(sql`${table.isPrimary}`),
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
      sql`lower(${table.name})`,
    ),
    index("businesses_name_search_index").using(
      "gin",
      sql`to_tsvector('simple', lower(${table.name}))`,
    ),
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
      .on(table.workspaceId, table.businessId, table.contactId)
      .where(sql`${table.contactId} is not null`),
    uniqueIndex("business_responsibles_business_user_unique")
      .on(table.workspaceId, table.businessId, table.userId)
      .where(sql`${table.userId} is not null`),
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

export const services = applicationSchema.table(
  "services",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 140 }).notNull(),
    description: text("description").default("").notNull(),
    defaultBriefing: text("default_briefing").default("").notNull(),
    icon: varchar("icon", { length: 80 })
      .default("briefcase-business")
      .notNull(),
    color: varchar("color", { length: 32 }).default("blue").notNull(),
    defaultStatusKey: varchar("default_status_key", { length: 64 })
      .default("planejamento")
      .notNull(),
    defaultDurationDays: integer("default_duration_days"),
    defaultContractType: varchar("default_contract_type", { length: 16 })
      .default("one_off")
      .notNull(),
    defaultAmountCents: bigint("default_amount_cents", { mode: "number" }),
    defaultInstallmentCount: integer("default_installment_count")
      .default(1)
      .notNull(),
    defaultPaymentMethod: varchar("default_payment_method", { length: 120 }),
    defaultPaymentTerms: text("default_payment_terms"),
    defaultFinanceNotes: text("default_finance_notes"),
    sortOrder: integer("sort_order").default(0).notNull(),
    version: integer("version").default(1).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    archivedAt: timestamp("archived_at", {
      withTimezone: true,
      precision: 3,
    }),
  },
  (table) => [
    unique("services_workspace_id_id_unique").on(table.workspaceId, table.id),
    uniqueIndex("services_workspace_active_name_unique")
      .on(table.workspaceId, sql`lower(${table.name})`)
      .where(sql`${table.archivedAt} is null`),
    index("services_workspace_updated_id_index").on(
      table.workspaceId,
      table.updatedAt,
      table.id,
    ),
    index("services_workspace_archived_name_index").on(
      table.workspaceId,
      table.archivedAt,
      sql`lower(${table.name})`,
    ),
    index("services_workspace_archived_order_index").on(
      table.workspaceId,
      table.archivedAt,
      table.sortOrder,
      table.id,
    ),
    check("services_name_not_blank", sql`length(btrim(${table.name})) > 0`),
    check(
      "services_default_status_normalized",
      sql`${table.defaultStatusKey} = lower(btrim(${table.defaultStatusKey}))`,
    ),
    check(
      "services_default_status_format",
      sql`${table.defaultStatusKey} ~ '^[a-z0-9][a-z0-9_-]{0,63}$'`,
    ),
    check(
      "services_default_status_not_archived",
      sql`${table.defaultStatusKey} <> 'arquivado'`,
    ),
    check(
      "services_default_duration_range",
      sql`${table.defaultDurationDays} is null or ${table.defaultDurationDays} between 1 and 3650`,
    ),
    check(
      "services_default_contract_allowed",
      sql`${table.defaultContractType} in ('one_off', 'recurring')`,
    ),
    check(
      "services_default_amount_safe",
      sql`${table.defaultAmountCents} is null or ${table.defaultAmountCents} between 0 and 9007199254740991`,
    ),
    check(
      "services_default_installment_count_range",
      sql`${table.defaultInstallmentCount} between 1 and 99`,
    ),
    check("services_sort_order_non_negative", sql`${table.sortOrder} >= 0`),
    check("services_version_positive", sql`${table.version} > 0`),
    check(
      "services_payment_method_not_blank",
      sql`${table.defaultPaymentMethod} is null or length(btrim(${table.defaultPaymentMethod})) > 0`,
    ),
    check(
      "services_updated_not_before_creation",
      sql`${table.updatedAt} >= ${table.createdAt}`,
    ),
    check(
      "services_archive_not_before_creation",
      sql`${table.archivedAt} is null or ${table.archivedAt} >= ${table.createdAt}`,
    ),
  ],
);

export const tags = applicationSchema.table(
  "tags",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    key: varchar("key", { length: 64 }).notNull(),
    label: varchar("label", { length: 80 }).notNull(),
    sortOrder: integer("sort_order").default(0).notNull(),
    version: integer("version").default(1).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    archivedAt: timestamp("archived_at", {
      withTimezone: true,
      precision: 3,
    }),
  },
  (table) => [
    unique("tags_workspace_id_id_unique").on(table.workspaceId, table.id),
    unique("tags_workspace_key_unique").on(table.workspaceId, table.key),
    index("tags_workspace_archived_key_index").on(
      table.workspaceId,
      table.archivedAt,
      table.sortOrder,
      table.key,
    ),
    index("tags_workspace_label_lower_index").on(
      table.workspaceId,
      sql`lower(${table.label})`,
    ),
    check("tags_label_not_blank", sql`length(btrim(${table.label})) > 0`),
    check(
      "tags_key_normalized",
      sql`${table.key} = lower(btrim(${table.key}))`,
    ),
    check("tags_key_format", sql`${table.key} ~ '^[a-z0-9][a-z0-9_-]{0,63}$'`),
    check("tags_sort_order_non_negative", sql`${table.sortOrder} >= 0`),
    check("tags_version_positive", sql`${table.version} > 0`),
    check(
      "tags_updated_not_before_creation",
      sql`${table.updatedAt} >= ${table.createdAt}`,
    ),
    check(
      "tags_archive_not_before_creation",
      sql`${table.archivedAt} is null or ${table.archivedAt} >= ${table.createdAt}`,
    ),
  ],
);

export const serviceTags = applicationSchema.table(
  "service_tags",
  {
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    serviceId: uuid("service_id").notNull(),
    tagId: uuid("tag_id").notNull(),
    sortOrder: integer("sort_order").default(0).notNull(),
  },
  (table) => [
    primaryKey({
      name: "service_tags_workspace_service_tag_primary_key",
      columns: [table.workspaceId, table.serviceId, table.tagId],
    }),
    foreignKey({
      name: "service_tags_workspace_service_foreign_key",
      columns: [table.workspaceId, table.serviceId],
      foreignColumns: [services.workspaceId, services.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "service_tags_workspace_tag_foreign_key",
      columns: [table.workspaceId, table.tagId],
      foreignColumns: [tags.workspaceId, tags.id],
    }),
    index("service_tags_workspace_service_order_index").on(
      table.workspaceId,
      table.serviceId,
      table.sortOrder,
      table.tagId,
    ),
    index("service_tags_workspace_tag_service_index").on(
      table.workspaceId,
      table.tagId,
      table.serviceId,
    ),
    check("service_tags_sort_order_non_negative", sql`${table.sortOrder} >= 0`),
  ],
);

export const serviceResponsibles = applicationSchema.table(
  "service_responsibles",
  {
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    serviceId: uuid("service_id").notNull(),
    userId: uuid("user_id").notNull(),
    sortOrder: integer("sort_order").default(0).notNull(),
  },
  (table) => [
    primaryKey({
      name: "service_responsibles_workspace_service_user_primary_key",
      columns: [table.workspaceId, table.serviceId, table.userId],
    }),
    foreignKey({
      name: "service_responsibles_workspace_service_foreign_key",
      columns: [table.workspaceId, table.serviceId],
      foreignColumns: [services.workspaceId, services.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "service_responsibles_workspace_member_foreign_key",
      columns: [table.workspaceId, table.userId],
      foreignColumns: [workspaceMembers.workspaceId, workspaceMembers.userId],
    }).onDelete("cascade"),
    index("service_responsibles_workspace_service_order_index").on(
      table.workspaceId,
      table.serviceId,
      table.sortOrder,
      table.userId,
    ),
    index("service_responsibles_workspace_user_service_index").on(
      table.workspaceId,
      table.userId,
      table.serviceId,
    ),
    check(
      "service_responsibles_sort_order_non_negative",
      sql`${table.sortOrder} >= 0`,
    ),
  ],
);

export const deliveryTemplates = applicationSchema.table(
  "delivery_templates",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    serviceId: uuid("service_id"),
    name: varchar("name", { length: 140 }).notNull(),
    description: text("description").default("").notNull(),
    categoryKey: varchar("category_key", { length: 64 }),
    defaultStatusKey: varchar("default_status_key", { length: 64 })
      .default("planejamento")
      .notNull(),
    defaultPriorityKey: varchar("default_priority_key", { length: 64 })
      .default("normal")
      .notNull(),
    defaultDurationMinutes: integer("default_duration_minutes"),
    sortOrder: integer("sort_order").default(0).notNull(),
    version: integer("version").default(1).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    archivedAt: timestamp("archived_at", {
      withTimezone: true,
      precision: 3,
    }),
  },
  (table) => [
    unique("delivery_templates_workspace_id_id_unique").on(
      table.workspaceId,
      table.id,
    ),
    foreignKey({
      name: "delivery_templates_workspace_service_foreign_key",
      columns: [table.workspaceId, table.serviceId],
      foreignColumns: [services.workspaceId, services.id],
    }),
    uniqueIndex("delivery_templates_workspace_active_name_unique")
      .on(table.workspaceId, sql`lower(${table.name})`)
      .where(sql`${table.archivedAt} is null`),
    index("delivery_templates_workspace_service_order_index").on(
      table.workspaceId,
      table.serviceId,
      table.archivedAt,
      table.sortOrder,
      table.id,
    ),
    check(
      "delivery_templates_name_not_blank",
      sql`length(btrim(${table.name})) > 0`,
    ),
    check(
      "delivery_templates_category_normalized",
      sql`${table.categoryKey} is null or ${table.categoryKey} = lower(btrim(${table.categoryKey}))`,
    ),
    check(
      "delivery_templates_category_format",
      sql`${table.categoryKey} is null or ${table.categoryKey} ~ '^[a-z0-9][a-z0-9_-]{0,63}$'`,
    ),
    check(
      "delivery_templates_status_normalized",
      sql`${table.defaultStatusKey} = lower(btrim(${table.defaultStatusKey}))`,
    ),
    check(
      "delivery_templates_status_format",
      sql`${table.defaultStatusKey} ~ '^[a-z0-9][a-z0-9_-]{0,63}$'`,
    ),
    check(
      "delivery_templates_status_not_archived",
      sql`${table.defaultStatusKey} <> 'arquivado'`,
    ),
    check(
      "delivery_templates_priority_normalized",
      sql`${table.defaultPriorityKey} = lower(btrim(${table.defaultPriorityKey}))`,
    ),
    check(
      "delivery_templates_priority_format",
      sql`${table.defaultPriorityKey} ~ '^[a-z0-9][a-z0-9_-]{0,63}$'`,
    ),
    check(
      "delivery_templates_duration_range",
      sql`${table.defaultDurationMinutes} is null or ${table.defaultDurationMinutes} between 30 and 10080`,
    ),
    check(
      "delivery_templates_duration_half_hour",
      sql`${table.defaultDurationMinutes} is null or ${table.defaultDurationMinutes} % 30 = 0`,
    ),
    check(
      "delivery_templates_sort_order_non_negative",
      sql`${table.sortOrder} >= 0`,
    ),
    check("delivery_templates_version_positive", sql`${table.version} > 0`),
    check(
      "delivery_templates_updated_not_before_creation",
      sql`${table.updatedAt} >= ${table.createdAt}`,
    ),
    check(
      "delivery_templates_archive_not_before_creation",
      sql`${table.archivedAt} is null or ${table.archivedAt} >= ${table.createdAt}`,
    ),
  ],
);

export const serviceTaskTemplates = applicationSchema.table(
  "service_task_templates",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    serviceId: uuid("service_id").notNull(),
    deliveryTemplateId: uuid("delivery_template_id").notNull(),
    name: varchar("name", { length: 140 }).notNull(),
    sortOrder: integer("sort_order").default(0).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    unique("service_task_templates_workspace_id_id_unique").on(
      table.workspaceId,
      table.id,
    ),
    foreignKey({
      name: "service_task_templates_workspace_service_foreign_key",
      columns: [table.workspaceId, table.serviceId],
      foreignColumns: [services.workspaceId, services.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "service_task_templates_workspace_template_foreign_key",
      columns: [table.workspaceId, table.deliveryTemplateId],
      foreignColumns: [deliveryTemplates.workspaceId, deliveryTemplates.id],
    }).onDelete("cascade"),
    index("service_task_templates_workspace_service_order_index").on(
      table.workspaceId,
      table.serviceId,
      table.sortOrder,
      table.id,
    ),
    index("service_task_templates_workspace_template_index").on(
      table.workspaceId,
      table.deliveryTemplateId,
    ),
    check(
      "service_task_templates_name_not_blank",
      sql`length(btrim(${table.name})) > 0`,
    ),
    check(
      "service_task_templates_sort_order_non_negative",
      sql`${table.sortOrder} >= 0`,
    ),
    check(
      "service_task_templates_updated_not_before_creation",
      sql`${table.updatedAt} >= ${table.createdAt}`,
    ),
  ],
);

export const deliveryTemplateSubtasks = applicationSchema.table(
  "delivery_template_subtasks",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    deliveryTemplateId: uuid("delivery_template_id").notNull(),
    name: varchar("name", { length: 140 }).notNull(),
    durationMinutes: integer("duration_minutes").notNull(),
    defaultStatusKey: varchar("default_status_key", { length: 64 })
      .default("pendente")
      .notNull(),
    sortOrder: integer("sort_order").default(0).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    foreignKey({
      name: "delivery_template_subtasks_workspace_template_foreign_key",
      columns: [table.workspaceId, table.deliveryTemplateId],
      foreignColumns: [deliveryTemplates.workspaceId, deliveryTemplates.id],
    }).onDelete("cascade"),
    index("delivery_template_subtasks_workspace_template_order_index").on(
      table.workspaceId,
      table.deliveryTemplateId,
      table.sortOrder,
      table.id,
    ),
    check(
      "delivery_template_subtasks_name_not_blank",
      sql`length(btrim(${table.name})) > 0`,
    ),
    check(
      "delivery_template_subtasks_duration_range",
      sql`${table.durationMinutes} between 30 and 10080`,
    ),
    check(
      "delivery_template_subtasks_duration_half_hour",
      sql`${table.durationMinutes} % 30 = 0`,
    ),
    check(
      "delivery_template_subtasks_status_normalized",
      sql`${table.defaultStatusKey} = lower(btrim(${table.defaultStatusKey}))`,
    ),
    check(
      "delivery_template_subtasks_status_format",
      sql`${table.defaultStatusKey} ~ '^[a-z0-9][a-z0-9_-]{0,63}$'`,
    ),
    check(
      "delivery_template_subtasks_sort_order_non_negative",
      sql`${table.sortOrder} >= 0`,
    ),
    check(
      "delivery_template_subtasks_updated_not_before_creation",
      sql`${table.updatedAt} >= ${table.createdAt}`,
    ),
  ],
);

export const deliveryTemplateTags = applicationSchema.table(
  "delivery_template_tags",
  {
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    deliveryTemplateId: uuid("delivery_template_id").notNull(),
    tagId: uuid("tag_id").notNull(),
    sortOrder: integer("sort_order").default(0).notNull(),
  },
  (table) => [
    primaryKey({
      name: "delivery_template_tags_workspace_template_tag_primary_key",
      columns: [table.workspaceId, table.deliveryTemplateId, table.tagId],
    }),
    foreignKey({
      name: "delivery_template_tags_workspace_template_foreign_key",
      columns: [table.workspaceId, table.deliveryTemplateId],
      foreignColumns: [deliveryTemplates.workspaceId, deliveryTemplates.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "delivery_template_tags_workspace_tag_foreign_key",
      columns: [table.workspaceId, table.tagId],
      foreignColumns: [tags.workspaceId, tags.id],
    }),
    check(
      "delivery_template_tags_sort_order_non_negative",
      sql`${table.sortOrder} >= 0`,
    ),
  ],
);

export const deliveryTemplateResponsibles = applicationSchema.table(
  "delivery_template_responsibles",
  {
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    deliveryTemplateId: uuid("delivery_template_id").notNull(),
    userId: uuid("user_id").notNull(),
    sortOrder: integer("sort_order").default(0).notNull(),
  },
  (table) => [
    primaryKey({
      name: "delivery_template_responsibles_workspace_template_user_primary_key",
      columns: [table.workspaceId, table.deliveryTemplateId, table.userId],
    }),
    foreignKey({
      name: "delivery_template_responsibles_workspace_template_foreign_key",
      columns: [table.workspaceId, table.deliveryTemplateId],
      foreignColumns: [deliveryTemplates.workspaceId, deliveryTemplates.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "delivery_template_responsibles_workspace_member_foreign_key",
      columns: [table.workspaceId, table.userId],
      foreignColumns: [workspaceMembers.workspaceId, workspaceMembers.userId],
    }).onDelete("cascade"),
    check(
      "delivery_template_responsibles_sort_order_non_negative",
      sql`${table.sortOrder} >= 0`,
    ),
  ],
);

export const projects = applicationSchema.table(
  "projects",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    businessId: uuid("business_id")
      .notNull()
      .references(() => businesses.id),
    sourceServiceId: uuid("source_service_id"),
    isInstitutional: boolean("is_institutional").default(false).notNull(),
    name: varchar("name", { length: 140 }).notNull(),
    statusKey: varchar("status_key", { length: 64 }).notNull(),
    briefing: text("briefing").default("").notNull(),
    startDate: date("start_date", { mode: "string" }),
    endDate: date("end_date", { mode: "string" }),
    contractType: varchar("contract_type", { length: 16 })
      .default("one_off")
      .notNull(),
    amountCents: bigint("amount_cents", { mode: "number" }),
    firstDueDate: date("first_due_date", { mode: "string" }),
    paymentMethod: varchar("payment_method", { length: 120 }),
    paymentTerms: text("payment_terms"),
    financeNotes: text("finance_notes"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    archivedAt: timestamp("archived_at", {
      withTimezone: true,
      precision: 3,
    }),
  },
  (table) => [
    unique("projects_workspace_id_id_unique").on(table.workspaceId, table.id),
    unique("projects_workspace_id_business_id_unique").on(
      table.workspaceId,
      table.id,
      table.businessId,
    ),
    uniqueIndex("projects_workspace_business_institutional_unique")
      .on(table.workspaceId, table.businessId)
      .where(sql`${table.isInstitutional}`),
    foreignKey({
      name: "projects_workspace_source_service_foreign_key",
      columns: [table.workspaceId, table.sourceServiceId],
      foreignColumns: [services.workspaceId, services.id],
    }),
    index("projects_workspace_updated_id_index").on(
      table.workspaceId,
      table.updatedAt,
      table.id,
    ),
    index("projects_workspace_status_archived_index").on(
      table.workspaceId,
      table.statusKey,
      table.archivedAt,
    ),
    index("projects_workspace_business_archived_index").on(
      table.workspaceId,
      table.businessId,
      table.archivedAt,
    ),
    index("projects_workspace_source_service_index").on(
      table.workspaceId,
      table.sourceServiceId,
    ),
    index("projects_workspace_name_lower_index").on(
      table.workspaceId,
      sql`lower(${table.name})`,
    ),
    index("projects_name_search_index").using(
      "gin",
      sql`to_tsvector('simple', lower(${table.name}))`,
    ),
    index("projects_workspace_end_status_archive_index").on(
      table.workspaceId,
      table.endDate,
      table.statusKey,
      table.archivedAt,
    ),
    check("projects_name_not_blank", sql`length(btrim(${table.name})) > 0`),
    check(
      "projects_status_key_normalized",
      sql`${table.statusKey} = lower(btrim(${table.statusKey}))`,
    ),
    check(
      "projects_status_key_format",
      sql`${table.statusKey} ~ '^[a-z0-9][a-z0-9_-]{0,63}$'`,
    ),
    check(
      "projects_status_not_archived",
      sql`${table.statusKey} <> 'arquivado'`,
    ),
    check(
      "projects_contract_type_allowed",
      sql`${table.contractType} in ('one_off', 'recurring')`,
    ),
    check(
      "projects_amount_cents_safe",
      sql`${table.amountCents} is null or ${table.amountCents} between 0 and 9007199254740991`,
    ),
    check(
      "projects_dates_ordered",
      sql`${table.startDate} is null or ${table.endDate} is null or ${table.endDate} >= ${table.startDate}`,
    ),
    check(
      "projects_payment_method_not_blank",
      sql`${table.paymentMethod} is null or length(btrim(${table.paymentMethod})) > 0`,
    ),
    check(
      "projects_updated_not_before_creation",
      sql`${table.updatedAt} >= ${table.createdAt}`,
    ),
    check(
      "projects_archive_not_before_creation",
      sql`${table.archivedAt} is null or ${table.archivedAt} >= ${table.createdAt}`,
    ),
    check(
      "projects_institutional_not_archived",
      sql`not ${table.isInstitutional} or ${table.archivedAt} is null`,
    ),
  ],
);

export const projectServices = applicationSchema.table(
  "project_services",
  {
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    projectId: uuid("project_id").notNull(),
    serviceId: uuid("service_id").notNull(),
    sortOrder: integer("sort_order").default(0).notNull(),
  },
  (table) => [
    primaryKey({
      name: "project_services_workspace_project_service_primary_key",
      columns: [table.workspaceId, table.projectId, table.serviceId],
    }),
    foreignKey({
      name: "project_services_workspace_project_foreign_key",
      columns: [table.workspaceId, table.projectId],
      foreignColumns: [projects.workspaceId, projects.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "project_services_workspace_service_foreign_key",
      columns: [table.workspaceId, table.serviceId],
      foreignColumns: [services.workspaceId, services.id],
    }),
    index("project_services_workspace_project_order_index").on(
      table.workspaceId,
      table.projectId,
      table.sortOrder,
      table.serviceId,
    ),
    index("project_services_workspace_service_project_index").on(
      table.workspaceId,
      table.serviceId,
      table.projectId,
    ),
    check(
      "project_services_sort_order_non_negative",
      sql`${table.sortOrder} >= 0`,
    ),
  ],
);

export const projectTags = applicationSchema.table(
  "project_tags",
  {
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    projectId: uuid("project_id").notNull(),
    tagId: uuid("tag_id").notNull(),
    sortOrder: integer("sort_order").default(0).notNull(),
  },
  (table) => [
    primaryKey({
      name: "project_tags_workspace_project_tag_primary_key",
      columns: [table.workspaceId, table.projectId, table.tagId],
    }),
    foreignKey({
      name: "project_tags_workspace_project_foreign_key",
      columns: [table.workspaceId, table.projectId],
      foreignColumns: [projects.workspaceId, projects.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "project_tags_workspace_tag_foreign_key",
      columns: [table.workspaceId, table.tagId],
      foreignColumns: [tags.workspaceId, tags.id],
    }),
    index("project_tags_workspace_project_order_index").on(
      table.workspaceId,
      table.projectId,
      table.sortOrder,
      table.tagId,
    ),
    index("project_tags_workspace_tag_project_index").on(
      table.workspaceId,
      table.tagId,
      table.projectId,
    ),
    check("project_tags_sort_order_non_negative", sql`${table.sortOrder} >= 0`),
  ],
);

export const projectResponsibles = applicationSchema.table(
  "project_responsibles",
  {
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    projectId: uuid("project_id").notNull(),
    userId: uuid("user_id").notNull(),
    sortOrder: integer("sort_order").default(0).notNull(),
  },
  (table) => [
    primaryKey({
      name: "project_responsibles_workspace_project_user_primary_key",
      columns: [table.workspaceId, table.projectId, table.userId],
    }),
    foreignKey({
      name: "project_responsibles_workspace_project_foreign_key",
      columns: [table.workspaceId, table.projectId],
      foreignColumns: [projects.workspaceId, projects.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "project_responsibles_workspace_member_foreign_key",
      columns: [table.workspaceId, table.userId],
      foreignColumns: [workspaceMembers.workspaceId, workspaceMembers.userId],
    }).onDelete("cascade"),
    index("project_responsibles_workspace_project_order_index").on(
      table.workspaceId,
      table.projectId,
      table.sortOrder,
      table.userId,
    ),
    index("project_responsibles_workspace_user_project_index").on(
      table.workspaceId,
      table.userId,
      table.projectId,
    ),
    check(
      "project_responsibles_sort_order_non_negative",
      sql`${table.sortOrder} >= 0`,
    ),
  ],
);

export const projectInstallments = applicationSchema.table(
  "project_installments",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    projectId: uuid("project_id").notNull(),
    number: integer("number").notNull(),
    dueDate: date("due_date", { mode: "string" }).notNull(),
    amountCents: bigint("amount_cents", { mode: "number" }).notNull(),
    statusKey: varchar("status_key", { length: 64 }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    unique("project_installments_workspace_id_id_unique").on(
      table.workspaceId,
      table.id,
    ),
    unique("project_installments_project_number_unique").on(
      table.workspaceId,
      table.projectId,
      table.number,
    ),
    foreignKey({
      name: "project_installments_workspace_project_foreign_key",
      columns: [table.workspaceId, table.projectId],
      foreignColumns: [projects.workspaceId, projects.id],
    }).onDelete("cascade"),
    index("project_installments_workspace_project_number_index").on(
      table.workspaceId,
      table.projectId,
      table.number,
    ),
    index("project_installments_workspace_due_status_index").on(
      table.workspaceId,
      table.dueDate,
      table.statusKey,
    ),
    check(
      "project_installments_number_range",
      sql`${table.number} between 1 and 999`,
    ),
    check(
      "project_installments_amount_safe",
      sql`${table.amountCents} between 0 and 9007199254740991`,
    ),
    check(
      "project_installments_status_normalized",
      sql`${table.statusKey} is null or ${table.statusKey} = lower(btrim(${table.statusKey}))`,
    ),
    check(
      "project_installments_status_format",
      sql`${table.statusKey} is null or ${table.statusKey} ~ '^[a-z0-9][a-z0-9_-]{0,63}$'`,
    ),
    check(
      "project_installments_updated_not_before_creation",
      sql`${table.updatedAt} >= ${table.createdAt}`,
    ),
  ],
);

export const financialEntries = applicationSchema.table(
  "financial_entries",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    projectId: uuid("project_id"),
    projectInstallmentId: uuid("project_installment_id"),
    source: varchar("source", { length: 16 })
      .$type<"manual" | "project">()
      .notNull(),
    type: varchar("type", { length: 16 })
      .$type<"revenue" | "expense">()
      .notNull(),
    mode: varchar("mode", { length: 16 })
      .$type<"one_off" | "recurring">()
      .notNull(),
    title: varchar("title", { length: 160 }).notNull(),
    category: varchar("category", { length: 120 }).default("").notNull(),
    notes: text("notes").default("").notNull(),
    amount: numeric("amount", { precision: 18, scale: 2 }).notNull(),
    competenceDate: date("competence_date", { mode: "string" }).notNull(),
    dueDate: date("due_date", { mode: "string" }).notNull(),
    status: varchar("status", { length: 16 })
      .$type<"open" | "paused" | "settled">()
      .default("open")
      .notNull(),
    settledAt: timestamp("settled_at", {
      withTimezone: true,
      precision: 3,
    }),
    settledByUserId: uuid("settled_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    seriesId: uuid("series_id"),
    seriesKind: varchar("series_kind", { length: 16 }).$type<
      "installment" | "recurrence"
    >(),
    seriesNumber: integer("series_number"),
    seriesCount: integer("series_count"),
    version: integer("version").default(1).notNull(),
    createdByUserId: uuid("created_by_user_id")
      .notNull()
      .references(() => users.id),
    updatedByUserId: uuid("updated_by_user_id")
      .notNull()
      .references(() => users.id),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: timestamp("deleted_at", {
      withTimezone: true,
      precision: 3,
    }),
  },
  (table) => [
    unique("financial_entries_workspace_id_id_unique").on(
      table.workspaceId,
      table.id,
    ),
    unique("financial_entries_workspace_project_installment_unique").on(
      table.workspaceId,
      table.projectInstallmentId,
    ),
    foreignKey({
      name: "financial_entries_workspace_project_foreign_key",
      columns: [table.workspaceId, table.projectId],
      foreignColumns: [projects.workspaceId, projects.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "financial_entries_workspace_project_installment_foreign_key",
      columns: [table.workspaceId, table.projectInstallmentId],
      foreignColumns: [projectInstallments.workspaceId, projectInstallments.id],
    }).onDelete("cascade"),
    index("financial_entries_workspace_due_status_index").on(
      table.workspaceId,
      table.dueDate,
      table.status,
      table.deletedAt,
      table.id,
    ),
    index("financial_entries_workspace_competence_type_index").on(
      table.workspaceId,
      table.competenceDate,
      table.type,
      table.deletedAt,
      table.id,
    ),
    index("financial_entries_workspace_series_index").on(
      table.workspaceId,
      table.seriesId,
      table.seriesNumber,
    ),
    index("financial_entries_workspace_project_index").on(
      table.workspaceId,
      table.projectId,
      table.deletedAt,
    ),
    check(
      "financial_entries_source_allowed",
      sql`${table.source} in ('manual', 'project')`,
    ),
    check(
      "financial_entries_source_consistent",
      sql`(${table.source} = 'manual' and ${table.projectId} is null and ${table.projectInstallmentId} is null)
        or (${table.source} = 'project' and ${table.projectId} is not null and ${table.projectInstallmentId} is not null)`,
    ),
    check(
      "financial_entries_type_allowed",
      sql`${table.type} in ('revenue', 'expense')`,
    ),
    check(
      "financial_entries_mode_allowed",
      sql`${table.mode} in ('one_off', 'recurring')`,
    ),
    check(
      "financial_entries_title_not_blank",
      sql`length(btrim(${table.title})) > 0`,
    ),
    check(
      "financial_entries_amount_positive",
      sql`${table.amount} > 0 and ${table.amount} <= 9999999999999999.99`,
    ),
    check(
      "financial_entries_status_allowed",
      sql`${table.status} in ('open', 'paused', 'settled')`,
    ),
    check(
      "financial_entries_settlement_consistent",
      sql`(${table.status} = 'settled') = (${table.settledAt} is not null)`,
    ),
    check(
      "financial_entries_series_consistent",
      sql`(${table.seriesKind} is null and ${table.seriesId} is null and ${table.seriesNumber} is null and ${table.seriesCount} is null)
        or (${table.seriesKind} in ('installment', 'recurrence') and ${table.seriesId} is not null and ${table.seriesNumber} between 1 and 999 and ${table.seriesCount} between 1 and 999 and ${table.seriesNumber} <= ${table.seriesCount})`,
    ),
    check("financial_entries_version_positive", sql`${table.version} > 0`),
    check(
      "financial_entries_updated_not_before_creation",
      sql`${table.updatedAt} >= ${table.createdAt}`,
    ),
    check(
      "financial_entries_deleted_not_before_creation",
      sql`${table.deletedAt} is null or ${table.deletedAt} >= ${table.createdAt}`,
    ),
  ],
);

export const tasks = applicationSchema.table(
  "tasks",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    projectId: uuid("project_id").notNull(),
    businessId: uuid("business_id").notNull(),
    name: varchar("name", { length: 140 }).notNull(),
    description: text("description").default("").notNull(),
    categoryKey: varchar("category_key", { length: 64 }),
    priorityKey: varchar("priority_key", { length: 64 })
      .default("normal")
      .notNull(),
    statusKey: varchar("status_key", { length: 64 })
      .default("planejamento")
      .notNull(),
    dueDate: date("due_date", { mode: "string" }),
    sortOrder: integer("sort_order").default(0).notNull(),
    boardOrder: jsonb("board_order")
      .$type<TaskBoardOrder>()
      .default(sql`'{}'::jsonb`)
      .notNull(),
    version: integer("version").default(1).notNull(),
    completedAt: timestamp("completed_at", {
      withTimezone: true,
      precision: 3,
    }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    archivedAt: timestamp("archived_at", {
      withTimezone: true,
      precision: 3,
    }),
  },
  (table) => [
    unique("tasks_workspace_id_id_unique").on(table.workspaceId, table.id),
    foreignKey({
      name: "tasks_workspace_project_business_foreign_key",
      columns: [table.workspaceId, table.projectId, table.businessId],
      foreignColumns: [projects.workspaceId, projects.id, projects.businessId],
    })
      .onDelete("cascade")
      .onUpdate("cascade"),
    index("tasks_workspace_updated_id_index").on(
      table.workspaceId,
      table.updatedAt,
      table.id,
    ),
    index("tasks_workspace_project_archived_order_index").on(
      table.workspaceId,
      table.projectId,
      table.archivedAt,
      table.sortOrder,
      table.id,
    ),
    index("tasks_workspace_business_archived_order_index").on(
      table.workspaceId,
      table.businessId,
      table.archivedAt,
      table.sortOrder,
      table.id,
    ),
    index("tasks_workspace_status_archived_order_index").on(
      table.workspaceId,
      table.statusKey,
      table.archivedAt,
      table.sortOrder,
      table.id,
    ),
    index("tasks_workspace_priority_archived_order_index").on(
      table.workspaceId,
      table.priorityKey,
      table.archivedAt,
      table.sortOrder,
      table.id,
    ),
    index("tasks_workspace_due_completion_archive_index").on(
      table.workspaceId,
      table.dueDate,
      table.completedAt,
      table.archivedAt,
      table.id,
    ),
    index("tasks_workspace_name_lower_index").on(
      table.workspaceId,
      sql`lower(${table.name})`,
    ),
    index("tasks_name_search_index").using(
      "gin",
      sql`to_tsvector('simple', lower(${table.name}))`,
    ),
    check("tasks_name_not_blank", sql`length(btrim(${table.name})) > 0`),
    check(
      "tasks_category_normalized",
      sql`${table.categoryKey} is null or ${table.categoryKey} = lower(btrim(${table.categoryKey}))`,
    ),
    check(
      "tasks_category_format",
      sql`${table.categoryKey} is null or ${table.categoryKey} ~ '^[a-z0-9][a-z0-9_-]{0,63}$'`,
    ),
    check(
      "tasks_priority_normalized",
      sql`${table.priorityKey} = lower(btrim(${table.priorityKey}))`,
    ),
    check(
      "tasks_priority_format",
      sql`${table.priorityKey} ~ '^[a-z0-9][a-z0-9_-]{0,63}$'`,
    ),
    check(
      "tasks_status_normalized",
      sql`${table.statusKey} = lower(btrim(${table.statusKey}))`,
    ),
    check(
      "tasks_status_format",
      sql`${table.statusKey} ~ '^[a-z0-9][a-z0-9_-]{0,63}$'`,
    ),
    check("tasks_status_not_archived", sql`${table.statusKey} <> 'arquivado'`),
    check(
      "tasks_completion_status_consistent",
      sql`(${table.statusKey} = 'conclusao') = (${table.completedAt} is not null)`,
    ),
    check("tasks_sort_order_non_negative", sql`${table.sortOrder} >= 0`),
    check("tasks_version_positive", sql`${table.version} > 0`),
    check(
      "tasks_board_order_shape",
      sql`jsonb_typeof(${table.boardOrder}) = 'object'
        and ${table.boardOrder} - 'status' - 'priority' - 'business' - 'project' = '{}'::jsonb
        and (not (${table.boardOrder} ? 'status') or
          (jsonb_typeof(${table.boardOrder}->'status') = 'number' and
           ${table.boardOrder}->>'status' ~ '^[0-9]{1,9}$'))
        and (not (${table.boardOrder} ? 'priority') or
          (jsonb_typeof(${table.boardOrder}->'priority') = 'number' and
           ${table.boardOrder}->>'priority' ~ '^[0-9]{1,9}$'))
        and (not (${table.boardOrder} ? 'business') or
          (jsonb_typeof(${table.boardOrder}->'business') = 'number' and
           ${table.boardOrder}->>'business' ~ '^[0-9]{1,9}$'))
        and (not (${table.boardOrder} ? 'project') or
          (jsonb_typeof(${table.boardOrder}->'project') = 'number' and
           ${table.boardOrder}->>'project' ~ '^[0-9]{1,9}$'))`,
    ),
    check(
      "tasks_updated_not_before_creation",
      sql`${table.updatedAt} >= ${table.createdAt}`,
    ),
    check(
      "tasks_completion_not_before_creation",
      sql`${table.completedAt} is null or ${table.completedAt} >= ${table.createdAt}`,
    ),
    check(
      "tasks_archive_not_before_creation",
      sql`${table.archivedAt} is null or ${table.archivedAt} >= ${table.createdAt}`,
    ),
  ],
);

export const taskSubtasks = applicationSchema.table(
  "task_subtasks",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    taskId: uuid("task_id").notNull(),
    name: varchar("name", { length: 120 }).notNull(),
    durationMinutes: integer("duration_minutes").default(60).notNull(),
    statusKey: varchar("status_key", { length: 64 })
      .default("pendente")
      .notNull(),
    sortOrder: integer("sort_order").default(0).notNull(),
    completedAt: timestamp("completed_at", {
      withTimezone: true,
      precision: 3,
    }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    archivedAt: timestamp("archived_at", {
      withTimezone: true,
      precision: 3,
    }),
  },
  (table) => [
    unique("task_subtasks_workspace_id_id_unique").on(
      table.workspaceId,
      table.id,
    ),
    unique("task_subtasks_workspace_id_task_unique").on(
      table.workspaceId,
      table.id,
      table.taskId,
    ),
    foreignKey({
      name: "task_subtasks_workspace_task_foreign_key",
      columns: [table.workspaceId, table.taskId],
      foreignColumns: [tasks.workspaceId, tasks.id],
    }).onDelete("cascade"),
    index("task_subtasks_workspace_task_archived_order_index").on(
      table.workspaceId,
      table.taskId,
      table.archivedAt,
      table.sortOrder,
      table.id,
    ),
    index("task_subtasks_workspace_status_completion_index").on(
      table.workspaceId,
      table.statusKey,
      table.completedAt,
      table.id,
    ),
    check(
      "task_subtasks_name_not_blank",
      sql`length(btrim(${table.name})) > 0`,
    ),
    check(
      "task_subtasks_duration_range",
      sql`${table.durationMinutes} between 30 and 10080`,
    ),
    check(
      "task_subtasks_duration_half_hour",
      sql`${table.durationMinutes} % 30 = 0`,
    ),
    check(
      "task_subtasks_status_normalized",
      sql`${table.statusKey} = lower(btrim(${table.statusKey}))`,
    ),
    check(
      "task_subtasks_status_format",
      sql`${table.statusKey} ~ '^[a-z0-9][a-z0-9_-]{0,63}$'`,
    ),
    check(
      "task_subtasks_status_not_archived",
      sql`${table.statusKey} <> 'arquivado'`,
    ),
    check(
      "task_subtasks_completion_status_consistent",
      sql`(${table.statusKey} = 'concluida') = (${table.completedAt} is not null)`,
    ),
    check(
      "task_subtasks_sort_order_non_negative",
      sql`${table.sortOrder} >= 0`,
    ),
    check(
      "task_subtasks_updated_not_before_creation",
      sql`${table.updatedAt} >= ${table.createdAt}`,
    ),
    check(
      "task_subtasks_completion_not_before_creation",
      sql`${table.completedAt} is null or ${table.completedAt} >= ${table.createdAt}`,
    ),
    check(
      "task_subtasks_archive_not_before_creation",
      sql`${table.archivedAt} is null or ${table.archivedAt} >= ${table.createdAt}`,
    ),
  ],
);

export const taskResponsibles = applicationSchema.table(
  "task_responsibles",
  {
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    taskId: uuid("task_id").notNull(),
    userId: uuid("user_id").notNull(),
    sortOrder: integer("sort_order").default(0).notNull(),
  },
  (table) => [
    primaryKey({
      name: "task_responsibles_workspace_task_user_primary_key",
      columns: [table.workspaceId, table.taskId, table.userId],
    }),
    unique("task_responsibles_workspace_task_unique").on(
      table.workspaceId,
      table.taskId,
    ),
    foreignKey({
      name: "task_responsibles_workspace_task_foreign_key",
      columns: [table.workspaceId, table.taskId],
      foreignColumns: [tasks.workspaceId, tasks.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "task_responsibles_workspace_member_foreign_key",
      columns: [table.workspaceId, table.userId],
      foreignColumns: [workspaceMembers.workspaceId, workspaceMembers.userId],
    }).onDelete("cascade"),
    index("task_responsibles_workspace_task_order_index").on(
      table.workspaceId,
      table.taskId,
      table.sortOrder,
      table.userId,
    ),
    index("task_responsibles_workspace_user_task_index").on(
      table.workspaceId,
      table.userId,
      table.taskId,
    ),
    check(
      "task_responsibles_sort_order_non_negative",
      sql`${table.sortOrder} >= 0`,
    ),
  ],
);

export const taskTags = applicationSchema.table(
  "task_tags",
  {
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    taskId: uuid("task_id").notNull(),
    tagId: uuid("tag_id").notNull(),
    sortOrder: integer("sort_order").default(0).notNull(),
  },
  (table) => [
    primaryKey({
      name: "task_tags_workspace_task_tag_primary_key",
      columns: [table.workspaceId, table.taskId, table.tagId],
    }),
    foreignKey({
      name: "task_tags_workspace_task_foreign_key",
      columns: [table.workspaceId, table.taskId],
      foreignColumns: [tasks.workspaceId, tasks.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "task_tags_workspace_tag_foreign_key",
      columns: [table.workspaceId, table.tagId],
      foreignColumns: [tags.workspaceId, tags.id],
    }),
    index("task_tags_workspace_task_order_index").on(
      table.workspaceId,
      table.taskId,
      table.sortOrder,
      table.tagId,
    ),
    index("task_tags_workspace_tag_task_index").on(
      table.workspaceId,
      table.tagId,
      table.taskId,
    ),
    check("task_tags_sort_order_non_negative", sql`${table.sortOrder} >= 0`),
  ],
);

export const toolModels = applicationSchema.table(
  "tool_models",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    createdByUserId: uuid("created_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    toolKey: varchar("tool_key", { length: 32 }).$type<ToolKey>().notNull(),
    name: varchar("name", { length: 120 }).notNull(),
    description: varchar("description", { length: 500 }).default("").notNull(),
    config: jsonb("config").$type<ToolConfig>().notNull(),
    version: integer("version").default(1).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    archivedAt: timestamp("archived_at", {
      withTimezone: true,
      precision: 3,
    }),
  },
  (table) => [
    unique("tool_models_workspace_id_id_unique").on(
      table.workspaceId,
      table.id,
    ),
    index("tool_models_workspace_tool_archived_updated_index").on(
      table.workspaceId,
      table.toolKey,
      table.archivedAt,
      table.updatedAt,
      table.id,
    ),
    index("tool_models_workspace_name_lower_index").on(
      table.workspaceId,
      sql`lower(${table.name})`,
    ),
    check(
      "tool_models_tool_key_allowed",
      sql`${table.toolKey} in ('form', 'evaluation', 'comparison', 'intensity')`,
    ),
    check("tool_models_name_not_blank", sql`length(btrim(${table.name})) > 0`),
    check(
      "tool_models_config_object",
      sql`jsonb_typeof(${table.config}) = 'object'`,
    ),
    check("tool_models_version_positive", sql`${table.version} > 0`),
    check(
      "tool_models_updated_not_before_creation",
      sql`${table.updatedAt} >= ${table.createdAt}`,
    ),
    check(
      "tool_models_archive_not_before_creation",
      sql`${table.archivedAt} is null or ${table.archivedAt} >= ${table.createdAt}`,
    ),
  ],
);

export const toolUses = applicationSchema.table(
  "tool_uses",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    createdByUserId: uuid("created_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    modelId: uuid("model_id").notNull(),
    taskId: uuid("task_id"),
    toolKey: varchar("tool_key", { length: 32 }).$type<ToolKey>().notNull(),
    name: varchar("name", { length: 140 }).notNull(),
    configSnapshot: jsonb("config_snapshot").$type<ToolConfig>().notNull(),
    content: jsonb("content").$type<ToolUseContent>().notNull(),
    status: varchar("status", { length: 16 })
      .$type<ToolUseStatus>()
      .default("draft")
      .notNull(),
    version: integer("version").default(1).notNull(),
    completedAt: timestamp("completed_at", {
      withTimezone: true,
      precision: 3,
    }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    archivedAt: timestamp("archived_at", {
      withTimezone: true,
      precision: 3,
    }),
  },
  (table) => [
    unique("tool_uses_workspace_id_id_unique").on(table.workspaceId, table.id),
    foreignKey({
      name: "tool_uses_workspace_model_foreign_key",
      columns: [table.workspaceId, table.modelId],
      foreignColumns: [toolModels.workspaceId, toolModels.id],
    }).onDelete("restrict"),
    foreignKey({
      name: "tool_uses_workspace_task_foreign_key",
      columns: [table.workspaceId, table.taskId],
      foreignColumns: [tasks.workspaceId, tasks.id],
    }).onDelete("cascade"),
    index("tool_uses_workspace_status_updated_index").on(
      table.workspaceId,
      table.status,
      table.updatedAt,
      table.id,
    ),
    index("tool_uses_workspace_tool_updated_index").on(
      table.workspaceId,
      table.toolKey,
      table.updatedAt,
      table.id,
    ),
    index("tool_uses_workspace_task_index").on(
      table.workspaceId,
      table.taskId,
      table.updatedAt,
    ),
    check(
      "tool_uses_tool_key_allowed",
      sql`${table.toolKey} in ('form', 'evaluation', 'comparison', 'intensity')`,
    ),
    check(
      "tool_uses_status_allowed",
      sql`${table.status} in ('draft', 'open', 'completed', 'archived')`,
    ),
    check("tool_uses_name_not_blank", sql`length(btrim(${table.name})) > 0`),
    check(
      "tool_uses_json_objects",
      sql`jsonb_typeof(${table.configSnapshot}) = 'object' and jsonb_typeof(${table.content}) = 'object'`,
    ),
    check("tool_uses_version_positive", sql`${table.version} > 0`),
    check(
      "tool_uses_completion_consistent",
      sql`(${table.status} = 'completed' and ${table.completedAt} is not null)
        or (${table.status} in ('draft', 'open') and ${table.completedAt} is null)
        or ${table.status} = 'archived'`,
    ),
    check(
      "tool_uses_archive_consistent",
      sql`(${table.status} = 'archived') = (${table.archivedAt} is not null)`,
    ),
    check(
      "tool_uses_updated_not_before_creation",
      sql`${table.updatedAt} >= ${table.createdAt}`,
    ),
  ],
);

export const toolResponses = applicationSchema.table(
  "tool_responses",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    useId: uuid("use_id").notNull(),
    respondentUserId: uuid("respondent_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    payload: jsonb("payload").$type<ToolResponsePayload>().notNull(),
    submittedAt: timestamp("submitted_at", {
      withTimezone: true,
      precision: 3,
    })
      .defaultNow()
      .notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    foreignKey({
      name: "tool_responses_workspace_use_foreign_key",
      columns: [table.workspaceId, table.useId],
      foreignColumns: [toolUses.workspaceId, toolUses.id],
    }).onDelete("cascade"),
    unique("tool_responses_workspace_use_respondent_unique").on(
      table.workspaceId,
      table.useId,
      table.respondentUserId,
    ),
    index("tool_responses_workspace_use_submitted_index").on(
      table.workspaceId,
      table.useId,
      table.submittedAt,
      table.id,
    ),
    check(
      "tool_responses_payload_object",
      sql`jsonb_typeof(${table.payload}) = 'object'`,
    ),
    check(
      "tool_responses_submission_not_before_creation",
      sql`${table.submittedAt} >= ${table.createdAt}`,
    ),
  ],
);

export const cronogramaBlocks = applicationSchema.table(
  "cronograma_blocks",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    taskId: uuid("task_id").notNull(),
    subtaskId: uuid("subtask_id").notNull(),
    scheduledDate: date("scheduled_date", { mode: "string" }).notNull(),
    startMinutes: integer("start_minutes").notNull(),
    durationMinutes: integer("duration_minutes").notNull(),
    version: integer("version").default(1).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    unique("cronograma_blocks_workspace_id_id_unique").on(
      table.workspaceId,
      table.id,
    ),
    unique("cronograma_blocks_workspace_subtask_unique").on(
      table.workspaceId,
      table.subtaskId,
    ),
    foreignKey({
      name: "cronograma_blocks_workspace_task_foreign_key",
      columns: [table.workspaceId, table.taskId],
      foreignColumns: [tasks.workspaceId, tasks.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "cronograma_blocks_workspace_subtask_foreign_key",
      columns: [table.workspaceId, table.subtaskId, table.taskId],
      foreignColumns: [
        taskSubtasks.workspaceId,
        taskSubtasks.id,
        taskSubtasks.taskId,
      ],
    }).onDelete("cascade"),
    index("cronograma_blocks_workspace_date_start_index").on(
      table.workspaceId,
      table.scheduledDate,
      table.startMinutes,
      table.id,
    ),
    index("cronograma_blocks_workspace_task_date_index").on(
      table.workspaceId,
      table.taskId,
      table.scheduledDate,
      table.startMinutes,
    ),
    check(
      "cronograma_blocks_start_half_hour",
      sql`${table.startMinutes} between 0 and 1410 and ${table.startMinutes} % 30 = 0`,
    ),
    check(
      "cronograma_blocks_duration_range",
      sql`${table.durationMinutes} between 30 and 480`,
    ),
    check(
      "cronograma_blocks_duration_half_hour",
      sql`${table.durationMinutes} % 30 = 0`,
    ),
    check(
      "cronograma_blocks_end_within_day",
      sql`${table.startMinutes} + ${table.durationMinutes} <= 1440`,
    ),
    check("cronograma_blocks_version_positive", sql`${table.version} > 0`),
    check(
      "cronograma_blocks_updated_not_before_creation",
      sql`${table.updatedAt} >= ${table.createdAt}`,
    ),
  ],
);

export const agendaEntries = applicationSchema.table(
  "agenda_entries",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    entityKind: varchar("entity_kind", { length: 16 })
      .$type<AgendaEntityKind>()
      .notNull(),
    projectId: uuid("project_id"),
    taskId: uuid("task_id"),
    scheduledDate: date("scheduled_date", { mode: "string" }),
    position: integer("position").default(0).notNull(),
    durationMinutes: integer("duration_minutes").default(60).notNull(),
    version: integer("version").default(1).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    unique("agenda_entries_workspace_id_id_unique").on(
      table.workspaceId,
      table.id,
    ),
    unique("agenda_entries_workspace_project_unique").on(
      table.workspaceId,
      table.projectId,
    ),
    unique("agenda_entries_workspace_task_unique").on(
      table.workspaceId,
      table.taskId,
    ),
    unique("agenda_entries_workspace_kind_date_position_unique")
      .on(
        table.workspaceId,
        table.entityKind,
        table.scheduledDate,
        table.position,
      )
      .nullsNotDistinct(),
    foreignKey({
      name: "agenda_entries_workspace_project_foreign_key",
      columns: [table.workspaceId, table.projectId],
      foreignColumns: [projects.workspaceId, projects.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "agenda_entries_workspace_task_foreign_key",
      columns: [table.workspaceId, table.taskId],
      foreignColumns: [tasks.workspaceId, tasks.id],
    }).onDelete("cascade"),
    index("agenda_entries_workspace_kind_date_position_index").on(
      table.workspaceId,
      table.entityKind,
      table.scheduledDate,
      table.position,
      table.id,
    ),
    check(
      "agenda_entries_entity_kind_allowed",
      sql`${table.entityKind} in ('project', 'task')`,
    ),
    check(
      "agenda_entries_entity_consistent",
      sql`(${table.entityKind} = 'project' and ${table.projectId} is not null and ${table.taskId} is null)
        or (${table.entityKind} = 'task' and ${table.taskId} is not null and ${table.projectId} is null)`,
    ),
    check("agenda_entries_position_non_negative", sql`${table.position} >= 0`),
    check(
      "agenda_entries_duration_range",
      sql`${table.durationMinutes} between 30 and 10080`,
    ),
    check(
      "agenda_entries_duration_half_hour",
      sql`${table.durationMinutes} % 30 = 0`,
    ),
    check("agenda_entries_version_positive", sql`${table.version} > 0`),
    check(
      "agenda_entries_updated_not_before_creation",
      sql`${table.updatedAt} >= ${table.createdAt}`,
    ),
  ],
);

export const usersRelations = relations(users, ({ one, many }) => ({
  credential: one(userCredentials),
  preferences: one(userPreferences),
  authSessions: many(authSessions),
  passwordResetTokens: many(passwordResetTokens),
  auditLogs: many(auditLogs),
  createdToolModels: many(toolModels, { relationName: "toolModelCreator" }),
  createdToolUses: many(toolUses, { relationName: "toolUseCreator" }),
  toolResponses: many(toolResponses, {
    relationName: "toolResponseRespondent",
  }),
  linkedContacts: many(contacts, { relationName: "contactLinkedUser" }),
  ownedWorkspaces: many(workspaces, { relationName: "workspaceOwner" }),
  workspaceMemberships: many(workspaceMembers),
  connectionsAsA: many(userConnections, { relationName: "connectionUserA" }),
  connectionsAsB: many(userConnections, { relationName: "connectionUserB" }),
  connectionRequestsAsA: many(connectionRequests, {
    relationName: "connectionRequestUserA",
  }),
  connectionRequestsAsB: many(connectionRequests, {
    relationName: "connectionRequestUserB",
  }),
  requestedConnections: many(connectionRequests, {
    relationName: "connectionRequestSender",
  }),
  socialPosts: many(socialPosts),
  ownedCommunities: many(communities, { relationName: "communityOwner" }),
  communityMemberships: many(communityMembers),
  sentWorkspaceInvitations: many(workspaceInvitations, {
    relationName: "workspaceInvitationSender",
  }),
  acceptedWorkspaceInvitations: many(workspaceInvitations, {
    relationName: "workspaceInvitationRecipient",
  }),
  businessResponsibilities: many(businessResponsibles, {
    relationName: "businessResponsibleUser",
  }),
  storedFiles: many(storedFiles),
}));

export const userPreferencesRelations = relations(
  userPreferences,
  ({ one }) => ({
    user: one(users, {
      fields: [userPreferences.userId],
      references: [users.id],
    }),
  }),
);

export const userCredentialsRelations = relations(
  userCredentials,
  ({ one }) => ({
    user: one(users, {
      fields: [userCredentials.userId],
      references: [users.id],
    }),
  }),
);

export const authSessionsRelations = relations(authSessions, ({ one }) => ({
  user: one(users, {
    fields: [authSessions.userId],
    references: [users.id],
  }),
  activeWorkspace: one(workspaces, {
    fields: [authSessions.activeWorkspaceId],
    references: [workspaces.id],
  }),
}));

export const passwordResetTokensRelations = relations(
  passwordResetTokens,
  ({ one }) => ({
    user: one(users, {
      fields: [passwordResetTokens.userId],
      references: [users.id],
    }),
  }),
);

export const workspacesRelations = relations(workspaces, ({ one, many }) => ({
  owner: one(users, {
    fields: [workspaces.ownerUserId],
    references: [users.id],
    relationName: "workspaceOwner",
  }),
  members: many(workspaceMembers),
  invitations: many(workspaceInvitations),
  storedFiles: many(storedFiles),
  configuration: one(workspaceConfigurations),
  catalogEntries: many(workspaceCatalogEntries),
  activeSessions: many(authSessions),
  auditLogs: many(auditLogs),
  contacts: many(contacts),
  contactPhones: many(contactPhones),
  contactEmails: many(contactEmails),
  contactNotes: many(contactNotes),
  businesses: many(businesses),
  businessResponsibles: many(businessResponsibles),
  businessNotes: many(businessNotes),
  services: many(services),
  tags: many(tags),
  serviceTags: many(serviceTags),
  serviceResponsibles: many(serviceResponsibles),
  deliveryTemplates: many(deliveryTemplates),
  serviceTaskTemplates: many(serviceTaskTemplates),
  deliveryTemplateSubtasks: many(deliveryTemplateSubtasks),
  deliveryTemplateTags: many(deliveryTemplateTags),
  deliveryTemplateResponsibles: many(deliveryTemplateResponsibles),
  toolModels: many(toolModels),
  toolUses: many(toolUses),
  toolResponses: many(toolResponses),
  projects: many(projects),
  projectServices: many(projectServices),
  projectTags: many(projectTags),
  projectResponsibles: many(projectResponsibles),
  projectInstallments: many(projectInstallments),
  tasks: many(tasks),
  taskSubtasks: many(taskSubtasks),
  taskResponsibles: many(taskResponsibles),
  taskTags: many(taskTags),
  agendaEntries: many(agendaEntries),
}));

export const storedFilesRelations = relations(storedFiles, ({ one, many }) => ({
  workspace: one(workspaces, {
    fields: [storedFiles.workspaceId],
    references: [workspaces.id],
  }),
  owner: one(users, {
    fields: [storedFiles.ownerUserId],
    references: [users.id],
  }),
  socialBlocks: many(socialPostBlocks),
  communityCovers: many(communities),
}));

export const communitiesRelations = relations(communities, ({ one, many }) => ({
  owner: one(users, {
    fields: [communities.ownerUserId],
    references: [users.id],
    relationName: "communityOwner",
  }),
  cover: one(storedFiles, {
    fields: [communities.coverFileId],
    references: [storedFiles.id],
  }),
  members: many(communityMembers),
  posts: many(socialPosts),
}));

export const communityMembersRelations = relations(
  communityMembers,
  ({ one }) => ({
    community: one(communities, {
      fields: [communityMembers.communityId],
      references: [communities.id],
    }),
    user: one(users, {
      fields: [communityMembers.userId],
      references: [users.id],
    }),
  }),
);

export const socialPostsRelations = relations(socialPosts, ({ one, many }) => ({
  author: one(users, {
    fields: [socialPosts.authorUserId],
    references: [users.id],
  }),
  community: one(communities, {
    fields: [socialPosts.communityId],
    references: [communities.id],
  }),
  blocks: many(socialPostBlocks),
  likes: many(socialPostLikes),
  comments: many(socialPostComments),
}));

export const socialPostBlocksRelations = relations(
  socialPostBlocks,
  ({ one }) => ({
    post: one(socialPosts, {
      fields: [socialPostBlocks.postId],
      references: [socialPosts.id],
    }),
    file: one(storedFiles, {
      fields: [socialPostBlocks.fileId],
      references: [storedFiles.id],
    }),
  }),
);

export const socialPostLikesRelations = relations(
  socialPostLikes,
  ({ one }) => ({
    post: one(socialPosts, {
      fields: [socialPostLikes.postId],
      references: [socialPosts.id],
    }),
    user: one(users, {
      fields: [socialPostLikes.userId],
      references: [users.id],
    }),
  }),
);

export const socialPostCommentsRelations = relations(
  socialPostComments,
  ({ one, many }) => ({
    post: one(socialPosts, {
      fields: [socialPostComments.postId],
      references: [socialPosts.id],
    }),
    author: one(users, {
      fields: [socialPostComments.authorUserId],
      references: [users.id],
    }),
    parent: one(socialPostComments, {
      fields: [socialPostComments.parentCommentId],
      references: [socialPostComments.id],
      relationName: "commentReplies",
    }),
    replies: many(socialPostComments, { relationName: "commentReplies" }),
    likes: many(socialCommentLikes),
  }),
);

export const socialCommentLikesRelations = relations(
  socialCommentLikes,
  ({ one }) => ({
    comment: one(socialPostComments, {
      fields: [socialCommentLikes.commentId],
      references: [socialPostComments.id],
    }),
    user: one(users, {
      fields: [socialCommentLikes.userId],
      references: [users.id],
    }),
  }),
);

export const userStorageUsageRelations = relations(
  userStorageUsage,
  ({ one }) => ({
    user: one(users, {
      fields: [userStorageUsage.userId],
      references: [users.id],
    }),
  }),
);

export const workspaceConfigurationsRelations = relations(
  workspaceConfigurations,
  ({ one }) => ({
    workspace: one(workspaces, {
      fields: [workspaceConfigurations.workspaceId],
      references: [workspaces.id],
    }),
  }),
);

export const workspaceCatalogEntriesRelations = relations(
  workspaceCatalogEntries,
  ({ one }) => ({
    workspace: one(workspaces, {
      fields: [workspaceCatalogEntries.workspaceId],
      references: [workspaces.id],
    }),
  }),
);

export const workspaceMembersRelations = relations(
  workspaceMembers,
  ({ one, many }) => ({
    workspace: one(workspaces, {
      fields: [workspaceMembers.workspaceId],
      references: [workspaces.id],
    }),
    user: one(users, {
      fields: [workspaceMembers.userId],
      references: [users.id],
    }),
    linkedContacts: many(contacts, {
      relationName: "contactLinkedMembership",
    }),
    serviceResponsibilities: many(serviceResponsibles),
    deliveryTemplateResponsibilities: many(deliveryTemplateResponsibles),
    projectResponsibilities: many(projectResponsibles),
    taskResponsibilities: many(taskResponsibles),
  }),
);

export const userConnectionsRelations = relations(
  userConnections,
  ({ one }) => ({
    userA: one(users, {
      fields: [userConnections.userAId],
      references: [users.id],
      relationName: "connectionUserA",
    }),
    userB: one(users, {
      fields: [userConnections.userBId],
      references: [users.id],
      relationName: "connectionUserB",
    }),
  }),
);

export const connectionRequestsRelations = relations(
  connectionRequests,
  ({ one }) => ({
    userA: one(users, {
      fields: [connectionRequests.userAId],
      references: [users.id],
      relationName: "connectionRequestUserA",
    }),
    userB: one(users, {
      fields: [connectionRequests.userBId],
      references: [users.id],
      relationName: "connectionRequestUserB",
    }),
    requestedBy: one(users, {
      fields: [connectionRequests.requestedByUserId],
      references: [users.id],
      relationName: "connectionRequestSender",
    }),
  }),
);

export const workspaceInvitationsRelations = relations(
  workspaceInvitations,
  ({ one }) => ({
    workspace: one(workspaces, {
      fields: [workspaceInvitations.workspaceId],
      references: [workspaces.id],
    }),
    invitedBy: one(users, {
      fields: [workspaceInvitations.invitedByUserId],
      references: [users.id],
      relationName: "workspaceInvitationSender",
    }),
    acceptedBy: one(users, {
      fields: [workspaceInvitations.acceptedByUserId],
      references: [users.id],
      relationName: "workspaceInvitationRecipient",
    }),
  }),
);

export const auditLogsRelations = relations(auditLogs, ({ one }) => ({
  workspace: one(workspaces, {
    fields: [auditLogs.workspaceId],
    references: [workspaces.id],
  }),
  actor: one(users, {
    fields: [auditLogs.actorUserId],
    references: [users.id],
  }),
}));

export const contactsRelations = relations(contacts, ({ one, many }) => ({
  workspace: one(workspaces, {
    fields: [contacts.workspaceId],
    references: [workspaces.id],
  }),
  linkedUser: one(users, {
    fields: [contacts.linkedUserId],
    references: [users.id],
    relationName: "contactLinkedUser",
  }),
  owner: one(users, {
    fields: [contacts.ownerUserId],
    references: [users.id],
    relationName: "contactOwner",
  }),
  linkedMembership: one(workspaceMembers, {
    fields: [contacts.workspaceId, contacts.linkedUserId],
    references: [workspaceMembers.workspaceId, workspaceMembers.userId],
    relationName: "contactLinkedMembership",
  }),
  phones: many(contactPhones),
  emails: many(contactEmails),
  notes: many(contactNotes),
  businessResponsibilities: many(businessResponsibles),
}));

export const contactPhonesRelations = relations(contactPhones, ({ one }) => ({
  workspace: one(workspaces, {
    fields: [contactPhones.workspaceId],
    references: [workspaces.id],
  }),
  contact: one(contacts, {
    fields: [contactPhones.workspaceId, contactPhones.contactId],
    references: [contacts.workspaceId, contacts.id],
  }),
}));

export const contactEmailsRelations = relations(contactEmails, ({ one }) => ({
  workspace: one(workspaces, {
    fields: [contactEmails.workspaceId],
    references: [workspaces.id],
  }),
  contact: one(contacts, {
    fields: [contactEmails.workspaceId, contactEmails.contactId],
    references: [contacts.workspaceId, contacts.id],
  }),
}));

export const contactNotesRelations = relations(contactNotes, ({ one }) => ({
  workspace: one(workspaces, {
    fields: [contactNotes.workspaceId],
    references: [workspaces.id],
  }),
  contact: one(contacts, {
    fields: [contactNotes.workspaceId, contactNotes.contactId],
    references: [contacts.workspaceId, contacts.id],
  }),
}));

export const businessesRelations = relations(businesses, ({ one, many }) => ({
  workspace: one(workspaces, {
    fields: [businesses.workspaceId],
    references: [workspaces.id],
  }),
  owner: one(users, {
    fields: [businesses.ownerUserId],
    references: [users.id],
    relationName: "businessOwner",
  }),
  responsibles: many(businessResponsibles),
  notes: many(businessNotes),
  projects: many(projects),
  tasks: many(tasks),
}));

export const businessResponsiblesRelations = relations(
  businessResponsibles,
  ({ one }) => ({
    workspace: one(workspaces, {
      fields: [businessResponsibles.workspaceId],
      references: [workspaces.id],
    }),
    business: one(businesses, {
      fields: [
        businessResponsibles.workspaceId,
        businessResponsibles.businessId,
      ],
      references: [businesses.workspaceId, businesses.id],
    }),
    contact: one(contacts, {
      fields: [
        businessResponsibles.workspaceId,
        businessResponsibles.contactId,
      ],
      references: [contacts.workspaceId, contacts.id],
    }),
    user: one(users, {
      fields: [businessResponsibles.userId],
      references: [users.id],
      relationName: "businessResponsibleUser",
    }),
  }),
);

export const businessNotesRelations = relations(businessNotes, ({ one }) => ({
  workspace: one(workspaces, {
    fields: [businessNotes.workspaceId],
    references: [workspaces.id],
  }),
  business: one(businesses, {
    fields: [businessNotes.workspaceId, businessNotes.businessId],
    references: [businesses.workspaceId, businesses.id],
  }),
}));

export const servicesRelations = relations(services, ({ one, many }) => ({
  workspace: one(workspaces, {
    fields: [services.workspaceId],
    references: [workspaces.id],
  }),
  tags: many(serviceTags),
  responsibles: many(serviceResponsibles),
  projectLinks: many(projectServices),
  sourceProjects: many(projects, { relationName: "projectSourceService" }),
  deliveryTemplates: many(deliveryTemplates),
  taskTemplates: many(serviceTaskTemplates),
}));

export const tagsRelations = relations(tags, ({ one, many }) => ({
  workspace: one(workspaces, {
    fields: [tags.workspaceId],
    references: [workspaces.id],
  }),
  serviceLinks: many(serviceTags),
  projectLinks: many(projectTags),
  taskLinks: many(taskTags),
  deliveryTemplateLinks: many(deliveryTemplateTags),
}));

export const serviceTagsRelations = relations(serviceTags, ({ one }) => ({
  workspace: one(workspaces, {
    fields: [serviceTags.workspaceId],
    references: [workspaces.id],
  }),
  service: one(services, {
    fields: [serviceTags.workspaceId, serviceTags.serviceId],
    references: [services.workspaceId, services.id],
  }),
  tag: one(tags, {
    fields: [serviceTags.workspaceId, serviceTags.tagId],
    references: [tags.workspaceId, tags.id],
  }),
}));

export const serviceResponsiblesRelations = relations(
  serviceResponsibles,
  ({ one }) => ({
    workspace: one(workspaces, {
      fields: [serviceResponsibles.workspaceId],
      references: [workspaces.id],
    }),
    service: one(services, {
      fields: [serviceResponsibles.workspaceId, serviceResponsibles.serviceId],
      references: [services.workspaceId, services.id],
    }),
    member: one(workspaceMembers, {
      fields: [serviceResponsibles.workspaceId, serviceResponsibles.userId],
      references: [workspaceMembers.workspaceId, workspaceMembers.userId],
    }),
  }),
);

export const deliveryTemplatesRelations = relations(
  deliveryTemplates,
  ({ one, many }) => ({
    workspace: one(workspaces, {
      fields: [deliveryTemplates.workspaceId],
      references: [workspaces.id],
    }),
    service: one(services, {
      fields: [deliveryTemplates.workspaceId, deliveryTemplates.serviceId],
      references: [services.workspaceId, services.id],
    }),
    subtasks: many(deliveryTemplateSubtasks),
    tags: many(deliveryTemplateTags),
    responsibles: many(deliveryTemplateResponsibles),
    serviceLinks: many(serviceTaskTemplates),
  }),
);

export const serviceTaskTemplatesRelations = relations(
  serviceTaskTemplates,
  ({ one }) => ({
    workspace: one(workspaces, {
      fields: [serviceTaskTemplates.workspaceId],
      references: [workspaces.id],
    }),
    service: one(services, {
      fields: [
        serviceTaskTemplates.workspaceId,
        serviceTaskTemplates.serviceId,
      ],
      references: [services.workspaceId, services.id],
    }),
    template: one(deliveryTemplates, {
      fields: [
        serviceTaskTemplates.workspaceId,
        serviceTaskTemplates.deliveryTemplateId,
      ],
      references: [deliveryTemplates.workspaceId, deliveryTemplates.id],
    }),
  }),
);

export const deliveryTemplateSubtasksRelations = relations(
  deliveryTemplateSubtasks,
  ({ one }) => ({
    workspace: one(workspaces, {
      fields: [deliveryTemplateSubtasks.workspaceId],
      references: [workspaces.id],
    }),
    template: one(deliveryTemplates, {
      fields: [
        deliveryTemplateSubtasks.workspaceId,
        deliveryTemplateSubtasks.deliveryTemplateId,
      ],
      references: [deliveryTemplates.workspaceId, deliveryTemplates.id],
    }),
  }),
);

export const deliveryTemplateTagsRelations = relations(
  deliveryTemplateTags,
  ({ one }) => ({
    workspace: one(workspaces, {
      fields: [deliveryTemplateTags.workspaceId],
      references: [workspaces.id],
    }),
    template: one(deliveryTemplates, {
      fields: [
        deliveryTemplateTags.workspaceId,
        deliveryTemplateTags.deliveryTemplateId,
      ],
      references: [deliveryTemplates.workspaceId, deliveryTemplates.id],
    }),
    tag: one(tags, {
      fields: [deliveryTemplateTags.workspaceId, deliveryTemplateTags.tagId],
      references: [tags.workspaceId, tags.id],
    }),
  }),
);

export const deliveryTemplateResponsiblesRelations = relations(
  deliveryTemplateResponsibles,
  ({ one }) => ({
    workspace: one(workspaces, {
      fields: [deliveryTemplateResponsibles.workspaceId],
      references: [workspaces.id],
    }),
    template: one(deliveryTemplates, {
      fields: [
        deliveryTemplateResponsibles.workspaceId,
        deliveryTemplateResponsibles.deliveryTemplateId,
      ],
      references: [deliveryTemplates.workspaceId, deliveryTemplates.id],
    }),
    member: one(workspaceMembers, {
      fields: [
        deliveryTemplateResponsibles.workspaceId,
        deliveryTemplateResponsibles.userId,
      ],
      references: [workspaceMembers.workspaceId, workspaceMembers.userId],
    }),
  }),
);

export const projectsRelations = relations(projects, ({ one, many }) => ({
  workspace: one(workspaces, {
    fields: [projects.workspaceId],
    references: [workspaces.id],
  }),
  business: one(businesses, {
    fields: [projects.businessId],
    references: [businesses.id],
  }),
  sourceService: one(services, {
    fields: [projects.workspaceId, projects.sourceServiceId],
    references: [services.workspaceId, services.id],
    relationName: "projectSourceService",
  }),
  services: many(projectServices),
  tags: many(projectTags),
  responsibles: many(projectResponsibles),
  installments: many(projectInstallments),
  financialEntries: many(financialEntries),
  tasks: many(tasks),
  agendaEntry: one(agendaEntries),
}));

export const projectServicesRelations = relations(
  projectServices,
  ({ one }) => ({
    workspace: one(workspaces, {
      fields: [projectServices.workspaceId],
      references: [workspaces.id],
    }),
    project: one(projects, {
      fields: [projectServices.workspaceId, projectServices.projectId],
      references: [projects.workspaceId, projects.id],
    }),
    service: one(services, {
      fields: [projectServices.workspaceId, projectServices.serviceId],
      references: [services.workspaceId, services.id],
    }),
  }),
);

export const projectTagsRelations = relations(projectTags, ({ one }) => ({
  workspace: one(workspaces, {
    fields: [projectTags.workspaceId],
    references: [workspaces.id],
  }),
  project: one(projects, {
    fields: [projectTags.workspaceId, projectTags.projectId],
    references: [projects.workspaceId, projects.id],
  }),
  tag: one(tags, {
    fields: [projectTags.workspaceId, projectTags.tagId],
    references: [tags.workspaceId, tags.id],
  }),
}));

export const projectResponsiblesRelations = relations(
  projectResponsibles,
  ({ one }) => ({
    workspace: one(workspaces, {
      fields: [projectResponsibles.workspaceId],
      references: [workspaces.id],
    }),
    project: one(projects, {
      fields: [projectResponsibles.workspaceId, projectResponsibles.projectId],
      references: [projects.workspaceId, projects.id],
    }),
    member: one(workspaceMembers, {
      fields: [projectResponsibles.workspaceId, projectResponsibles.userId],
      references: [workspaceMembers.workspaceId, workspaceMembers.userId],
    }),
  }),
);

export const projectInstallmentsRelations = relations(
  projectInstallments,
  ({ one, many }) => ({
    workspace: one(workspaces, {
      fields: [projectInstallments.workspaceId],
      references: [workspaces.id],
    }),
    project: one(projects, {
      fields: [projectInstallments.workspaceId, projectInstallments.projectId],
      references: [projects.workspaceId, projects.id],
    }),
    financialEntries: many(financialEntries),
  }),
);

export const financialEntriesRelations = relations(
  financialEntries,
  ({ one }) => ({
    workspace: one(workspaces, {
      fields: [financialEntries.workspaceId],
      references: [workspaces.id],
    }),
    project: one(projects, {
      fields: [financialEntries.workspaceId, financialEntries.projectId],
      references: [projects.workspaceId, projects.id],
    }),
    projectInstallment: one(projectInstallments, {
      fields: [
        financialEntries.workspaceId,
        financialEntries.projectInstallmentId,
      ],
      references: [projectInstallments.workspaceId, projectInstallments.id],
    }),
    settledBy: one(users, {
      fields: [financialEntries.settledByUserId],
      references: [users.id],
    }),
  }),
);

export const tasksRelations = relations(tasks, ({ one, many }) => ({
  workspace: one(workspaces, {
    fields: [tasks.workspaceId],
    references: [workspaces.id],
  }),
  project: one(projects, {
    fields: [tasks.workspaceId, tasks.projectId, tasks.businessId],
    references: [projects.workspaceId, projects.id, projects.businessId],
  }),
  business: one(businesses, {
    fields: [tasks.businessId],
    references: [businesses.id],
  }),
  subtasks: many(taskSubtasks),
  responsibles: many(taskResponsibles),
  tags: many(taskTags),
  cronogramaBlocks: many(cronogramaBlocks),
  agendaEntry: one(agendaEntries),
  toolUses: many(toolUses),
}));

export const toolModelsRelations = relations(toolModels, ({ one, many }) => ({
  workspace: one(workspaces, {
    fields: [toolModels.workspaceId],
    references: [workspaces.id],
  }),
  creator: one(users, {
    fields: [toolModels.createdByUserId],
    references: [users.id],
    relationName: "toolModelCreator",
  }),
  uses: many(toolUses),
}));

export const toolUsesRelations = relations(toolUses, ({ one, many }) => ({
  workspace: one(workspaces, {
    fields: [toolUses.workspaceId],
    references: [workspaces.id],
  }),
  creator: one(users, {
    fields: [toolUses.createdByUserId],
    references: [users.id],
    relationName: "toolUseCreator",
  }),
  model: one(toolModels, {
    fields: [toolUses.workspaceId, toolUses.modelId],
    references: [toolModels.workspaceId, toolModels.id],
  }),
  task: one(tasks, {
    fields: [toolUses.workspaceId, toolUses.taskId],
    references: [tasks.workspaceId, tasks.id],
  }),
  responses: many(toolResponses),
}));

export const toolResponsesRelations = relations(toolResponses, ({ one }) => ({
  workspace: one(workspaces, {
    fields: [toolResponses.workspaceId],
    references: [workspaces.id],
  }),
  use: one(toolUses, {
    fields: [toolResponses.workspaceId, toolResponses.useId],
    references: [toolUses.workspaceId, toolUses.id],
  }),
  respondent: one(users, {
    fields: [toolResponses.respondentUserId],
    references: [users.id],
    relationName: "toolResponseRespondent",
  }),
}));

export const cronogramaBlocksRelations = relations(
  cronogramaBlocks,
  ({ one }) => ({
    workspace: one(workspaces, {
      fields: [cronogramaBlocks.workspaceId],
      references: [workspaces.id],
    }),
    task: one(tasks, {
      fields: [cronogramaBlocks.workspaceId, cronogramaBlocks.taskId],
      references: [tasks.workspaceId, tasks.id],
    }),
    subtask: one(taskSubtasks, {
      fields: [cronogramaBlocks.workspaceId, cronogramaBlocks.subtaskId],
      references: [taskSubtasks.workspaceId, taskSubtasks.id],
    }),
  }),
);

export const agendaEntriesRelations = relations(agendaEntries, ({ one }) => ({
  workspace: one(workspaces, {
    fields: [agendaEntries.workspaceId],
    references: [workspaces.id],
  }),
  project: one(projects, {
    fields: [agendaEntries.workspaceId, agendaEntries.projectId],
    references: [projects.workspaceId, projects.id],
  }),
  task: one(tasks, {
    fields: [agendaEntries.workspaceId, agendaEntries.taskId],
    references: [tasks.workspaceId, tasks.id],
  }),
}));

export const taskSubtasksRelations = relations(
  taskSubtasks,
  ({ one, many }) => ({
    workspace: one(workspaces, {
      fields: [taskSubtasks.workspaceId],
      references: [workspaces.id],
    }),
    task: one(tasks, {
      fields: [taskSubtasks.workspaceId, taskSubtasks.taskId],
      references: [tasks.workspaceId, tasks.id],
    }),
    cronogramaBlocks: many(cronogramaBlocks),
  }),
);

export const taskResponsiblesRelations = relations(
  taskResponsibles,
  ({ one }) => ({
    workspace: one(workspaces, {
      fields: [taskResponsibles.workspaceId],
      references: [workspaces.id],
    }),
    task: one(tasks, {
      fields: [taskResponsibles.workspaceId, taskResponsibles.taskId],
      references: [tasks.workspaceId, tasks.id],
    }),
    member: one(workspaceMembers, {
      fields: [taskResponsibles.workspaceId, taskResponsibles.userId],
      references: [workspaceMembers.workspaceId, workspaceMembers.userId],
    }),
  }),
);

export const taskTagsRelations = relations(taskTags, ({ one }) => ({
  workspace: one(workspaces, {
    fields: [taskTags.workspaceId],
    references: [workspaces.id],
  }),
  task: one(tasks, {
    fields: [taskTags.workspaceId, taskTags.taskId],
    references: [tasks.workspaceId, tasks.id],
  }),
  tag: one(tags, {
    fields: [taskTags.workspaceId, taskTags.tagId],
    references: [tags.workspaceId, tags.id],
  }),
}));
