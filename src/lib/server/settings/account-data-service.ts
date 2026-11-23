import { and, eq, inArray, isNull, ne, or } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { parseAvatarProfileUrl } from "../../avatar/avatar-options";
import { defaultPersonalSettings } from "../../settings/defaults";
import type { PersonalSettingsState } from "../../settings/types";
import type { RequestAuthorizationContext } from "../authorization/workspace-context";
import type { Database } from "../db/database";
import {
  agendaEntries,
  authSessions,
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
  contractInstallments,
  contracts,
  cronogramaBlocks,
  deliveryTemplateResponsibles,
  deliveryTemplateTasks,
  deliveryTemplateTags,
  deliveryTemplates,
  financialEntries,
  personalDeliveries,
  projectInstallments,
  projectResponsibles,
  projectServices,
  projectTags,
  projectDeliveryRoutines,
  projects,
  serviceResponsibles,
  serviceTags,
  serviceDeliveryTemplates,
  services,
  socialCommentLikes,
  socialPostBlocks,
  socialPostComments,
  socialPostLikes,
  socialPosts,
  storedFiles,
  tags,
  deliveryComments,
  deliveryResponsibles,
  deliveryTasks,
  deliveryTags,
  deliveries,
  toolModels,
  toolResponses,
  toolUses,
  userConnections,
  userPreferences,
  userStorageUsage,
  workspaceCatalogEntries,
  workspaceConfigurations,
  workspaceInvitations,
  workspaceMembers,
  workspaces,
} from "../db/schema";
import { storedFileIdFromPrivateUrl } from "../files/service";
import { personalSettingsSchema } from "./validation";

/**
 * Starts the account over while preserving the account identity. Every
 * workspace owned by the account is deleted, and the account leaves other
 * workspaces. A new, empty personal workspace is then created so the user can
 * continue using the app immediately.
 */
