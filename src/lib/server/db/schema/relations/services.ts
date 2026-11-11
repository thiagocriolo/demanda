import { relations } from "drizzle-orm";
import { projects, projectServices, projectTags } from "../projects";
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
import { taskTags } from "../tasks";
import { workspaceMembers, workspaces } from "../workspace";

export const servicesRelations = relations(services, ({ one, many }) => ({
  workspace: one(workspaces, {
    fields: [services.workspaceId],
    references: [workspaces.id],
  }),
  tags: many(serviceTags),
  responsibles: many(serviceResponsibles),
  projectLinks: many(projectServices),
  sourceProjects: many(projects, { relationName: "projectSourceService" }),
  deliveryTemplates: many(deliveryTemplates),
  taskTemplates: many(serviceTaskTemplates),
}));

export const tagsRelations = relations(tags, ({ one, many }) => ({
  workspace: one(workspaces, {
    fields: [tags.workspaceId],
    references: [workspaces.id],
  }),
  serviceLinks: many(serviceTags),
  projectLinks: many(projectTags),
  taskLinks: many(taskTags),
  deliveryTemplateLinks: many(deliveryTemplateTags),
}));

export const serviceTagsRelations = relations(serviceTags, ({ one }) => ({
  workspace: one(workspaces, {
    fields: [serviceTags.workspaceId],
    references: [workspaces.id],
  }),
  service: one(services, {
    fields: [serviceTags.workspaceId, serviceTags.serviceId],
    references: [services.workspaceId, services.id],
  }),
  tag: one(tags, {
    fields: [serviceTags.workspaceId, serviceTags.tagId],
    references: [tags.workspaceId, tags.id],
  }),
}));

export const serviceResponsiblesRelations = relations(
  serviceResponsibles,
  ({ one }) => ({
    workspace: one(workspaces, {
      fields: [serviceResponsibles.workspaceId],
      references: [workspaces.id],
    }),
    service: one(services, {
      fields: [serviceResponsibles.workspaceId, serviceResponsibles.serviceId],
      references: [services.workspaceId, services.id],
    }),
    member: one(workspaceMembers, {
      fields: [serviceResponsibles.workspaceId, serviceResponsibles.userId],
      references: [workspaceMembers.workspaceId, workspaceMembers.userId],
    }),
  }),
);

export const deliveryTemplatesRelations = relations(
  deliveryTemplates,
  ({ one, many }) => ({
    workspace: one(workspaces, {
      fields: [deliveryTemplates.workspaceId],
      references: [workspaces.id],
    }),
    service: one(services, {
      fields: [deliveryTemplates.workspaceId, deliveryTemplates.serviceId],
      references: [services.workspaceId, services.id],
    }),
    subtasks: many(deliveryTemplateSubtasks),
    tags: many(deliveryTemplateTags),
    responsibles: many(deliveryTemplateResponsibles),
    serviceLinks: many(serviceTaskTemplates),
  }),
);

export const serviceTaskTemplatesRelations = relations(
  serviceTaskTemplates,
  ({ one }) => ({
    workspace: one(workspaces, {
      fields: [serviceTaskTemplates.workspaceId],
      references: [workspaces.id],
    }),
    service: one(services, {
      fields: [
        serviceTaskTemplates.workspaceId,
        serviceTaskTemplates.serviceId,
      ],
      references: [services.workspaceId, services.id],
    }),
    template: one(deliveryTemplates, {
      fields: [
        serviceTaskTemplates.workspaceId,
        serviceTaskTemplates.deliveryTemplateId,
      ],
      references: [deliveryTemplates.workspaceId, deliveryTemplates.id],
    }),
  }),
);

export const deliveryTemplateSubtasksRelations = relations(
  deliveryTemplateSubtasks,
  ({ one }) => ({
    workspace: one(workspaces, {
      fields: [deliveryTemplateSubtasks.workspaceId],
      references: [workspaces.id],
    }),
    template: one(deliveryTemplates, {
      fields: [
        deliveryTemplateSubtasks.workspaceId,
        deliveryTemplateSubtasks.deliveryTemplateId,
      ],
      references: [deliveryTemplates.workspaceId, deliveryTemplates.id],
    }),
  }),
);

export const deliveryTemplateTagsRelations = relations(
  deliveryTemplateTags,
  ({ one }) => ({
    workspace: one(workspaces, {
      fields: [deliveryTemplateTags.workspaceId],
      references: [workspaces.id],
    }),
    template: one(deliveryTemplates, {
      fields: [
        deliveryTemplateTags.workspaceId,
        deliveryTemplateTags.deliveryTemplateId,
      ],
      references: [deliveryTemplates.workspaceId, deliveryTemplates.id],
    }),
    tag: one(tags, {
      fields: [deliveryTemplateTags.workspaceId, deliveryTemplateTags.tagId],
      references: [tags.workspaceId, tags.id],
    }),
  }),
);

export const deliveryTemplateResponsiblesRelations = relations(
  deliveryTemplateResponsibles,
  ({ one }) => ({
    workspace: one(workspaces, {
      fields: [deliveryTemplateResponsibles.workspaceId],
      references: [workspaces.id],
    }),
    template: one(deliveryTemplates, {
      fields: [
        deliveryTemplateResponsibles.workspaceId,
        deliveryTemplateResponsibles.deliveryTemplateId,
      ],
      references: [deliveryTemplates.workspaceId, deliveryTemplates.id],
    }),
    member: one(workspaceMembers, {
      fields: [
        deliveryTemplateResponsibles.workspaceId,
        deliveryTemplateResponsibles.userId,
      ],
      references: [workspaceMembers.workspaceId, workspaceMembers.userId],
    }),
  }),
);
