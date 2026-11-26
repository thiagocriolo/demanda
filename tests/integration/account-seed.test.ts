import "dotenv/config";
import { randomUUID } from "node:crypto";
import { and, asc, eq, inArray } from "drizzle-orm";
import { afterAll, expect, it } from "vitest";
import { parseServerEnvironment } from "../../src/lib/server/config/env-schema";
import {
  createDatabase,
  type Database,
} from "../../src/lib/server/db/database";
import { createDatabasePool } from "../../src/lib/server/db/pool";
import {
  businessResponsibles,
  businesses,
  contactEmails,
  contacts,
  contractInstallments,
  contracts,
  deliveries,
  deliveryTasks,
  projects,
  users,
  workspaceMembers,
  workspaces,
} from "../../src/lib/server/db/schema";
import { seedAccountData } from "../../src/lib/server/settings/account-seed-service";

const pool = createDatabasePool(parseServerEnvironment(process.env));
const database = createDatabase(pool);
afterAll(() => pool.end());

class RollbackFixture extends Error {}

it("creates the linked account seed once and preserves existing data", async () => {
  try {
    await database.transaction(async (transaction) => {
      const ownerUserId = randomUUID();
      const personalId = randomUUID();
      await transaction.insert(users).values({
        id: ownerUserId,
        name: "Seed integration",
        username: `seed-${ownerUserId.slice(0, 12)}`,
        email: `${ownerUserId}@example.test`,
      });
      await transaction.insert(workspaces).values({
        id: personalId,
        ownerUserId,
        name: "Pessoal",
        kind: "personal",
      });
      await transaction.insert(workspaceMembers).values({
        workspaceId: personalId,
        userId: ownerUserId,
        role: "owner",
      });
      const existingContactId = randomUUID();
      await transaction.insert(contacts).values({
        id: existingContactId,
        workspaceId: personalId,
        ownerUserId,
        name: "Contato existente",
      });

      const scoped = transaction as unknown as Database;
      expect(await seedAccountData(scoped, ownerUserId)).toEqual({
        created: true,
        totals: {
          workspaces: 2,
          people: 20,
          businesses: 30,
          contracts: 40,
          projects: 60,
          deliveries: 100,
          tasks: 342,
        },
      });
      expect(await seedAccountData(scoped, ownerUserId)).toEqual({
        created: false,
      });

      const spaces = await transaction
        .select()
        .from(workspaces)
        .where(eq(workspaces.ownerUserId, ownerUserId));
      expect(spaces.map(({ name }) => name)).toEqual(
        expect.arrayContaining([
          "Pessoal",
          "Agência TAL",
          "Estúdio X de Design",
        ]),
      );
      expect(spaces).toHaveLength(3);
      const spaceIds = spaces.map(({ id }) => id);
      const people = await transaction
        .select()
        .from(contacts)
        .where(eq(contacts.ownerUserId, ownerUserId));
      expect(people).toHaveLength(21);
      expect(people).toContainEqual(
        expect.objectContaining({
          id: existingContactId,
          name: "Contato existente",
        }),
      );
      const [helena] = await transaction
        .select()
        .from(contactEmails)
        .where(
          and(
            eq(contactEmails.workspaceId, personalId),
            eq(contactEmails.address, "helena.vasconcelos@example.com"),
          ),
        );
      const seedBusinesses = await transaction
        .select()
        .from(businesses)
        .where(eq(businesses.ownerUserId, ownerUserId));
      expect(seedBusinesses).toHaveLength(30);
      const ambar = seedBusinesses.find(
        ({ name }) => name === "Âmbar Arquitetura",
      );
      expect(ambar).toBeDefined();
      const [partner] = await transaction
        .select()
        .from(businessResponsibles)
        .where(eq(businessResponsibles.businessId, ambar!.id));
      expect(partner?.contactId).toBe(helena?.contactId);
      expect(partner?.contactId).toBeTruthy();

      const seedContracts = await transaction
        .select()
        .from(contracts)
        .where(eq(contracts.ownerUserId, ownerUserId));
      expect(seedContracts).toHaveLength(40);
      const recurring = seedContracts.find(
        ({ name }) => name === "Gestão de Redes Sociais — Âmbar Semestral",
      );
      expect(recurring).toMatchObject({
        amountCents: 200000,
        businessId: ambar!.id,
        contractType: "recurring",
        workspaceId: spaces.find(({ name }) => name === "Agência TAL")?.id,
      });
      const installments = await transaction
        .select()
        .from(contractInstallments)
        .where(eq(contractInstallments.contractId, recurring!.id))
        .orderBy(asc(contractInstallments.number));
      expect(
        installments.map(({ dueDate, amountCents }) => [dueDate, amountCents]),
      ).toEqual([
        ["2026-11-05", 200000],
        ["2026-12-05", 200000],
        ["2027-01-05", 200000],
        ["2027-02-05", 200000],
        ["2027-03-05", 200000],
        ["2027-04-05", 200000],
      ]);

      const seedProjects = await transaction
        .select()
        .from(projects)
        .where(inArray(projects.workspaceId, spaceIds));
      const seedDeliveries = await transaction
        .select()
        .from(deliveries)
        .where(inArray(deliveries.workspaceId, spaceIds));
      const tasks = await transaction
        .select()
        .from(deliveryTasks)
        .where(inArray(deliveryTasks.workspaceId, spaceIds));
      expect(seedProjects).toHaveLength(60);
      expect(seedDeliveries).toHaveLength(100);
      expect(tasks).toHaveLength(342);
      expect(new Set(seedProjects.map(({ contractId }) => contractId))).toEqual(
        new Set(seedContracts.map(({ id }) => id)),
      );
      expect(new Set(seedDeliveries.map(({ projectId }) => projectId))).toEqual(
        new Set(seedProjects.map(({ id }) => id)),
      );
      const finished = seedDeliveries.find(
        ({ name }) => name === "Reunião de imersão da marca",
      );
      expect(finished?.completedAt).toBeInstanceOf(Date);
      expect(
        tasks
          .filter(({ deliveryId }) => deliveryId === finished!.id)
          .map(({ statusKey }) => statusKey),
      ).toEqual(["concluida", "concluida", "concluida"]);
      throw new RollbackFixture();
    });
  } catch (cause) {
    if (!(cause instanceof RollbackFixture)) throw cause;
  }
});
