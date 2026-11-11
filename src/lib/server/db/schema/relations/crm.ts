import { relations } from "drizzle-orm";
import {
  businessNotes,
  businessResponsibles,
  businesses,
  contactEmails,
  contactNotes,
  contactPhones,
  contacts,
} from "../crm";
import { users } from "../identity";
import { projects } from "../projects";
import { tasks } from "../tasks";
import { workspaceMembers, workspaces } from "../workspace";

export const contactsRelations = relations(contacts, ({ one, many }) => ({
  workspace: one(workspaces, {
    fields: [contacts.workspaceId],
    references: [workspaces.id],
  }),
  linkedUser: one(users, {
    fields: [contacts.linkedUserId],
    references: [users.id],
    relationName: "contactLinkedUser",
  }),
  owner: one(users, {
    fields: [contacts.ownerUserId],
    references: [users.id],
    relationName: "contactOwner",
  }),
  linkedMembership: one(workspaceMembers, {
    fields: [contacts.workspaceId, contacts.linkedUserId],
    references: [workspaceMembers.workspaceId, workspaceMembers.userId],
    relationName: "contactLinkedMembership",
  }),
  phones: many(contactPhones),
  emails: many(contactEmails),
  notes: many(contactNotes),
  businessResponsibilities: many(businessResponsibles),
}));

export const contactPhonesRelations = relations(contactPhones, ({ one }) => ({
  workspace: one(workspaces, {
    fields: [contactPhones.workspaceId],
    references: [workspaces.id],
  }),
  contact: one(contacts, {
    fields: [contactPhones.workspaceId, contactPhones.contactId],
    references: [contacts.workspaceId, contacts.id],
  }),
}));

export const contactEmailsRelations = relations(contactEmails, ({ one }) => ({
  workspace: one(workspaces, {
    fields: [contactEmails.workspaceId],
    references: [workspaces.id],
  }),
  contact: one(contacts, {
    fields: [contactEmails.workspaceId, contactEmails.contactId],
    references: [contacts.workspaceId, contacts.id],
  }),
}));

export const contactNotesRelations = relations(contactNotes, ({ one }) => ({
  workspace: one(workspaces, {
    fields: [contactNotes.workspaceId],
    references: [workspaces.id],
  }),
  contact: one(contacts, {
    fields: [contactNotes.workspaceId, contactNotes.contactId],
    references: [contacts.workspaceId, contacts.id],
  }),
}));

export const businessesRelations = relations(businesses, ({ one, many }) => ({
  workspace: one(workspaces, {
    fields: [businesses.workspaceId],
    references: [workspaces.id],
  }),
  owner: one(users, {
    fields: [businesses.ownerUserId],
    references: [users.id],
    relationName: "businessOwner",
  }),
  responsibles: many(businessResponsibles),
  notes: many(businessNotes),
  projects: many(projects),
  tasks: many(tasks),
}));

export const businessResponsiblesRelations = relations(
  businessResponsibles,
  ({ one }) => ({
    workspace: one(workspaces, {
      fields: [businessResponsibles.workspaceId],
      references: [workspaces.id],
    }),
    business: one(businesses, {
      fields: [
        businessResponsibles.workspaceId,
        businessResponsibles.businessId,
      ],
      references: [businesses.workspaceId, businesses.id],
    }),
    contact: one(contacts, {
      fields: [
        businessResponsibles.workspaceId,
        businessResponsibles.contactId,
      ],
      references: [contacts.workspaceId, contacts.id],
    }),
    user: one(users, {
      fields: [businessResponsibles.userId],
      references: [users.id],
      relationName: "businessResponsibleUser",
    }),
  }),
);

export const businessNotesRelations = relations(businessNotes, ({ one }) => ({
  workspace: one(workspaces, {
    fields: [businessNotes.workspaceId],
    references: [workspaces.id],
  }),
  business: one(businesses, {
    fields: [businessNotes.workspaceId, businessNotes.businessId],
    references: [businesses.workspaceId, businesses.id],
  }),
}));
