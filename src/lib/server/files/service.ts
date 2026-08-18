import { createHash, randomUUID } from "node:crypto";
import { and, eq, isNull, sql } from "drizzle-orm";
import type { StoredFileSummary } from "../../files/types";
import type { AuditRequestMetadata } from "../authorization/audit";
import { appendAdministrativeAuditLog } from "../authorization/audit";
import type { RequestAuthorizationContext } from "../authorization/workspace-context";
import {
  requireActiveWorkspacePermission,
  requireWorkspacePermission,
  requireWorkspacePermissionForUpdate,
  WorkspaceNotFoundError,
} from "../authorization/workspace-context";
import type { Database } from "../db/database";
import { storedFiles } from "../db/schema";
import { IMAGE_UPLOAD_POLICY, MAX_VIDEO_UPLOAD_BYTES } from "./config";
import { ImageProcessor } from "./image-processor";
import { logMediaEvent } from "./observability";
import {
  decrementStorageUsage,
  finalizeStorageReservation,
  releaseStorageReservation,
  reserveStorage,
} from "./quota";
import type { PrivateFileStorage } from "./storage";
import {
  validateImageUploadEnvelope,
  validateVideoUploadEnvelope,
} from "./validation";

export class StoredFileNotFoundError extends Error {
  readonly status = 404;
  constructor() {
    super("Arquivo não encontrado.");
    this.name = "StoredFileNotFoundError";
  }
}

export class StoredFilePermissionDeniedError extends Error {
  readonly status = 403;
  constructor() {
    super("Você não tem permissão para acessar este arquivo.");
    this.name = "StoredFilePermissionDeniedError";
  }
}

export type StoredFileContent = {
  bytes: Uint8Array;
  mimeType: string;
  originalName: string;
  sha256: string;
};

function summary(row: typeof storedFiles.$inferSelect): StoredFileSummary {
  return {
    id: row.id,
    purpose: row.purpose,
    status: row.status,
    originalName: row.originalName,
    mimeType: row.mimeType,
    byteSize: row.byteSize,
    width: row.width,
    height: row.height,
    url: `/api/files/${row.id}/content`,
    createdAt: row.createdAt.toISOString(),
  };
}

export function storedFileIdFromPrivateUrl(url: string): string | null {
  return /^\/api\/files\/([0-9a-f-]{36})\/content$/u.exec(url)?.[1] ?? null;
}

async function rowById(database: Database, fileId: string) {
  const [row] = await database
    .select()
    .from(storedFiles)
    .where(eq(storedFiles.id, fileId))
    .limit(1);
  if (!row) throw new StoredFileNotFoundError();
  return row;
}

async function readyRow(database: Database, fileId: string) {
  const [row] = await database
    .select()
    .from(storedFiles)
    .where(
      and(
        eq(storedFiles.id, fileId),
        eq(storedFiles.status, "ready"),
        isNull(storedFiles.deletedAt),
      ),
    )
    .limit(1);
  if (!row) throw new StoredFileNotFoundError();
  return row;
}

async function authorizeRead(
  database: Database,
  context: RequestAuthorizationContext,
  row: typeof storedFiles.$inferSelect,
): Promise<void> {
  if (row.ownerUserId === context.user.id) return;
  const socialReference = await database.execute<{ allowed: boolean }>(sql`
    select true as allowed
    from app.social_post_blocks block
    inner join app.social_posts post on post.id = block.post_id
    where block.file_id = ${row.id}::uuid
      and post.deleted_at is null
      and (
        (post.community_id is null and (
          post.author_user_id = ${context.user.id}::uuid or exists (
            select 1 from app.user_connections connection
            where (connection.user_a_id = ${context.user.id}::uuid
              and connection.user_b_id = post.author_user_id)
               or (connection.user_b_id = ${context.user.id}::uuid
              and connection.user_a_id = post.author_user_id)
          )
        ))
        or (post.community_id is not null and exists (
          select 1 from app.community_members membership
          where membership.community_id = post.community_id
            and membership.user_id = ${context.user.id}::uuid
        ))
      )
    limit 1
  `);
  if (socialReference.rows[0]?.allowed) return;
  const communityCoverReference = await database.execute<{
    allowed: boolean;
  }>(sql`
    select true as allowed
    from app.communities community
    inner join app.community_members membership
      on membership.community_id = community.id
      and membership.user_id = ${context.user.id}::uuid
    where community.cover_file_id = ${row.id}::uuid
      and community.deleted_at is null
    limit 1
  `);
  if (communityCoverReference.rows[0]?.allowed) return;
  if (row.purpose === "attachment") {
    const toolReference = await database.execute<{ allowed: boolean }>(sql`
      select true as allowed
      from app.tool_uses tool_use
      inner join app.workspace_members membership
        on membership.workspace_id = tool_use.workspace_id
       and membership.user_id = ${context.user.id}::uuid
      where tool_use.workspace_id = ${row.workspaceId}::uuid
        and jsonb_path_exists(
          tool_use.content,
          '$.**.fileId ? (@ == $fileId)',
          jsonb_build_object('fileId', ${row.id}::text)
        )
      limit 1
    `);
    if (toolReference.rows[0]?.allowed) return;
  }
  if (row.purpose !== "profile_avatar") {
    throw new StoredFileNotFoundError();
  }
  const connectedOwner = await database.execute<{ allowed: boolean }>(sql`
    select true as allowed
    from app.user_connections connection
    where (connection.user_a_id = ${context.user.id}::uuid
      and connection.user_b_id = ${row.ownerUserId}::uuid)
       or (connection.user_b_id = ${context.user.id}::uuid
      and connection.user_a_id = ${row.ownerUserId}::uuid)
    limit 1
  `);
  if (connectedOwner.rows[0]?.allowed) return;
  try {
    await requireWorkspacePermission(
      database,
      context.user.id,
      row.workspaceId,
      "workspace:read",
    );
  } catch (cause) {
    if (cause instanceof WorkspaceNotFoundError) {
      throw new StoredFileNotFoundError();
    }
    throw cause;
  }
}

