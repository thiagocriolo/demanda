import "dotenv/config";
import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { parseServerEnvironment } from "../../src/lib/server/config/env-schema";
import {
  createDatabase,
  type Database,
} from "../../src/lib/server/db/database";
import { createDatabasePool } from "../../src/lib/server/db/pool";
import { users } from "../../src/lib/server/db/schema";
import {
  createPersonalTask,
  deletePersonalTask,
  listPersonalTasks,
  updatePersonalTask,
} from "../../src/lib/server/personal-tasks/service";

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

describe("tarefas pessoais do Dashboard", () => {
  afterAll(() => pool.end());

  it("persiste, ordena e isola as tarefas por usuário", async () => {
    await withRollback(async (database) => {
      const owner = await insertUser(database, "PersonalTaskOwner");
      const other = await insertUser(database, "PersonalTaskOther");

      const first = await createPersonalTask(database, owner.id, "Primeira");
      const second = await createPersonalTask(database, owner.id, "Segunda");

      expect(await listPersonalTasks(database, owner.id)).toEqual([
        first,
        second,
      ]);
      expect(await listPersonalTasks(database, other.id)).toEqual([]);

      const completed = await updatePersonalTask(
        database,
        owner.id,
        first.id,
        true,
      );
      expect(completed).toMatchObject({ id: first.id, done: true });
      expect(
        await updatePersonalTask(database, other.id, first.id, true),
      ).toBeNull();

      expect(await deletePersonalTask(database, other.id, second.id)).toBe(
        false,
      );
      expect(await deletePersonalTask(database, owner.id, second.id)).toBe(
        true,
      );
      expect(await listPersonalTasks(database, owner.id)).toEqual([completed]);
    });
  });
});
