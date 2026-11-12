import { relations } from "drizzle-orm";
import { businesses } from "../crm";
import { projects } from "../projects";
import { agendaEntries, cronogramaBlocks } from "../schedule";
import { tags } from "../services";
import {
  taskComments,
  taskResponsibles,
  taskSubtasks,
  taskTags,
  tasks,
} from "../tasks";
import { toolUses } from "../tools";
import { workspaceMembers, workspaces } from "../workspace";

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
  comments: many(taskComments),
}));

export const taskCommentsRelations = relations(taskComments, ({ one }) => ({
  workspace: one(workspaces, {
    fields: [taskComments.workspaceId],
    references: [workspaces.id],
  }),
  task: one(tasks, {
    fields: [taskComments.workspaceId, taskComments.taskId],
    references: [tasks.workspaceId, tasks.id],
  }),
  author: one(workspaceMembers, {
    fields: [taskComments.workspaceId, taskComments.authorUserId],
    references: [workspaceMembers.workspaceId, workspaceMembers.userId],
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
