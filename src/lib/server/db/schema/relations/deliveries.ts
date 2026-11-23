import { relations } from "drizzle-orm";
import { businesses } from "../crm";
import { projects } from "../projects";
import { agendaEntries, cronogramaBlocks } from "../schedule";
import { tags } from "../services";
import {
  deliveryComments,
  deliveryResponsibles,
  deliveryTasks,
  deliveryTags,
  deliveries,
} from "../deliveries";
import { toolUses } from "../tools";
import { workspaceMembers, workspaces } from "../workspace";

export const deliveriesRelations = relations(deliveries, ({ one, many }) => ({
  workspace: one(workspaces, {
    fields: [deliveries.workspaceId],
    references: [workspaces.id],
  }),
  project: one(projects, {
    fields: [deliveries.workspaceId, deliveries.projectId, deliveries.businessId],
    references: [projects.workspaceId, projects.id, projects.businessId],
  }),
  business: one(businesses, {
    fields: [deliveries.businessId],
    references: [businesses.id],
  }),
  tasks: many(deliveryTasks),
  responsibles: many(deliveryResponsibles),
  tags: many(deliveryTags),
  cronogramaBlocks: many(cronogramaBlocks),
  agendaEntry: one(agendaEntries),
  toolUses: many(toolUses),
  comments: many(deliveryComments),
}));

export const deliveryCommentsRelations = relations(deliveryComments, ({ one }) => ({
  workspace: one(workspaces, {
    fields: [deliveryComments.workspaceId],
    references: [workspaces.id],
  }),
  delivery: one(deliveries, {
    fields: [deliveryComments.workspaceId, deliveryComments.deliveryId],
    references: [deliveries.workspaceId, deliveries.id],
  }),
  author: one(workspaceMembers, {
    fields: [deliveryComments.workspaceId, deliveryComments.authorUserId],
    references: [workspaceMembers.workspaceId, workspaceMembers.userId],
  }),
}));

export const deliveryTasksRelations = relations(
  deliveryTasks,
  ({ one, many }) => ({
    workspace: one(workspaces, {
      fields: [deliveryTasks.workspaceId],
      references: [workspaces.id],
    }),
    delivery: one(deliveries, {
      fields: [deliveryTasks.workspaceId, deliveryTasks.deliveryId],
      references: [deliveries.workspaceId, deliveries.id],
    }),
    cronogramaBlocks: many(cronogramaBlocks),
  }),
);

export const deliveryResponsiblesRelations = relations(
  deliveryResponsibles,
  ({ one }) => ({
    workspace: one(workspaces, {
      fields: [deliveryResponsibles.workspaceId],
      references: [workspaces.id],
    }),
    delivery: one(deliveries, {
      fields: [deliveryResponsibles.workspaceId, deliveryResponsibles.deliveryId],
      references: [deliveries.workspaceId, deliveries.id],
    }),
    member: one(workspaceMembers, {
      fields: [deliveryResponsibles.workspaceId, deliveryResponsibles.userId],
      references: [workspaceMembers.workspaceId, workspaceMembers.userId],
    }),
  }),
);

export const deliveryTagsRelations = relations(deliveryTags, ({ one }) => ({
  workspace: one(workspaces, {
    fields: [deliveryTags.workspaceId],
    references: [workspaces.id],
  }),
  delivery: one(deliveries, {
    fields: [deliveryTags.workspaceId, deliveryTags.deliveryId],
    references: [deliveries.workspaceId, deliveries.id],
  }),
  tag: one(tags, {
    fields: [deliveryTags.workspaceId, deliveryTags.tagId],
    references: [tags.workspaceId, tags.id],
  }),
}));
