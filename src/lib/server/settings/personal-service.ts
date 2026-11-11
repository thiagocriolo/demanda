import { and, eq, sql } from "drizzle-orm";
import type {
  PersonalSettingsResponse,
  PersonalSettingsState,
} from "../../settings/types";
import { defaultPersonalSettings } from "../../settings/defaults";
import {
  avatarProfileUrl,
  parseAvatarProfileUrl,
} from "../../avatar/avatar-options";
import type { AuditRequestMetadata } from "../authorization/audit";
import { appendAdministrativeAuditLog } from "../authorization/audit";
import type { RequestAuthorizationContext } from "../authorization/workspace-context";
import {
  requireActiveWorkspacePermission,
  requireWorkspacePermissionForUpdate,
} from "../authorization/workspace-context";
import { affectedRows, type Database } from "../db/database";
import { userPreferences, users } from "../db/schema";
import {
  assertOwnedProfileFile,
  storedFileIdFromPrivateUrl,
} from "../files/service";
import { SettingsVersionConflictError } from "./errors";
import { personalSettingsSchema } from "./validation";

function profileForPrincipal(
  settings: PersonalSettingsState,
  context: RequestAuthorizationContext,
  initialize: boolean,
): PersonalSettingsState {
  const privatePhoto = storedFileIdFromPrivateUrl(context.user.avatarUrl ?? "")
    ? context.user.avatarUrl
    : null;
  const generatedAvatar = initialize
    ? parseAvatarProfileUrl(context.user.avatarUrl ?? "")
    : null;
  return {
    ...settings,
    profile: {
      ...settings.profile,
      name: initialize ? context.user.name : settings.profile.name,
      username: initialize ? context.user.username : settings.profile.username,
      email: initialize ? context.user.email : settings.profile.email,
      photo: privatePhoto ?? (initialize ? "" : settings.profile.photo),
      avatarImage: generatedAvatar?.avatarImage ?? settings.profile.avatarImage,
      avatarColor: generatedAvatar?.avatarColor ?? settings.profile.avatarColor,
    },
  };
}

export async function getUserSettings(
  database: Database,
  context: RequestAuthorizationContext,
): Promise<PersonalSettingsResponse> {
  const [row] = await database
    .select()
    .from(userPreferences)
    .where(eq(userPreferences.userId, context.user.id))
    .limit(1);
  const parsed = row ? personalSettingsSchema.safeParse(row.settings) : null;
  const settings = parsed?.success ? parsed.data : defaultPersonalSettings();
  return {
    version: row?.version ?? 0,
    settings: profileForPrincipal(settings, context, !row),
  };
}

export async function updateUserSettings(
  database: Database,
  context: RequestAuthorizationContext,
  input: { version: number; settings: PersonalSettingsState },
  request: AuditRequestMetadata = {},
): Promise<PersonalSettingsResponse> {
  const parsed = personalSettingsSchema.parse(input.settings);
  const privatePhotoId = storedFileIdFromPrivateUrl(parsed.profile.photo);
  const privateCoverId = storedFileIdFromPrivateUrl(parsed.profile.cover);
  if (privatePhotoId) {
    await assertOwnedProfileFile(database, context, parsed.profile.photo);
  }
  if (privateCoverId) {
    await assertOwnedProfileFile(database, context, parsed.profile.cover);
  }
  const stored: PersonalSettingsState = {
    ...parsed,
    profile: {
      ...parsed.profile,
      photo: privatePhotoId ? parsed.profile.photo : "",
      cover: privateCoverId ? parsed.profile.cover : "",
    },
  };
  const avatarUrl = privatePhotoId
    ? stored.profile.photo
    : avatarProfileUrl(stored.profile.avatarImage, stored.profile.avatarColor);
  const next = await database.transaction(async (transaction) => {
    const workspace = requireActiveWorkspacePermission(
      context,
      "workspace:read",
    );
    const access = await requireWorkspacePermissionForUpdate(
      transaction,
      context.user.id,
      workspace.workspace.id,
      "workspace:read",
    );
    let nextPreference: typeof userPreferences.$inferSelect;
    if (input.version === 0) {
      try {
        await transaction.insert(userPreferences).values({
          userId: context.user.id,
          settings: stored as unknown as Record<string, unknown>,
          version: 1,
        });
      } catch (cause) {
        const mysqlCause = cause instanceof Error && "cause" in cause ? cause.cause : cause;
        if (
          mysqlCause &&
          typeof mysqlCause === "object" &&
          "code" in mysqlCause &&
          mysqlCause.code === "ER_DUP_ENTRY"
        ) {
          throw new SettingsVersionConflictError();
        }
        throw cause;
      }
      const [created] = await transaction
        .select()
        .from(userPreferences)
        .where(eq(userPreferences.userId, context.user.id))
        .limit(1);
      if (!created) throw new SettingsVersionConflictError();
      nextPreference = created;
    } else {
      const updated = await transaction
        .update(userPreferences)
        .set({
          settings: stored as unknown as Record<string, unknown>,
          version: sql`${userPreferences.version} + 1`,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(userPreferences.userId, context.user.id),
            eq(userPreferences.version, input.version),
          ),
        );
      if (affectedRows(updated) !== 1) throw new SettingsVersionConflictError();
      const [changed] = await transaction
        .select()
        .from(userPreferences)
        .where(eq(userPreferences.userId, context.user.id))
        .limit(1);
      if (!changed) throw new SettingsVersionConflictError();
      nextPreference = changed;
    }
    await transaction
      .update(users)
      .set({ avatarUrl, updatedAt: new Date() })
      .where(eq(users.id, context.user.id));
    await appendAdministrativeAuditLog(
      transaction,
      { userId: context.user.id, workspace: access },
      {
        action: "profile.updated",
        targetType: "user",
        targetId: context.user.id,
        metadata: { hasPrivatePhoto: Boolean(privatePhotoId) },
      },
      request,
    );
    return nextPreference;
  });
  context.user.avatarUrl = avatarUrl;
  return {
    version: next.version,
    settings: stored,
  };
}
