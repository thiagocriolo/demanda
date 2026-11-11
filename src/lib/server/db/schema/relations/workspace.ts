import { relations } from "drizzle-orm";
import { authSessions } from "../auth";
import {
  businessNotes,
  businessResponsibles,
  businesses,
  contactEmails,
  contactNotes,
  contactPhones,
  contacts,
} from "../crm";
import { agendaEntries } from "../schedule";
import { communities, socialPostBlocks } from "../social";
import {
  deliveryTemplateResponsibles,
  deliveryTemplateSubtasks,
  deliveryTemplateTags,
  deliveryTemplates,
  serviceResponsibles,
  serviceTags,
  serviceTaskTemplates,
  services,
  tags,
} from "../services";
import { taskResponsibles, taskSubtasks, taskTags, tasks } from "../tasks";
import { toolModels, toolResponses, toolUses } from "../tools";
import { financialEntries, projectInstallments } from "../finance";
import {
  projectResponsibles,
  projectServices,
  projectTags,
  projects,
} from "../projects";
import { users } from "../identity";
import {
  auditLogs,
  connectionRequests,
  storedFiles,
  userConnections,
  userStorageUsage,
  workspaceCatalogEntries,
  workspaceConfigurations,
  workspaceInvitations,
  workspaceMembers,
  workspaces,
} from "../workspace";

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
