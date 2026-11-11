import { relations } from "drizzle-orm";
import { authSessions, passwordResetTokens } from "../auth";
import { businessResponsibles } from "../crm";
import {
  auditLogs,
  connectionRequests,
  storedFiles,
  userConnections,
  workspaceInvitations,
  workspaceMembers,
  workspaces,
} from "../workspace";
import { communities, communityMembers, socialPosts } from "../social";
import { toolModels, toolResponses, toolUses } from "../tools";
import { contacts } from "../crm";
import { userCredentials, userPreferences, users } from "../identity";

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
