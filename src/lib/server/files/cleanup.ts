import { and, eq, gt, inArray, isNull, lte } from "drizzle-orm";
import { affectedRows, type Database } from "../db/database";
import { storedFiles, userStorageUsage } from "../db/schema";
import { IMAGE_UPLOAD_POLICY } from "./config";
import { logMediaEvent } from "./observability";
import { decrementStorageUsage, reconcileStorageUsage } from "./quota";
import type { PrivateFileStorage } from "./storage";

export type MediaCleanupResult = {
  temporaryDeleted: string[];
  interruptedDeletionsCompleted: string[];
  staleRecordsDeleted: string[];
  orphanKeys: string[];
  orphanKeysDeleted: string[];
  staleReservationUsersReleased: number;
};

export async function cleanupPrivateMedia(
  database: Database,
  storage: PrivateFileStorage,
  options: {
    now?: Date;
    staleAfterMs?: number;
    deleteOrphans?: boolean;
  } = {},
): Promise<MediaCleanupResult> {
  const now = options.now ?? new Date();
  const staleAfterMs =
    options.staleAfterMs ?? IMAGE_UPLOAD_POLICY.temporaryObjectMaxAgeMs;
  const cutoff = new Date(now.getTime() - staleAfterMs);
  const result: MediaCleanupResult = {
    temporaryDeleted: [],
    interruptedDeletionsCompleted: [],
    staleRecordsDeleted: [],
    orphanKeys: [],
    orphanKeysDeleted: [],
    staleReservationUsersReleased: 0,
  };

  for (const object of await storage.list("temp/")) {
    if (object.lastModified > cutoff) continue;
    await storage.delete(object.key);
    result.temporaryDeleted.push(object.key);
    logMediaEvent("temporary.cleaned", {
      ageMs: now.getTime() - object.lastModified.getTime(),
    });
  }

  const interrupted = await database
    .select()
    .from(storedFiles)
    .where(
      and(
        eq(storedFiles.backend, storage.backend),
        eq(storedFiles.status, "deleting"),
        isNull(storedFiles.deletedAt),
      ),
    );
  for (const row of interrupted) {
    await storage.delete(row.storageKey);
    await database.transaction(async (transaction) => {
      const deleted = await transaction
        .update(storedFiles)
        .set({ deletedAt: now, updatedAt: now })
        .where(and(eq(storedFiles.id, row.id), isNull(storedFiles.deletedAt)));
      if (affectedRows(deleted) === 1) {
        await decrementStorageUsage(
          transaction as Database,
          row.ownerUserId,
          row.byteSize,
        );
      }
    });
    result.interruptedDeletionsCompleted.push(row.id);
  }

  const stale = await database
    .select()
    .from(storedFiles)
    .where(
      and(
        eq(storedFiles.backend, storage.backend),
        inArray(storedFiles.status, ["pending", "failed"]),
        isNull(storedFiles.deletedAt),
        lte(storedFiles.updatedAt, cutoff),
      ),
    );
  for (const row of stale) {
    await storage.delete(row.storageKey);
    await database.transaction(async (transaction) => {
      const deleted = await transaction
        .update(storedFiles)
        .set({ status: "deleting", deletedAt: now, updatedAt: now })
        .where(and(eq(storedFiles.id, row.id), isNull(storedFiles.deletedAt)));
      if (affectedRows(deleted) === 1) {
        await decrementStorageUsage(
          transaction as Database,
          row.ownerUserId,
          row.byteSize,
        );
      }
    });
    result.staleRecordsDeleted.push(row.id);
  }

  const referencedRows = await database
    .select({ storageKey: storedFiles.storageKey })
    .from(storedFiles)
    .where(
      and(
        eq(storedFiles.backend, storage.backend),
        isNull(storedFiles.deletedAt),
      ),
    );
  const referenced = new Set(referencedRows.map((row) => row.storageKey));
  for (const object of await storage.list("users/")) {
    if (referenced.has(object.key) || object.lastModified > cutoff) continue;
    result.orphanKeys.push(object.key);
    if (options.deleteOrphans) {
      await storage.delete(object.key);
      result.orphanKeysDeleted.push(object.key);
    }
  }

  const released = await database
    .update(userStorageUsage)
    .set({ storageReservedBytes: 0, updatedAt: now })
    .where(
      and(
        gt(userStorageUsage.storageReservedBytes, 0),
        lte(userStorageUsage.updatedAt, cutoff),
      ),
    );
  result.staleReservationUsersReleased = affectedRows(released);
  await reconcileStorageUsage(database);

  return result;
}
