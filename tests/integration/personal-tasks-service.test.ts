import "dotenv/config";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { parseServerEnvironment } from "../../src/lib/server/config/env-schema";
import {
  createDatabase,
  type Database,
} from "../../src/lib/server/db/database";
import { createDatabasePool } from "../../src/lib/server/db/pool";
import { users } from "../../src/lib/server/db/schema";
import {
  createPersonalDelivery,
  deletePersonalDelivery,
  listPersonalDeliveries,
  updatePersonalDelivery,
} from "../../src/lib/server/personal-deliveries/service";

const pool = createDatabasePool(parseServerEnvironment(process.env));
const database = createDatabase(pool);

class RollbackFixture extends Error {}

async function withRollback(
  run: (database: Database) => Promise<void>,
): Promise<void> {
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
  const id = randomUUID();
  await database.insert(users).values({
      id,
      name: label,
      username: `${label.toLowerCase()}_${suffix}`,
      email: `${label.toLowerCase()}-${suffix}@example.test`,
    });
  const [user] = await database.select().from(users).where(eq(users.id, id));
  if (!user) throw new Error("Usuário de teste não criado.");
  return user;
}

describe("tarefas pessoais do Dashboard", () => {
  afterAll(() => pool.end());

  it("persiste, ordena e isola as tarefas por usuário", async () => {
    await withRollback(async (database) => {
      const owner = await insertUser(database, "PersonalDeliveryOwner");
      const other = await insertUser(database, "PersonalDeliveryOther");

      const first = await createPersonalDelivery(database, owner.id, "Primeira");
      const second = await createPersonalDelivery(database, owner.id, "Segunda");

      expect(await listPersonalDeliveries(database, owner.id)).toEqual([
        first,
        second,
      ]);
      expect(await listPersonalDeliveries(database, other.id)).toEqual([]);

      const completed = await updatePersonalDelivery(
        database,
        owner.id,
        first.id,
        true,
      );
      expect(completed).toMatchObject({ id: first.id, done: true });
      expect(
        await updatePersonalDelivery(database, other.id, first.id, true),
      ).toBeNull();

      expect(await deletePersonalDelivery(database, other.id, second.id)).toBe(
        false,
      );
      expect(await deletePersonalDelivery(database, owner.id, second.id)).toBe(
        true,
      );
      expect(await listPersonalDeliveries(database, owner.id)).toEqual([completed]);
    });
  });
});
