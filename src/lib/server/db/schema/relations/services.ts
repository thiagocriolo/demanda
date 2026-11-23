import { relations } from "drizzle-orm";
import { projects, projectServices, projectTags } from "../projects";
import {
  deliveryTemplateResponsibles,
  deliveryTemplateTasks,
  deliveryTemplateTags,
  deliveryTemplates,
  serviceResponsibles,
  serviceTags,
  serviceDeliveryTemplates,
  services,
  tags,
} from "../services";
import { deliveryTags } from "../deliveries";
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
  deliveryTemplateLinks: many(serviceDeliveryTemplates),
}));

export const tagsRelations = relations(tags, ({ one, many }) => ({
  workspace: one(workspaces, {
    fields: [tags.workspaceId],
    references: [workspaces.id],
  }),
  serviceLinks: many(serviceTags),
  projectLinks: many(projectTags),
  deliveryLinks: many(deliveryTags),
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
    tasks: many(deliveryTemplateTasks),
    tags: many(deliveryTemplateTags),
    responsibles: many(deliveryTemplateResponsibles),
    serviceLinks: many(serviceDeliveryTemplates),
  }),
);

export const serviceDeliveryTemplatesRelations = relations(
  serviceDeliveryTemplates,
  ({ one }) => ({
    workspace: one(workspaces, {
      fields: [serviceDeliveryTemplates.workspaceId],
      references: [workspaces.id],
    }),
    service: one(services, {
      fields: [
        serviceDeliveryTemplates.workspaceId,
        serviceDeliveryTemplates.serviceId,
      ],
      references: [services.workspaceId, services.id],
    }),
    template: one(deliveryTemplates, {
      fields: [
        serviceDeliveryTemplates.workspaceId,
        serviceDeliveryTemplates.deliveryTemplateId,
      ],
      references: [deliveryTemplates.workspaceId, deliveryTemplates.id],
    }),
  }),
);

export const deliveryTemplateTasksRelations = relations(
  deliveryTemplateTasks,
  ({ one }) => ({
    workspace: one(workspaces, {
      fields: [deliveryTemplateTasks.workspaceId],
      references: [workspaces.id],
    }),
    template: one(deliveryTemplates, {
      fields: [
        deliveryTemplateTasks.workspaceId,
        deliveryTemplateTasks.deliveryTemplateId,
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
