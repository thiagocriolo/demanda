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
  CommunityInvitationStatus,
  CommunityJoinRequestStatus,
  CommunityMemberRole,
  CommunityVisibility,
  SocialBlockKind,
  SocialPostKind,
} from "./enums";
import { users } from "./identity";
import { storedFiles } from "./workspace";

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
      (): AnyMySqlColumn => socialPostComments.id,
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