export async function resetAccountData(
  database: Database,
  context: RequestAuthorizationContext,
): Promise<void> {
  const userId = context.user.id;

  const freshWorkspace = await database.transaction(async (transaction) => {
    const scoped = transaction as unknown as Database;
    const [preference] = await scoped
      .select({ settings: userPreferences.settings })
      .from(userPreferences)
      .where(eq(userPreferences.userId, userId))
      .limit(1);
    const resetPreferences = preferencesAfterReset(
      preference?.settings,
      context,
    );
    const preservedAvatarFileId = storedFileIdFromPrivateUrl(
      context.user.avatarUrl ?? "",
    );
    const ownedWorkspaces = await scoped
      .select({ id: workspaces.id })
      .from(workspaces)
      .where(eq(workspaces.ownerUserId, userId))
      .for("update");
    const ownedWorkspaceIds = ownedWorkspaces.map(({ id }) => id);
    const newWorkspaceId = randomUUID();
    const now = new Date();
    const newWorkspace = {
      id: newWorkspaceId,
      name: "Pessoal",
      description: "",
      icon: "house",
      color: "blue",
      kind: "personal" as const,
      ownerUserId: userId,
    };

    // Insert as "shared" while the previous personal workspace still exists so
    // `workspaces_personal_owner_unique` is not violated, then promote to
    // "personal" inside the same transaction once old workspaces are deleted.
    await scoped.insert(workspaces).values({
      ...newWorkspace,
      kind: "shared",
      createdAt: now,
      updatedAt: now,
    });
    await scoped.insert(workspaceMembers).values({
      workspaceId: newWorkspaceId,
      userId,
      role: "owner",
      joinedAt: now,
      updatedAt: now,
    });
    await scoped
      .update(authSessions)
      .set({ activeWorkspaceId: newWorkspaceId })
      .where(eq(authSessions.userId, userId));

    const fileRows = await scoped
      .select({ id: storedFiles.id, byteSize: storedFiles.byteSize })
      .from(storedFiles)
      .where(
        ownedWorkspaceIds.length > 0
          ? or(
              eq(storedFiles.ownerUserId, userId),
              inArray(storedFiles.workspaceId, ownedWorkspaceIds),
            )
          : eq(storedFiles.ownerUserId, userId),
      );
    let preservedAvatarBytes = 0;
    if (preservedAvatarFileId) {
      const preserved = fileRows.find(({ id }) => id === preservedAvatarFileId);
      if (preserved) {
        preservedAvatarBytes = preserved.byteSize;
        await scoped
          .update(storedFiles)
          .set({ workspaceId: newWorkspaceId, updatedAt: now })
          .where(
            and(
              eq(storedFiles.id, preservedAvatarFileId),
              eq(storedFiles.ownerUserId, userId),
            ),
          );
      }
    }
    const fileIdsToDelete = Array.from(
      new Set(
        fileRows
          .map(({ id }) => id)
          .filter((id) => id !== preservedAvatarFileId),
      ),
    );
    if (fileIdsToDelete.length > 0) {
      await scoped
        .delete(socialPostBlocks)
        .where(inArray(socialPostBlocks.fileId, fileIdsToDelete));
      await scoped
        .update(communities)
        .set({ coverFileId: null, updatedAt: now })
        .where(inArray(communities.coverFileId, fileIdsToDelete));
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

    const createdModels = await scoped
      .select({ id: toolModels.id })
      .from(toolModels)
      .where(
        ownedWorkspaceIds.length > 0
          ? or(
              eq(toolModels.createdByUserId, userId),
              inArray(toolModels.workspaceId, ownedWorkspaceIds),
            )
          : eq(toolModels.createdByUserId, userId),
      );
    const createdModelIds = createdModels.map(({ id }) => id);
    await scoped
      .delete(toolResponses)
      .where(
        ownedWorkspaceIds.length > 0
          ? or(
              eq(toolResponses.respondentUserId, userId),
              inArray(toolResponses.workspaceId, ownedWorkspaceIds),
            )
          : eq(toolResponses.respondentUserId, userId),
      );
    await scoped
      .delete(toolUses)
      .where(
        ownedWorkspaceIds.length > 0
          ? or(
              eq(toolUses.createdByUserId, userId),
              inArray(toolUses.workspaceId, ownedWorkspaceIds),
            )
          : eq(toolUses.createdByUserId, userId),
      );
    if (createdModelIds.length > 0) {
      await scoped
        .delete(toolUses)
        .where(inArray(toolUses.modelId, createdModelIds));
      await scoped
        .delete(toolModels)
        .where(inArray(toolModels.id, createdModelIds));
    }

    await deleteOwnedDomainData(scoped, userId, ownedWorkspaceIds);

    if (fileIdsToDelete.length > 0) {
      await scoped
        .delete(storedFiles)
        .where(inArray(storedFiles.id, fileIdsToDelete));
    }

    if (ownedWorkspaceIds.length > 0) {
      await scoped
        .delete(workspaces)
        .where(inArray(workspaces.id, ownedWorkspaceIds));
    }

    await scoped
      .update(workspaces)
      .set({ kind: "personal", updatedAt: now })
      .where(eq(workspaces.id, newWorkspaceId));

    // A reset also removes access to workspaces owned by other people. They
    // remain intact for their owners, but this account starts with no history.
    await scoped
      .delete(workspaceInvitations)
      .where(
        or(
          eq(workspaceInvitations.invitedByUserId, userId),
          eq(workspaceInvitations.acceptedByUserId, userId),
          eq(workspaceInvitations.email, context.user.email),
        ),
      );
    await scoped
      .delete(workspaceMembers)
      .where(
        and(
          eq(workspaceMembers.userId, userId),
          ne(workspaceMembers.workspaceId, newWorkspaceId),
        ),
      );

    await scoped.delete(personalDeliveries).where(eq(personalDeliveries.userId, userId));
    await scoped
      .delete(userPreferences)
      .where(eq(userPreferences.userId, userId));
    await scoped.insert(userPreferences).values({
      userId,
      settings: resetPreferences as unknown as Record<string, unknown>,
      version: 1,
    });
    await scoped
      .update(userStorageUsage)
      .set({
        storageUsedBytes: preservedAvatarBytes,
        storageReservedBytes: 0,
        updatedAt: now,
      })
      .where(eq(userStorageUsage.userId, userId));
    return newWorkspace;
  });

  context.session.activeWorkspaceId = freshWorkspace.id;
  context.activeWorkspace = {
    workspace: freshWorkspace,
    membership: { userId, role: "owner", joinedAt: new Date() },
  };
}

function preferencesAfterReset(
  current: unknown,
  context: RequestAuthorizationContext,
): PersonalSettingsState {
  const parsed = personalSettingsSchema.safeParse(current);
  const phone = parsed.success ? parsed.data.profile.phone : "";
  const avatarUrl = context.user.avatarUrl ?? "";
  const generatedAvatar = parseAvatarProfileUrl(avatarUrl);
  const settings = defaultPersonalSettings();

  return {
    ...settings,
    profile: {
      ...settings.profile,
      name: context.user.name,
      username: context.user.username,
      email: context.user.email,
      phone,
      photo: storedFileIdFromPrivateUrl(avatarUrl) ? avatarUrl : "",
      ...(generatedAvatar ?? {}),
      profession: "",
      bio: "",
      cover: "",
    },
  };
}

async function runOptionalTableOperation<T>(
  operation: () => Promise<T>,
  fallback: T,
): Promise<T> {
  try {
    return await operation();
  } catch (cause) {
    // A aplicação pode ser publicada antes de migrations opcionais serem
    // aplicadas no banco gerenciado. Nesse caso a tabela simplesmente ainda
    // não existe e não há dados nela a apagar.
    if (isMissingTableError(cause)) return fallback;
    throw cause;
  }
}

async function deleteOwnedDomainData(
  database: Database,
  userId: string,
  ownedWorkspaceIds: string[],
): Promise<void> {
  const byOwnedWorkspaces = async (table: any) => {
    if (!ownedWorkspaceIds.length) return;
    await runOptionalTableOperation(
      () =>
        database
          .delete(table)
          .where(inArray(table.workspaceId, ownedWorkspaceIds)),
      undefined,
    );
  };

  const contractRows = await runOptionalTableOperation(
    () =>
      database
        .select({ id: contracts.id })
        .from(contracts)
        .where(
          ownedWorkspaceIds.length > 0
            ? or(
                eq(contracts.ownerUserId, userId),
                inArray(contracts.workspaceId, ownedWorkspaceIds),
              )
            : eq(contracts.ownerUserId, userId),
        ),
    [],
  );
  const contractIds = contractRows.map(({ id }) => id);

  const businessRows = await database
    .select({ id: businesses.id })
    .from(businesses)
    .where(
      ownedWorkspaceIds.length > 0
        ? or(
            eq(businesses.ownerUserId, userId),
            inArray(businesses.workspaceId, ownedWorkspaceIds),
          )
        : eq(businesses.ownerUserId, userId),
    );
  const businessIds = businessRows.map(({ id }) => id);

  const contactRows = await database
    .select({ id: contacts.id })
    .from(contacts)
    .where(
      ownedWorkspaceIds.length > 0
        ? or(
            eq(contacts.ownerUserId, userId),
            inArray(contacts.workspaceId, ownedWorkspaceIds),
          )
        : eq(contacts.ownerUserId, userId),
    );
  const contactIds = contactRows.map(({ id }) => id);

  const projectConditions = [];
  if (ownedWorkspaceIds.length > 0)
    projectConditions.push(inArray(projects.workspaceId, ownedWorkspaceIds));
  if (contractIds.length > 0)
    projectConditions.push(inArray(projects.contractId, contractIds));
  if (businessIds.length > 0)
    projectConditions.push(inArray(projects.businessId, businessIds));
  const projectRows = projectConditions.length
    ? await database
        .select({ id: projects.id })
        .from(projects)
        .where(or(...projectConditions))
    : [];
  const projectIds = projectRows.map(({ id }) => id);

  const routineConditions = [eq(projectDeliveryRoutines.responsibleUserId, userId)];
  if (ownedWorkspaceIds.length > 0)
    routineConditions.push(
      inArray(projectDeliveryRoutines.workspaceId, ownedWorkspaceIds),
    );
  if (projectIds.length > 0)
    routineConditions.push(inArray(projectDeliveryRoutines.projectId, projectIds));
  const routineRows = await runOptionalTableOperation(
    () =>
      database
        .select({ id: projectDeliveryRoutines.id })
        .from(projectDeliveryRoutines)
        .where(or(...routineConditions)),
    [],
  );
  const routineIds = routineRows.map(({ id }) => id);

  // Delete in dependency order across all owned workspaces and personal
  // commercial records so cross-workspace FKs (e.g. contracts -> businesses
  // and projects -> contracts) never hit RESTRICT/NO ACTION constraints.
  await byOwnedWorkspaces(cronogramaBlocks);
  await byOwnedWorkspaces(agendaEntries);

  const financeConditions = [eq(financialEntries.ownerUserId, userId)];
  if (ownedWorkspaceIds.length > 0)
    financeConditions.push(
      inArray(financialEntries.workspaceId, ownedWorkspaceIds),
    );
  if (contractIds.length > 0)
    financeConditions.push(inArray(financialEntries.contractId, contractIds));
  if (projectIds.length > 0)
    financeConditions.push(inArray(financialEntries.projectId, projectIds));
  await database.delete(financialEntries).where(or(...financeConditions));

  if (projectIds.length > 0) {
    await database
      .delete(projectInstallments)
      .where(inArray(projectInstallments.projectId, projectIds));
  }
  await byOwnedWorkspaces(projectInstallments);

  await byOwnedWorkspaces(deliveryComments);
  await byOwnedWorkspaces(deliveryResponsibles);
  await byOwnedWorkspaces(deliveryTags);
  await byOwnedWorkspaces(deliveryTasks);

  const deliveryConditions = [];
  if (ownedWorkspaceIds.length > 0)
    deliveryConditions.push(inArray(deliveries.workspaceId, ownedWorkspaceIds));
  if (projectIds.length > 0)
    deliveryConditions.push(inArray(deliveries.projectId, projectIds));
  if (routineIds.length > 0)
    deliveryConditions.push(inArray(deliveries.projectRoutineId, routineIds));
  if (deliveryConditions.length > 0) {
    await database.delete(deliveries).where(or(...deliveryConditions));
  }

  if (routineIds.length > 0) {
    await runOptionalTableOperation(
      () =>
        database
          .delete(projectDeliveryRoutines)
          .where(inArray(projectDeliveryRoutines.id, routineIds)),
      undefined,
    );
  }

  if (projectIds.length > 0) {
    await database
      .delete(projectResponsibles)
      .where(inArray(projectResponsibles.projectId, projectIds));
    await database
      .delete(projectTags)
      .where(inArray(projectTags.projectId, projectIds));
    await database
      .delete(projectServices)
      .where(inArray(projectServices.projectId, projectIds));
    await database.delete(projects).where(inArray(projects.id, projectIds));
  }

  if (contractIds.length > 0) {
    await runOptionalTableOperation(
      () =>
        database
          .delete(contractInstallments)
          .where(inArray(contractInstallments.contractId, contractIds)),
      undefined,
    );
    await runOptionalTableOperation(
      () => database.delete(contracts).where(inArray(contracts.id, contractIds)),
      undefined,
    );
  }

  const businessResponsibleConditions = [eq(businessResponsibles.userId, userId)];
  if (ownedWorkspaceIds.length > 0)
    businessResponsibleConditions.push(
      inArray(businessResponsibles.workspaceId, ownedWorkspaceIds),
    );
  if (businessIds.length > 0)
    businessResponsibleConditions.push(
      inArray(businessResponsibles.businessId, businessIds),
    );
  if (contactIds.length > 0)
    businessResponsibleConditions.push(
      inArray(businessResponsibles.contactId, contactIds),
    );
  await database
    .delete(businessResponsibles)
    .where(or(...businessResponsibleConditions));

  if (businessIds.length > 0) {
    await database
      .delete(businessNotes)
      .where(inArray(businessNotes.businessId, businessIds));
    await database.delete(businesses).where(inArray(businesses.id, businessIds));
  }

  if (contactIds.length > 0) {
    await database
      .delete(contactPhones)
      .where(inArray(contactPhones.contactId, contactIds));
    await database
      .delete(contactEmails)
      .where(inArray(contactEmails.contactId, contactIds));
    await database
      .delete(contactNotes)
      .where(inArray(contactNotes.contactId, contactIds));
    await database.delete(contacts).where(inArray(contacts.id, contactIds));
  }

  await byOwnedWorkspaces(serviceDeliveryTemplates);
  await byOwnedWorkspaces(deliveryTemplateTasks);
  await byOwnedWorkspaces(deliveryTemplateTags);
  await byOwnedWorkspaces(deliveryTemplateResponsibles);
  await byOwnedWorkspaces(deliveryTemplates);
  await byOwnedWorkspaces(serviceTags);
  await byOwnedWorkspaces(serviceResponsibles);
  await byOwnedWorkspaces(services);
  await byOwnedWorkspaces(tags);
  await byOwnedWorkspaces(workspaceCatalogEntries);
  await byOwnedWorkspaces(workspaceConfigurations);
  await byOwnedWorkspaces(auditLogs);
}

function isMissingTableError(cause: unknown): boolean {
  const visited = new Set<unknown>();
  let current: unknown = cause;
  while (current && typeof current === "object" && !visited.has(current)) {
    visited.add(current);
    const error = current as {
      code?: unknown;
      errno?: unknown;
      message?: unknown;
      cause?: unknown;
    };
    if (
      error.code === "ER_NO_SUCH_TABLE" ||
      error.errno === 1146 ||
      (typeof error.message === "string" &&
        /table.+(?:doesn't exist|not found)/iu.test(error.message))
    ) {
      return true;
    }
    current = error.cause;
  }
  return false;
}
