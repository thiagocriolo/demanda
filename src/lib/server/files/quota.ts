import { and, eq, gte, isNull, or, sql } from "drizzle-orm";
import type { Database } from "../db/database";
import { userStorageUsage } from "../db/schema";

export class StorageQuotaExceededError extends Error {
  readonly status = 413;

  constructor() {
    super("A quota de armazenamento disponível foi excedida.");
    this.name = "StorageQuotaExceededError";
  }
}

async function ensureUsageRow(
  database: Database,
  userId: string,
): Promise<void> {
  await database
    .insert(userStorageUsage)
    .values({ userId })
    .onConflictDoNothing({ target: userStorageUsage.userId });
}

export async function reserveStorage(
  database: Database,
  userId: string,
  bytes: number,
): Promise<void> {
  await database.transaction(async (transaction) => {
    await ensureUsageRow(transaction as Database, userId);
    const reserved = await transaction
      .update(userStorageUsage)
      .set({
        storageReservedBytes: sql`${userStorageUsage.storageReservedBytes} + ${bytes}`,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(userStorageUsage.userId, userId),
          or(
            isNull(userStorageUsage.storageLimitBytes),
            gte(
              userStorageUsage.storageLimitBytes,
              sql`${userStorageUsage.storageUsedBytes} + ${userStorageUsage.storageReservedBytes} + ${bytes}`,
            ),
          ),
        ),
      )
      .returning({ userId: userStorageUsage.userId });
    if (reserved.length !== 1) throw new StorageQuotaExceededError();
  });
}

export async function finalizeStorageReservation(
  database: Database,
  userId: string,
  reservedBytes: number,
  storedBytes: number,
): Promise<void> {
  const updated = await database
    .update(userStorageUsage)
    .set({
      storageReservedBytes: sql`${userStorageUsage.storageReservedBytes} - ${reservedBytes}`,
      storageUsedBytes: sql`${userStorageUsage.storageUsedBytes} + ${storedBytes}`,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(userStorageUsage.userId, userId),
        gte(userStorageUsage.storageReservedBytes, reservedBytes),
      ),
    )
    .returning({ userId: userStorageUsage.userId });
  if (updated.length !== 1) {
    throw new Error("A reserva de armazenamento não pôde ser confirmada.");
  }
}

export async function releaseStorageReservation(
  database: Database,
  userId: string,
  reservedBytes: number,
): Promise<void> {
  await database
    .update(userStorageUsage)
    .set({
      storageReservedBytes: sql`greatest(0, ${userStorageUsage.storageReservedBytes} - ${reservedBytes})`,
      updatedAt: new Date(),
    })
    .where(eq(userStorageUsage.userId, userId));
}

export async function decrementStorageUsage(
  database: Database,
  userId: string,
  storedBytes: number,
): Promise<void> {
  await ensureUsageRow(database, userId);
  await database
    .update(userStorageUsage)
    .set({
      storageUsedBytes: sql`greatest(0, ${userStorageUsage.storageUsedBytes} - ${storedBytes})`,
      updatedAt: new Date(),
    })
    .where(eq(userStorageUsage.userId, userId));
}

export type UserStorageUsage = {
  storageUsedBytes: number;
  storageReservedBytes: number;
  storageLimitBytes: number | null;
};

export async function getUserStorageUsage(
  database: Database,
  userId: string,
): Promise<UserStorageUsage> {
  await ensureUsageRow(database, userId);
  const [row] = await database
    .select({
      storageUsedBytes: userStorageUsage.storageUsedBytes,
      storageReservedBytes: userStorageUsage.storageReservedBytes,
      storageLimitBytes: userStorageUsage.storageLimitBytes,
    })
    .from(userStorageUsage)
    .where(eq(userStorageUsage.userId, userId))
    .limit(1);
  if (!row) throw new Error("Uso de armazenamento não inicializado.");
  return row;
}

/** Recalcula o uso real a partir dos metadados ativos, sem tocar em reservas. */
export async function reconcileStorageUsage(database: Database): Promise<void> {
  await database.execute(sql`
    insert into app.user_storage_usage (
      user_id,
      storage_used_bytes,
      storage_reserved_bytes,
      updated_at
    )
    select users.id,
           coalesce(sum(files.byte_size) filter (where files.deleted_at is null), 0),
           0,
           now()
    from app.users as users
    left join app.stored_files as files on files.owner_user_id = users.id
    group by users.id
    on conflict (user_id) do update
    set storage_used_bytes = excluded.storage_used_bytes,
        updated_at = now()
  `);
}
