import {
  contactEmailTypes,
  contactPhoneTypes,
  contactStatuses,
  contactTypes,
  type ContactEmailType,
  type ContactPhoneType,
  type ContactStatus,
  type ContactType,
} from "../../../contacts/types";

export { contactEmailTypes, contactPhoneTypes, contactStatuses, contactTypes };
export type { ContactEmailType, ContactPhoneType, ContactStatus, ContactType };

export const workspaceRoles = ["owner", "admin", "member"] as const;
export type WorkspaceRole = (typeof workspaceRoles)[number];

export const workspaceKinds = ["personal", "shared"] as const;
export type WorkspaceKind = (typeof workspaceKinds)[number];

export const workspaceInvitationStatuses = [
  "pending",
  "accepted",
  "revoked",
] as const;
export type WorkspaceInvitationStatus =
  (typeof workspaceInvitationStatuses)[number];

export const connectionRequestStatuses = [
  "pending",
  "accepted",
  "declined",
  "cancelled",
] as const;
export type ConnectionRequestStatus =
  (typeof connectionRequestStatuses)[number];

export const socialPostKinds = ["feed", "portfolio"] as const;
export type SocialPostKind = (typeof socialPostKinds)[number];

export const socialBlockKinds = ["text", "image", "video"] as const;
export type SocialBlockKind = (typeof socialBlockKinds)[number];

export const communityVisibilities = ["public", "private"] as const;
export type CommunityVisibility = (typeof communityVisibilities)[number];

export const communityMemberRoles = ["owner", "admin", "member"] as const;
export type CommunityMemberRole = (typeof communityMemberRoles)[number];

export const communityJoinRequestStatuses = [
  "pending",
  "accepted",
  "declined",
] as const;
export type CommunityJoinRequestStatus =
  (typeof communityJoinRequestStatuses)[number];

export const communityInvitationStatuses = ["pending", "accepted"] as const;
export type CommunityInvitationStatus =
  (typeof communityInvitationStatuses)[number];

export const storedFilePurposes = ["profile_avatar", "attachment"] as const;
export type StoredFilePurpose = (typeof storedFilePurposes)[number];

export const storedFileBackends = ["local", "s3"] as const;
export type StoredFileBackend = (typeof storedFileBackends)[number];

export const storedFileStatuses = [
  "pending",
  "processing",
  "ready",
  "failed",
  "deleting",
] as const;
export type StoredFileStatus = (typeof storedFileStatuses)[number];

export const taskBoardViews = [
  "status",
  "priority",
  "business",
  "project",
] as const;
export type TaskBoardView = (typeof taskBoardViews)[number];
export type TaskBoardOrder = Partial<Record<TaskBoardView, number>>;

export const agendaEntityKinds = ["project", "task"] as const;
export type AgendaEntityKind = (typeof agendaEntityKinds)[number];

export const workspaceCatalogKinds = [
  "person_status",
  "business_status",
  "project_status",
  "task_status",
  "business_category",
  "task_category",
  "task_priority",
  "revenue_category",
  "expense_category",
] as const;
export type WorkspaceCatalogKind = (typeof workspaceCatalogKinds)[number];
