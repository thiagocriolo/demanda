import { relations } from "drizzle-orm";
import { businesses } from "../crm";
import { financialEntries, projectInstallments } from "../finance";
import { users } from "../identity";
import {
  projectResponsibles,
  projectServices,
  projectTags,
  projects,
} from "../projects";
import { agendaEntries } from "../schedule";
import { services, tags } from "../services";
import { tasks } from "../tasks";
import { workspaceMembers, workspaces } from "../workspace";

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