export async function uploadPrivateImage(
  database: Database,
  context: RequestAuthorizationContext,
  input: {
    purpose: "profile_avatar" | "attachment";
    originalName: string;
    claimedMimeType: string;
    content: Uint8Array;
  },
  request: AuditRequestMetadata,
  storage: PrivateFileStorage,
  processor = new ImageProcessor(),
): Promise<StoredFileSummary> {
  const current = requireActiveWorkspacePermission(context, "workspace:read");
  const uploadId = randomUUID();
  const id = randomUUID();
  const temporaryKey = `temp/${context.user.id}/${uploadId}.upload`;
  let finalKey: string | null = null;
  let temporaryStored = false;
  let reservationActive = false;
  let finalStored = false;

  logMediaEvent("upload.requested", {
    uploadId,
    userId: context.user.id,
    purpose: input.purpose,
  });

  try {
    const validated = validateImageUploadEnvelope(input);
    logMediaEvent("upload.received", {
      uploadId,
      originalByteSize: validated.originalByteSize,
      inputFormat: validated.inputFormat,
    });
    try {
      await storage.upload({
        key: temporaryKey,
        content: validated.content,
        contentType: validated.claimedMimeType,
      });
      temporaryStored = true;
    } catch (cause) {
      logMediaEvent(
        "storage.failed",
        { uploadId, stage: "temporary_upload" },
        "error",
      );
      throw cause;
    }
    logMediaEvent("validation.completed", { uploadId });
    logMediaEvent("processing.started", { uploadId });
    const processed = await processor.process({
      ...validated,
      content: await storage.get(temporaryKey),
    });
    logMediaEvent("processing.completed", {
      uploadId,
      originalByteSize: validated.originalByteSize,
      storedByteSize: processed.byteSize,
      reductionPercent:
        Math.round(
          (1 - processed.byteSize / validated.originalByteSize) * 10_000,
        ) / 100,
      attempts: processed.attempts,
    });

    await reserveStorage(
      database,
      context.user.id,
      IMAGE_UPLOAD_POLICY.maxStoredBytes,
    );
    reservationActive = true;
    finalKey = `users/${context.user.id}/media/${id}${processed.extension}`;
    try {
      await storage.upload({
        key: finalKey,
        content: processed.content,
        contentType: processed.mimeType,
      });
    } catch (cause) {
      logMediaEvent(
        "storage.failed",
        { uploadId, stage: "definitive_upload" },
        "error",
      );
      throw cause;
    }
    finalStored = true;

    const row = await database.transaction(async (transaction) => {
      const access = await requireWorkspacePermissionForUpdate(
        transaction,
        context.user.id,
        current.workspace.id,
        "workspace:read",
      );
      const [inserted] = await transaction
        .insert(storedFiles)
        .values({
          id,
          workspaceId: access.workspace.id,
          ownerUserId: context.user.id,
          purpose: validated.purpose,
          backend: storage.backend,
          status: "ready",
          storageKey: finalKey!,
          originalName: validated.originalName,
          originalMimeType: validated.claimedMimeType,
          originalByteSize: validated.originalByteSize,
          originalWidth: processed.originalWidth,
          originalHeight: processed.originalHeight,
          extension: processed.extension,
          mimeType: processed.mimeType,
          byteSize: processed.byteSize,
          width: processed.width,
          height: processed.height,
          sha256: processed.sha256,
        })
        .returning();
      if (!inserted) throw new Error("Metadados do arquivo não foram criados.");
      await finalizeStorageReservation(
        transaction as Database,
        context.user.id,
        IMAGE_UPLOAD_POLICY.maxStoredBytes,
        processed.byteSize,
      );
      await appendAdministrativeAuditLog(
        transaction,
        { userId: context.user.id, workspace: access },
        {
          action: "file.uploaded",
          targetType: "stored_file",
          targetId: inserted.id,
          metadata: {
            purpose: inserted.purpose,
            mimeType: inserted.mimeType,
            originalByteSize: validated.originalByteSize,
            byteSize: inserted.byteSize,
            sha256: inserted.sha256,
          },
        },
        request,
      );
      return inserted;
    });
    reservationActive = false;
    return summary(row);
  } catch (cause) {
    if (finalStored && finalKey) {
      await storage
        .delete(finalKey)
        .catch(() =>
          logMediaEvent(
            "storage.failed",
            { uploadId, stage: "definitive_rollback" },
            "error",
          ),
        );
    }
    if (reservationActive) {
      await releaseStorageReservation(
        database,
        context.user.id,
        IMAGE_UPLOAD_POLICY.maxStoredBytes,
      ).catch(() => undefined);
    }
    logMediaEvent(
      "upload.failed",
      { uploadId, errorType: cause instanceof Error ? cause.name : "unknown" },
      "error",
    );
    throw cause;
  } finally {
    if (temporaryStored) {
      await storage
        .delete(temporaryKey)
        .then(() => logMediaEvent("temporary.cleaned", { uploadId }))
        .catch(() =>
          logMediaEvent(
            "storage.failed",
            { uploadId, stage: "temporary_cleanup" },
            "error",
          ),
        );
    }
  }
}

