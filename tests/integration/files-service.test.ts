import "dotenv/config";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import sharp from "sharp";
import { afterAll, describe, expect, it } from "vitest";
import type { RequestAuthorizationContext } from "../../src/lib/server/authorization/workspace-context";
import { parseServerEnvironment } from "../../src/lib/server/config/env-schema";
import {
  createDatabase,
  type Database,
} from "../../src/lib/server/db/database";
import { createDatabasePool } from "../../src/lib/server/db/pool";
import {
  auditLogs,
  storedFiles,
  userStorageUsage,
  userPreferences,
  users,
  workspaceMembers,
  workspaces,
  type WorkspaceRole,
} from "../../src/lib/server/db/schema";
import {
  deletePrivateFile,
  getPrivateFileContent,
  getPublicFileContent,
  StoredFileNotFoundError,
  StoredFilePermissionDeniedError,
  uploadPrivateImage,
} from "../../src/lib/server/files/service";
import { cleanupPrivateMedia } from "../../src/lib/server/files/cleanup";
import {
  releaseStorageReservation,
  reserveStorage,
} from "../../src/lib/server/files/quota";
import {
  getUserSettings,
  updateUserSettings,
} from "../../src/lib/server/settings/service";
import type {
  PrivateFileStorage,
  StoredObject,
} from "../../src/lib/server/files/storage";

const pool = createDatabasePool(parseServerEnvironment(process.env));
const database = createDatabase(pool);

class RollbackFixture extends Error {}

class MemoryStorage implements PrivateFileStorage {
  readonly backend = "local" as const;
  readonly objects = new Map<string, Uint8Array>();
  async upload(object: StoredObject): Promise<void> {
    if (this.objects.has(object.key)) throw new Error("Objeto já existe.");
    this.objects.set(object.key, Uint8Array.from(object.content));
  }
  async get(key: string): Promise<Uint8Array> {
    const value = this.objects.get(key);
    if (!value) throw new Error("Objeto ausente.");
    return Uint8Array.from(value);
  }
  async delete(key: string): Promise<void> {
    this.objects.delete(key);
  }
  async exists(key: string): Promise<boolean> {
    return this.objects.has(key);
  }
  async getMetadata(key: string) {
    const value = this.objects.get(key);
    return value
      ? { key, byteSize: value.byteLength, lastModified: new Date() }
      : null;
  }
  async list(prefix: string) {
    return [...this.objects.entries()]
      .filter(([key]) => key.startsWith(prefix))
      .map(([key, value]) => ({
        key,
        byteSize: value.byteLength,
        lastModified: new Date(),
      }));
  }
}

async function withRollback(run: (database: Database) => Promise<void>) {
  try {
    await database.transaction(async (transaction) => {
      await run(transaction as unknown as Database);
      throw new RollbackFixture();
    });
  } catch (cause) {
    if (cause instanceof RollbackFixture) return;
    throw cause;
  }
}

async function insertUser(database: Database, label: string) {
  const suffix = randomUUID().replaceAll("-", "").slice(0, 16);
  const [user] = await database
    .insert(users)
    .values({
      name: label,
      username: `${label.toLowerCase()}_${suffix}`,
      email: `${label.toLowerCase()}-${suffix}@example.test`,
    })
    .returning();
  if (!user) throw new Error("Usuário de teste não criado.");
  return user;
}

async function fixture(database: Database) {
  const owner = await insertUser(database, "FileOwner");
  const member = await insertUser(database, "FileMember");
  const outsider = await insertUser(database, "FileOutsider");
  const [workspace] = await database
    .insert(workspaces)
    .values({ name: "Arquivos privados", ownerUserId: owner.id })
    .returning();
  const [otherWorkspace] = await database
    .insert(workspaces)
    .values({ name: "Outro workspace", ownerUserId: outsider.id })
    .returning();
  if (!workspace || !otherWorkspace) throw new Error("Workspace não criado.");
  await database.insert(workspaceMembers).values({
    workspaceId: workspace.id,
    userId: member.id,
    role: "member",
  });
  const context = (
    user: typeof users.$inferSelect,
    active: typeof workspaces.$inferSelect,
    role: WorkspaceRole,
  ): RequestAuthorizationContext => {
    const now = new Date();
    return {
      user: {
        id: user.id,
        name: user.name,
        username: user.username,
        email: user.email,
        avatarUrl: user.avatarUrl,
      },
      session: {
        id: randomUUID(),
        userId: user.id,
        activeWorkspaceId: active.id,
        remembered: false,
        createdAt: now,
        lastSeenAt: now,
        expiresAt: new Date(now.getTime() + 60_000),
      },
      activeWorkspace: {
        workspace: {
          id: active.id,
          name: active.name,
          description: active.description,
          icon: active.icon,
          color: active.color,
          kind: active.kind,
          ownerUserId: active.ownerUserId,
        },
        membership: { userId: user.id, role, joinedAt: now },
      },
    };
  };
  return {
    owner,
    ownerContext: context(owner, workspace, "owner"),
    memberContext: context(member, workspace, "member"),
    outsiderContext: context(outsider, otherWorkspace, "owner"),
  };
}

