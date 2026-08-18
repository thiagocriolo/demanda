import "dotenv/config";
import { createHash } from "node:crypto";
import { and, eq, isNotNull, isNull } from "drizzle-orm";
import sharp from "sharp";
import { parseServerEnvironment } from "../src/lib/server/config/env-schema";
import { createDatabase } from "../src/lib/server/db/database";
import { createDatabasePool } from "../src/lib/server/db/pool";
import { storedFiles } from "../src/lib/server/db/schema";
import { ImageProcessor } from "../src/lib/server/files/image-processor";
import { reconcileStorageUsage } from "../src/lib/server/files/quota";
import { createPrivateFileStorage } from "../src/lib/server/files/storage";
import { validateImageUploadEnvelope } from "../src/lib/server/files/validation";

const environment = parseServerEnvironment(process.env);
const pool = createDatabasePool(environment);
const database = createDatabase(pool);
const storage = createPrivateFileStorage(environment);
const purgeBackups = process.argv.includes("--purge-backups");

async function purgeVerifiedBackups(): Promise<number> {
  const rows = await database
    .select()
    .from(storedFiles)
    .where(
      and(
        eq(storedFiles.backend, storage.backend),
        isNotNull(storedFiles.legacyStorageKey),
        isNull(storedFiles.deletedAt),
      ),
    );
  let purged = 0;
  for (const row of rows) {
    const definitive = await storage.get(row.storageKey);
    const digest = createHash("sha256").update(definitive).digest("hex");
    if (digest !== row.sha256 || definitive.byteLength !== row.byteSize) {
      throw new Error(
        `A versão definitiva de ${row.id} falhou na verificação.`,
      );
    }
    await storage.delete(row.legacyStorageKey!);
    await database
      .update(storedFiles)
      .set({ legacyStorageKey: null, updatedAt: new Date() })
      .where(eq(storedFiles.id, row.id));
    purged += 1;
  }
  return purged;
}

async function migrate(): Promise<number> {
  const rows = await database
    .select()
    .from(storedFiles)
    .where(
      and(
        eq(storedFiles.backend, storage.backend),
        eq(storedFiles.status, "ready"),
        isNull(storedFiles.deletedAt),
        isNull(storedFiles.legacyStorageKey),
      ),
    );
  let migrated = 0;
  for (const row of rows) {
    if (
      row.originalMimeType &&
      row.originalByteSize &&
      row.storageKey.startsWith(`users/${row.ownerUserId}/media/`) &&
      row.byteSize <= 1024 * 1024
    ) {
      continue;
    }
    const original = await storage.get(row.storageKey);
    const originalMetadata = await sharp(original, {
      failOn: "error",
      limitInputPixels: 50_000_000,
    }).metadata();
    let accepted = original;
    let acceptedName = row.originalName;
    let acceptedMime = row.mimeType;
    if (!new Set(["jpeg", "png"]).has(originalMetadata.format ?? "")) {
      accepted = await sharp(original).png().toBuffer();
      acceptedName = "legacy-conversion.png";
      acceptedMime = "image/png";
    }
    const validated = validateImageUploadEnvelope({
      content: accepted,
      purpose: row.purpose,
      originalName: acceptedName,
      claimedMimeType: acceptedMime,
    });
    const processed = await new ImageProcessor().process(validated);
    const canonicalKey = `users/${row.ownerUserId}/media/${row.id}${processed.extension}`;
    const newKey =
      canonicalKey === row.storageKey
        ? `users/${row.ownerUserId}/media/${row.id}-migrated${processed.extension}`
        : canonicalKey;
    if (!(await storage.exists(newKey))) {
      await storage.upload({
        key: newKey,
        content: processed.content,
        contentType: processed.mimeType,
      });
    } else {
      const existing = await storage.get(newKey);
      const digest = createHash("sha256").update(existing).digest("hex");
      if (digest !== processed.sha256) {
        throw new Error(
          `A chave de destino de ${row.id} já existe com outro conteúdo.`,
        );
      }
    }
    await database
      .update(storedFiles)
      .set({
        storageKey: newKey,
        legacyStorageKey: row.storageKey,
        originalMimeType: row.mimeType,
        originalByteSize: row.byteSize,
        originalWidth: originalMetadata.width,
        originalHeight: originalMetadata.height,
        extension: processed.extension,
        mimeType: processed.mimeType,
        byteSize: processed.byteSize,
        width: processed.width,
        height: processed.height,
        sha256: processed.sha256,
        updatedAt: new Date(),
      })
      .where(eq(storedFiles.id, row.id));
    migrated += 1;
  }

  await reconcileStorageUsage(database);
  return migrated;
}

try {
  const count = purgeBackups ? await purgeVerifiedBackups() : await migrate();
  console.log(
    JSON.stringify({
      mode: purgeBackups
        ? "purge-verified-backups"
        : "migrate-and-keep-backups",
      count,
    }),
  );
} finally {
  await pool.end();
}