export async function uploadPrivateMedia(
  database: Database,
  context: RequestAuthorizationContext,
  input: {
    purpose: "profile_avatar" | "attachment";
    originalName: string;
    claimedMimeType: string;
    content: Uint8Array;
  },
  request: AuditRequestMetadata,
  storage: PrivateFileStorage,
): Promise<StoredFileSummary> {
  if (!input.claimedMimeType.toLowerCase().startsWith("video/")) {
    return uploadPrivateImage(database, context, input, request, storage);
  }

  const current = requireActiveWorkspacePermission(context, "workspace:read");
  const validated = validateVideoUploadEnvelope(input);
  const id = randomUUID();
  const storageKey = `users/${context.user.id}/media/${id}${validated.extension}`;
  let reservationActive = false;
  let stored = false;

  try {
    await reserveStorage(database, context.user.id, MAX_VIDEO_UPLOAD_BYTES);
    reservationActive = true;
    await storage.upload({
      key: storageKey,
      content: validated.content,
      contentType: validated.claimedMimeType,
    });
    stored = true;
    const sha256 = createHash("sha256").update(validated.content).digest("hex");

    const row = await database.transaction(async (transaction) => {
      const access = await requireWorkspacePermissionForUpdate(
        transaction,
        context.user.id,
        current.workspace.id,
        "workspace:read",
      );
      const [inserted] = await transaction
        .insert(storedFiles)
        .values({
          id,
          workspaceId: access.workspace.id,
          ownerUserId: context.user.id,
          purpose: "attachment",
          backend: storage.backend,
          status: "ready",
          storageKey,
          originalName: validated.originalName,
          originalMimeType: validated.claimedMimeType,
          originalByteSize: validated.originalByteSize,
          extension: validated.extension,
          mimeType: validated.claimedMimeType,
          byteSize: validated.originalByteSize,
          sha256,
        })
        .returning();
      if (!inserted) throw new Error("Metadados do arquivo não foram criados.");
      await finalizeStorageReservation(
        transaction as Database,
        context.user.id,
        MAX_VIDEO_UPLOAD_BYTES,
        validated.originalByteSize,
      );
      await appendAdministrativeAuditLog(
        transaction,
        { userId: context.user.id, workspace: access },
        {
          action: "file.uploaded",
          targetType: "stored_file",
          targetId: inserted.id,
          metadata: {
            purpose: inserted.purpose,
            mimeType: inserted.mimeType,
            originalByteSize: validated.originalByteSize,
            byteSize: inserted.byteSize,
            sha256: inserted.sha256,
          },
        },
        request,
      );
      return inserted;
    });
    reservationActive = false;
    return summary(row);
  } catch (cause) {
    if (stored) await storage.delete(storageKey).catch(() => undefined);
    if (reservationActive) {
      await releaseStorageReservation(
        database,
        context.user.id,
        MAX_VIDEO_UPLOAD_BYTES,
      ).catch(() => undefined);
    }
    throw cause;
  }
}