async function png(): Promise<Uint8Array> {
  return sharp({
    create: { width: 128, height: 128, channels: 3, background: "#5dac83" },
  })
    .png()
    .toBuffer();
}

describe("BE-13: arquivos privados", () => {
  it("serializa reservas concorrentes sem ultrapassar a quota", async () => {
    const user = await insertUser(database, "QuotaRace");
    try {
      await database.insert(userStorageUsage).values({
        userId: user.id,
        storageLimitBytes: 1_048_576,
      });
      const attempts = await Promise.allSettled([
        reserveStorage(database, user.id, 700_000),
        reserveStorage(database, user.id, 700_000),
      ]);
      expect(
        attempts.filter(({ status }) => status === "fulfilled"),
      ).toHaveLength(1);
      expect(
        attempts.filter(({ status }) => status === "rejected"),
      ).toHaveLength(1);
      await releaseStorageReservation(database, user.id, 700_000);
      const [usage] = await database
        .select()
        .from(userStorageUsage)
        .where(eq(userStorageUsage.userId, user.id));
      expect(usage?.storageReservedBytes).toBe(0);
    } finally {
      await database.delete(users).where(eq(users.id, user.id));
    }
  });

  it("faz upload, persiste metadados, lê no workspace e audita", () =>
    withRollback(async (transaction) => {
      const data = await fixture(transaction);
      const storage = new MemoryStorage();
      const content = await png();
      const uploaded = await uploadPrivateImage(
        transaction,
        data.ownerContext,
        {
          purpose: "profile_avatar",
          originalName: "perfil.png",
          claimedMimeType: "image/png",
          content,
        },
        {},
        storage,
      );
      expect(uploaded.url).toBe(`/api/files/${uploaded.id}/content`);
      const [metadata] = await transaction
        .select()
        .from(storedFiles)
        .where(eq(storedFiles.id, uploaded.id));
      expect(metadata).toMatchObject({
        workspaceId: data.ownerContext.activeWorkspace?.workspace.id,
        ownerUserId: data.owner.id,
        status: "ready",
        originalMimeType: "image/png",
        originalByteSize: content.byteLength,
        mimeType: "image/jpeg",
        width: 128,
        height: 128,
      });
      const stored = await getPrivateFileContent(
        transaction,
        data.memberContext,
        uploaded.id,
        storage,
      );
      expect(stored.bytes).not.toEqual(Uint8Array.from(content));
      expect((await sharp(stored.bytes).metadata()).format).toBe("jpeg");
      expect([...storage.objects.keys()]).toEqual([metadata!.storageKey]);
      const [usage] = await transaction
        .select()
        .from(userStorageUsage)
        .where(eq(userStorageUsage.userId, data.owner.id));
      expect(usage).toMatchObject({
        storageUsedBytes: metadata!.byteSize,
        storageReservedBytes: 0,
      });
      const actions = await transaction
        .select({ action: auditLogs.action })
        .from(auditLogs)
        .where(eq(auditLogs.targetId, uploaded.id));
      expect(actions).toContainEqual({ action: "file.uploaded" });
    }));

  it("oculta arquivo de outro workspace e restringe exclusão ao proprietário", () =>
    withRollback(async (transaction) => {
      const data = await fixture(transaction);
      const storage = new MemoryStorage();
      const uploaded = await uploadPrivateImage(
        transaction,
        data.ownerContext,
        {
          purpose: "profile_avatar",
          originalName: "perfil.png",
          claimedMimeType: "image/png",
          content: await png(),
        },
        {},
        storage,
      );
      await expect(
        getPrivateFileContent(
          transaction,
          data.outsiderContext,
          uploaded.id,
          storage,
        ),
      ).rejects.toBeInstanceOf(StoredFileNotFoundError);
      await expect(
        deletePrivateFile(
          transaction,
          data.memberContext,
          uploaded.id,
          {},
          storage,
        ),
      ).rejects.toBeInstanceOf(StoredFilePermissionDeniedError);
      await deletePrivateFile(
        transaction,
        data.ownerContext,
        uploaded.id,
        {},
        storage,
      );
      expect(storage.objects.size).toBe(0);
      await expect(
        deletePrivateFile(
          transaction,
          data.ownerContext,
          uploaded.id,
          {},
          storage,
        ),
      ).resolves.toBeUndefined();
      const [usage] = await transaction
        .select()
        .from(userStorageUsage)
        .where(eq(userStorageUsage.userId, data.owner.id));
      expect(usage?.storageUsedBytes).toBe(0);
      await expect(
        getPrivateFileContent(
          transaction,
          data.ownerContext,
          uploaded.id,
          storage,
        ),
      ).rejects.toBeInstanceOf(StoredFileNotFoundError);
    }));

  it("vincula foto e capa ao perfil, publica ambas e impede reutilização por outro usuário", () =>
    withRollback(async (transaction) => {
      const data = await fixture(transaction);
      const storage = new MemoryStorage();
      const uploaded = await uploadPrivateImage(
        transaction,
        data.ownerContext,
        {
          purpose: "profile_avatar",
          originalName: "perfil.png",
          claimedMimeType: "image/png",
          content: await png(),
        },
        {},
        storage,
      );
      const initial = await getUserSettings(transaction, data.ownerContext);
      const uploadedCover = await uploadPrivateImage(
        transaction,
        data.ownerContext,
        {
          purpose: "profile_avatar",
          originalName: "capa.png",
          claimedMimeType: "image/png",
          content: await png(),
        },
        {},
        storage,
      );
      const saved = await updateUserSettings(transaction, data.ownerContext, {
        version: initial.version,
        settings: {
          ...initial.settings,
          profile: {
            ...initial.settings.profile,
            photo: uploaded.url,
            cover: uploadedCover.url,
          },
        },
      });
      expect(saved.settings.profile.photo).toBe(uploaded.url);
      expect(saved.settings.profile.cover).toBe(uploadedCover.url);
      await expect(
        getPublicFileContent(transaction, uploaded.id, storage),
      ).resolves.toMatchObject({
        mimeType: expect.stringMatching(/^image\//u),
      });
      await expect(
        getPublicFileContent(transaction, uploadedCover.id, storage),
      ).resolves.toMatchObject({
        mimeType: expect.stringMatching(/^image\//u),
      });
      const [preference] = await transaction
        .select({ settings: userPreferences.settings })
        .from(userPreferences)
        .where(eq(userPreferences.userId, data.owner.id));
      expect(JSON.stringify(preference?.settings)).not.toContain("data:image");
      const [persistedUser] = await transaction
        .select({ avatarUrl: users.avatarUrl })
        .from(users)
        .where(eq(users.id, data.owner.id));
      expect(persistedUser?.avatarUrl).toBe(uploaded.url);

      const memberSettings = await getUserSettings(
        transaction,
        data.memberContext,
      );
      await expect(
        updateUserSettings(transaction, data.memberContext, {
          version: memberSettings.version,
          settings: {
            ...memberSettings.settings,
            profile: {
              ...memberSettings.settings.profile,
              photo: uploaded.url,
            },
          },
        }),
      ).rejects.toBeInstanceOf(StoredFilePermissionDeniedError);
    }));

  it("mantém anexos privados ao proprietário e limpa temporários e órfãos com confirmação", () =>
    withRollback(async (transaction) => {
      const data = await fixture(transaction);
      const storage = new MemoryStorage();
      const uploaded = await uploadPrivateImage(
        transaction,
        data.ownerContext,
        {
          purpose: "attachment",
          originalName: "anexo.png",
          claimedMimeType: "image/png",
          content: await png(),
        },
        {},
        storage,
      );
      await expect(
        getPrivateFileContent(
          transaction,
          data.memberContext,
          uploaded.id,
          storage,
        ),
      ).rejects.toBeInstanceOf(StoredFileNotFoundError);

      await storage.upload({
        key: `temp/${data.owner.id}/${randomUUID()}.upload`,
        content: new Uint8Array([1]),
        contentType: "application/octet-stream",
      });
      const orphanKey = `users/${data.owner.id}/media/${randomUUID()}.jpg`;
      await storage.upload({
        key: orphanKey,
        content: new Uint8Array([1]),
        contentType: "image/jpeg",
      });
      const future = new Date(Date.now() + 2 * 24 * 60 * 60 * 1_000);
      const dryRun = await cleanupPrivateMedia(transaction, storage, {
        now: future,
      });
      expect(dryRun.temporaryDeleted).toHaveLength(1);
      expect(dryRun.orphanKeys).toContain(orphanKey);
      expect(await storage.exists(orphanKey)).toBe(true);
      const cleanup = await cleanupPrivateMedia(transaction, storage, {
        now: future,
        deleteOrphans: true,
      });
      expect(cleanup.orphanKeysDeleted).toContain(orphanKey);
      expect(await storage.exists(orphanKey)).toBe(false);
    }));
});

afterAll(async () => {
  await pool.end();
});
