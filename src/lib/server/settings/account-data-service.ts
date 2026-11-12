import { and, eq, inArray, isNull, or } from "drizzle-orm";
import {
  avatarProfileUrl,
  DEFAULT_AVATAR_COLOR,
  DEFAULT_AVATAR_ID,
} from "../../avatar/avatar-options";
import type { RequestAuthorizationContext } from "../authorization/workspace-context";
import type { Database } from "../db/database";
import {
  agendaEntries,
  auditLogs,
  businesses,
  businessNotes,
  businessResponsibles,
  communities,
  communityInvitations,
  communityJoinRequests,
  communityMembers,
  connectionRequests,
  contactEmails,
  contactNotes,
  contactPhones,
  contacts,
  cronogramaBlocks,
  deliveryTemplateResponsibles,
  deliveryTemplateSubtasks,
  deliveryTemplateTags,
  deliveryTemplates,
  financialEntries,
  personalTasks,
  projectInstallments,
  projectResponsibles,
  projectServices,
  projectTags,
  projectTaskRoutines,
  projects,
  serviceResponsibles,
  serviceTags,
  serviceTaskTemplates,
  services,
  socialCommentLikes,
  socialPostBlocks,
  socialPostComments,
  socialPostLikes,
  socialPosts,
  storedFiles,
  tags,
  taskComments,
  taskResponsibles,
  taskSubtasks,
  taskTags,
  tasks,
  toolModels,
  toolResponses,
  toolUses,
  userConnections,
  userPreferences,
  userStorageUsage,
  users,
  workspaceCatalogEntries,
  workspaceConfigurations,
  workspaces,
} from "../db/schema";

/**
 * Clears account-owned data while keeping the login, password and personal
 * workspace available for a fresh start. Shared workspaces stay intact because
 * their contents belong to all members.
 */
export async function resetAccountData(
  database: Database,
  context: RequestAuthorizationContext,
): Promise<void> {
  const userId = context.user.id;
  const defaultAvatarUrl = avatarProfileUrl(
    DEFAULT_AVATAR_ID,
    DEFAULT_AVATAR_COLOR,
  );

  await database.transaction(async (transaction) => {
    const scoped = transaction as unknown as Database;
    const [personalWorkspace] = await scoped
      .select({ id: workspaces.id })
      .from(workspaces)
      .where(
        and(
          eq(workspaces.ownerUserId, userId),
          eq(workspaces.kind, "personal"),
          isNull(workspaces.archivedAt),
        ),
      )
      .limit(1)
      .for("update");

    const ownedFiles = await scoped
      .select({ id: storedFiles.id })
      .from(storedFiles)
      .where(eq(storedFiles.ownerUserId, userId));
    const ownedFileIds = ownedFiles.map(({ id }) => id);
    if (ownedFileIds.length > 0) {
      await scoped
        .delete(socialPostBlocks)
        .where(inArray(socialPostBlocks.fileId, ownedFileIds));
      await scoped
        .update(communities)
        .set({ coverFileId: null, updatedAt: new Date() })
        .where(inArray(communities.coverFileId, ownedFileIds));
    }

    await scoped
      .delete(socialCommentLikes)
      .where(eq(socialCommentLikes.userId, userId));
    await scoped
      .delete(socialPostLikes)
      .where(eq(socialPostLikes.userId, userId));
    await scoped
      .delete(socialPostComments)
      .where(eq(socialPostComments.authorUserId, userId));
    await scoped
      .delete(socialPosts)
      .where(eq(socialPosts.authorUserId, userId));
    await scoped
      .delete(communityInvitations)
      .where(
        or(
          eq(communityInvitations.invitedUserId, userId),
          eq(communityInvitations.invitedByUserId, userId),
        ),
      );
    await scoped
      .delete(communityJoinRequests)
      .where(eq(communityJoinRequests.userId, userId));
    await scoped
      .delete(communityMembers)
      .where(eq(communityMembers.userId, userId));
    await scoped.delete(communities).where(eq(communities.ownerUserId, userId));
    await scoped
      .delete(connectionRequests)
      .where(
        or(
          eq(connectionRequests.userAId, userId),
          eq(connectionRequests.userBId, userId),
          eq(connectionRequests.requestedByUserId, userId),
        ),
      );
    await scoped
      .delete(userConnections)
      .where(
        or(
          eq(userConnections.userAId, userId),
          eq(userConnections.userBId, userId),
        ),
      );

    if (personalWorkspace) {
      await deletePersonalWorkspaceData(scoped, personalWorkspace.id);
    }

    await scoped.delete(personalTasks).where(eq(personalTasks.userId, userId));
    await scoped
      .delete(userPreferences)
      .where(eq(userPreferences.userId, userId));
    await scoped.delete(storedFiles).where(eq(storedFiles.ownerUserId, userId));
    await scoped
      .update(userStorageUsage)
      .set({
        storageUsedBytes: 0,
        storageReservedBytes: 0,
        updatedAt: new Date(),
      })
      .where(eq(userStorageUsage.userId, userId));
    await scoped
      .update(users)
      .set({ avatarUrl: defaultAvatarUrl, updatedAt: new Date() })
      .where(eq(users.id, userId));
  });

  context.user.avatarUrl = defaultAvatarUrl;
}

async function deletePersonalWorkspaceData(
  database: Database,
  workspaceId: string,
): Promise<void> {
  const byWorkspace = (table: any) =>
    database.delete(table).where(eq(table.workspaceId, workspaceId));

  // Delete in dependency order for restrictive foreign keys, such as uses
  // pointing to tool models.
  await byWorkspace(toolResponses);
  await byWorkspace(toolUses);
  await byWorkspace(toolModels);
  await byWorkspace(cronogramaBlocks);
  await byWorkspace(agendaEntries);
  await byWorkspace(financialEntries);
  await byWorkspace(projectInstallments);
  await byWorkspace(taskComments);
  await byWorkspace(taskResponsibles);
  await byWorkspace(taskTags);
  await byWorkspace(taskSubtasks);
  await byWorkspace(tasks);
  await byWorkspace(projectTaskRoutines);
  await byWorkspace(projectResponsibles);
  await byWorkspace(projectTags);
  await byWorkspace(projectServices);
  await byWorkspace(projects);
  await byWorkspace(businessNotes);
  await byWorkspace(businessResponsibles);
  await byWorkspace(businesses);
  await byWorkspace(contactPhones);
  await byWorkspace(contactEmails);
  await byWorkspace(contactNotes);
  await byWorkspace(contacts);
  await byWorkspace(serviceTaskTemplates);
  await byWorkspace(deliveryTemplateSubtasks);
  await byWorkspace(deliveryTemplateTags);
  await byWorkspace(deliveryTemplateResponsibles);
  await byWorkspace(deliveryTemplates);
  await byWorkspace(serviceTags);
  await byWorkspace(serviceResponsibles);
  await byWorkspace(services);
  await byWorkspace(tags);
  await byWorkspace(workspaceCatalogEntries);
  await byWorkspace(workspaceConfigurations);
  await byWorkspace(auditLogs);
}
