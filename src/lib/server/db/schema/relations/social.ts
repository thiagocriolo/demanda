import { relations } from "drizzle-orm";
import { users } from "../identity";
import {
  communities,
  communityMembers,
  socialCommentLikes,
  socialPostBlocks,
  socialPostComments,
  socialPostLikes,
  socialPosts,
} from "../social";
import { storedFiles } from "../workspace";

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
