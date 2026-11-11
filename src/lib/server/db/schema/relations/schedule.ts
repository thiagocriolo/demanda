import { relations } from "drizzle-orm";
import { projects } from "../projects";
import { agendaEntries, cronogramaBlocks } from "../schedule";
import { taskSubtasks, tasks } from "../tasks";
import { workspaces } from "../workspace";

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
