import { relations } from "drizzle-orm";
import { projects } from "../projects";
import { agendaEntries, cronogramaBlocks } from "../schedule";
import { deliveryTasks, deliveries } from "../deliveries";
import { workspaces } from "../workspace";

export const cronogramaBlocksRelations = relations(
  cronogramaBlocks,
  ({ one }) => ({
    workspace: one(workspaces, {
      fields: [cronogramaBlocks.workspaceId],
      references: [workspaces.id],
    }),
    delivery: one(deliveries, {
      fields: [cronogramaBlocks.workspaceId, cronogramaBlocks.deliveryId],
      references: [deliveries.workspaceId, deliveries.id],
    }),
    task: one(deliveryTasks, {
      fields: [cronogramaBlocks.workspaceId, cronogramaBlocks.taskId],
      references: [deliveryTasks.workspaceId, deliveryTasks.id],
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
  delivery: one(deliveries, {
    fields: [agendaEntries.workspaceId, agendaEntries.deliveryId],
    references: [deliveries.workspaceId, deliveries.id],
  }),
}));
