import { relations } from "drizzle-orm";
import { users } from "../identity";
import { tasks } from "../tasks";
import { toolModels, toolResponses, toolUses } from "../tools";
import { workspaces } from "../workspace";

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