export async function getPrivateFileContent(
  database: Database,
  context: RequestAuthorizationContext,
  fileId: string,
  storage: PrivateFileStorage,
): Promise<StoredFileContent> {
  const row = await readyRow(database, fileId);
  await authorizeRead(database, context, row);
  if (row.backend !== storage.backend) {
    throw new Error(
      `O backend ${row.backend} não está configurado neste processo.`,
    );
  }
  return {
    bytes: await storage.get(row.storageKey),
    mimeType: row.mimeType,
    originalName: row.originalName,
    sha256: row.sha256,
  };
}

export async function getPublicFileContent(
  database: Database,
  fileId: string,
  storage: PrivateFileStorage,
): Promise<StoredFileContent> {
  const row = await readyRow(database, fileId);
  const reference = await database.execute<{ allowed: boolean }>(sql`
    select true as allowed
    from app.users owner
    where owner.id = ${row.ownerUserId}::uuid
      and owner.deleted_at is null
      and (
        (${row.purpose} = 'profile_avatar'
          and (
            owner.avatar_url = ${`/api/files/${row.id}/content`}
            or exists (
              select 1
              from app.user_preferences preference
              where preference.user_id = owner.id
                and preference.settings #>> '{profile,cover}' = ${`/api/files/${row.id}/content`}
            )
          ))
        or (${row.purpose} = 'attachment' and exists (
          select 1
          from app.social_post_blocks block
          inner join app.social_posts post on post.id = block.post_id
          where block.file_id = ${row.id}::uuid
            and post.author_user_id = owner.id
            and post.kind = 'portfolio'
            and post.community_id is null
            and post.deleted_at is null
        ))
      )
    limit 1
  `);
  if (!reference.rows[0]?.allowed) throw new StoredFileNotFoundError();
  if (row.backend !== storage.backend) {
    throw new Error(
      `O backend ${row.backend} não está configurado neste processo.`,
    );
  }
  return {
    bytes: await storage.get(row.storageKey),
    mimeType: row.mimeType,
    originalName: row.originalName,
    sha256: row.sha256,
  };
}

export async function assertOwnedProfileFile(
  database: Database,
  context: RequestAuthorizationContext,
  url: string,
): Promise<void> {
  const fileId = storedFileIdFromPrivateUrl(url);
  if (!fileId) return;
  const row = await readyRow(database, fileId);
  if (row.ownerUserId !== context.user.id || row.purpose !== "profile_avatar") {
    throw new StoredFilePermissionDeniedError();
  }
}

export async function deletePrivateFile(
  database: Database,
  context: RequestAuthorizationContext,
  fileId: string,
  request: AuditRequestMetadata,
  storage: PrivateFileStorage,
): Promise<void> {
  const row = await rowById(database, fileId);
  if (row.ownerUserId !== context.user.id) {
    throw new StoredFilePermissionDeniedError();
  }
  if (row.deletedAt) return;
  if (row.backend !== storage.backend) {
    throw new Error(
      `O backend ${row.backend} não está configurado neste processo.`,
    );
  }

  await database
    .update(storedFiles)
    .set({ status: "deleting", updatedAt: new Date() })
    .where(and(eq(storedFiles.id, row.id), isNull(storedFiles.deletedAt)));
  try {
    await storage.delete(row.storageKey);
  } catch (cause) {
    logMediaEvent(
      "storage.failed",
      { fileId: row.id, stage: "definitive_delete" },
      "error",
    );
    throw cause;
  }

  await database.transaction(async (transaction) => {
    const access = await requireWorkspacePermissionForUpdate(
      transaction,
      context.user.id,
      row.workspaceId,
      "workspace:read",
    );
    const deleted = await transaction
      .update(storedFiles)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(storedFiles.id, row.id), isNull(storedFiles.deletedAt)))
      .returning({ byteSize: storedFiles.byteSize });
    if (deleted.length === 1) {
      await decrementStorageUsage(
        transaction as Database,
        row.ownerUserId,
        deleted[0]!.byteSize,
      );
      await appendAdministrativeAuditLog(
        transaction,
        { userId: context.user.id, workspace: access },
        {
          action: "file.deleted",
          targetType: "stored_file",
          targetId: row.id,
          metadata: { purpose: row.purpose, byteSize: row.byteSize },
        },
        request,
      );
    }
  });
  logMediaEvent("media.deleted", {
    fileId: row.id,
    userId: context.user.id,
    byteSize: row.byteSize,
  });
}
