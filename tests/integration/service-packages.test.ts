import "dotenv/config";
import { randomUUID } from "node:crypto";
import { and, count, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createDatabase,
  type Database,
} from "../../src/lib/server/db/database";
import { createDatabasePool } from "../../src/lib/server/db/pool";
import { parseServerEnvironment } from "../../src/lib/server/config/env-schema";
import { applyRuntimeSchema } from "../../src/lib/server/db/runtime-schema";
import {
  businesses,
  contracts,
  deliveries,
  deliveryTasks,
  projects,
  servicePackages,
  services,
  users,
  workspaceMembers,
  workspaces,
} from "../../src/lib/server/db/schema";
import type { RequestAuthorizationContext } from "../../src/lib/server/authorization/workspace-context";
import {
  copyRealDelivery,
  copyRealProject,
} from "../../src/lib/server/service-packages/sources";
import {
  createUserServicePackage,
  duplicateUserServicePackage,
  getUserServicePackage,
  instantiateServicePackageForContractInTransaction,
} from "../../src/lib/server/service-packages/service";
import {
  normalizeServicePackageInput,
  servicePackageMutationSchema,
} from "../../src/lib/server/service-packages/validation";

const pool = createDatabasePool(parseServerEnvironment(process.env));
const database = createDatabase(pool);
class Rollback extends Error {}
async function fixture(
  run: (
    db: Database,
    context: RequestAuthorizationContext,
    contract: typeof contracts.$inferSelect,
  ) => Promise<void>,
) {
  try {
    await database.transaction(async (transaction) => {
      const db = transaction as unknown as Database;
      const userId = randomUUID(),
        workspaceId = randomUUID(),
        businessId = randomUUID(),
        contractId = randomUUID();
      await db
        .insert(users)
        .values({
          id: userId,
          name: "Serviços QA",
          username: `qa_${userId.slice(0, 8)}`,
          email: `${userId}@example.test`,
        });
      await db
        .insert(workspaces)
        .values({
          id: workspaceId,
          ownerUserId: userId,
          name: "Serviços QA",
          kind: "shared",
        });
      await db
        .insert(workspaceMembers)
        .values({ workspaceId, userId, role: "owner" });
      await db
        .insert(businesses)
        .values({
          id: businessId,
          workspaceId,
          ownerUserId: userId,
          name: "Cliente QA",
          stageKey: "ativo",
          categoryKey: "cliente",
        });
      await db
        .insert(contracts)
        .values({
          id: contractId,
          workspaceId,
          ownerUserId: userId,
          businessId,
          name: "Contrato QA",
          contractType: "recurring",
          startDate: "2026-11-01",
          endDate: "2026-11-30",
        });
      const [contract] = await db
        .select()
        .from(contracts)
        .where(eq(contracts.id, contractId));
      const [user] = await db.select().from(users).where(eq(users.id, userId));
      const now = new Date();
      const context: RequestAuthorizationContext = {
        user: {
          id: userId,
          username: user.username,
          name: user.name,
          email: user.email,
          avatarUrl: null,
        },
        session: {
          id: randomUUID(),
          userId,
          activeWorkspaceId: workspaceId,
          remembered: false,
          createdAt: now,
          lastSeenAt: now,
          expiresAt: new Date(now.getTime() + 60000),
        },
        activeWorkspace: {
          workspace: {
            id: workspaceId,
            name: "Servi?os QA",
            description: "",
            icon: "briefcase-business",
            color: "blue",
            kind: "shared",
            ownerUserId: userId,
          },
          membership: { userId, role: "owner", joinedAt: now },
        },
      };
      await run(db, context, contract);
      throw new Rollback();
    });
  } catch (cause) {
    if (!(cause instanceof Rollback)) throw cause;
  }
}

describe("serviços, composição avulsa e cópia de registros reais", () => {
  beforeAll(() => applyRuntimeSchema(database));
  afterAll(() => pool.end());

  it("persiste e duplica a cobrança do pacote sem impor a natureza dos projetos", async () => {
    await fixture(async (db, context) => {
      const input = normalizeServicePackageInput(
        servicePackageMutationSchema.parse({
          name: "Mensalidade",
          contractType: "recurring",
          amountCents: 10000,
          projects: [{ name: "Implantação", projectType: "one_off" }],
        }),
      );
      const saved = await createUserServicePackage(db, context.user.id, input);
      expect(
        (await getUserServicePackage(db, context.user.id, saved.id))
          .contractType,
      ).toBe("recurring");
      const copy = await duplicateUserServicePackage(
        db,
        context.user.id,
        saved.id,
      );
      expect(copy.contractType).toBe("recurring");
      expect(copy.projects[1].projectType).toBe("one_off");
      expect(copy.projects[1].id).not.toBe(saved.projects[1].id);
      await expect(
        getUserServicePackage(db, randomUUID(), saved.id),
      ).rejects.toThrow();
    });
  });

  it("cria escopo sem pacote e copia regras recorrentes uma vez, sem cadastrar modelos", async () => {
    await fixture(async (db, context, contract) => {
      const beforePackages = await db
        .select({ value: count() })
        .from(servicePackages);
      const beforeModels = await db.select({ value: count() }).from(services);
      const result = await instantiateServicePackageForContractInTransaction(
        db,
        {
          ownerUserId: context.user.id,
          workspaceId: contract.workspaceId,
          contract,
          selection: {
            responsibleUserId: context.user.id,
            customProjects: [
              {
                isInstitutional: false,
                name: "Rotina",
                briefing: "Produção",
                projectType: "recurring",
                durationDays: null,
                deliveries: [
                  {
                    name: "Publicação semanal",
                    description: "Briefing",
                    priority: "normal",
                    recurrenceType: "custom",
                    recurrenceUnit: "week",
                    recurrenceDays: [1, 3],
                    tasks: [{ name: "Criar", durationMinutes: 90 }],
                  },
                ],
              },
            ],
          },
        },
      );
      expect(result.createdProjectCount).toBe(1);
      const [project] = await db
        .select()
        .from(projects)
        .where(eq(projects.contractId, contract.id));
      const occurrences = await db
        .select()
        .from(deliveries)
        .where(eq(deliveries.projectId, project.id));
      expect(occurrences.length).toBeGreaterThan(1);
      const copy = await copyRealProject(db, context, project.id);
      expect(copy.deliveries).toHaveLength(1);
      expect(copy.deliveries[0]).toMatchObject({
        recurrenceType: "custom",
        recurrenceDays: [1, 3],
        tasks: [{ name: "Criar", durationMinutes: 90 }],
      });
      expect(copy).not.toHaveProperty("id");
      await db
        .update(deliveryTasks)
        .set({ statusKey: "concluida", executionAt: new Date() })
        .where(
          and(
            eq(deliveryTasks.workspaceId, contract.workspaceId),
            eq(deliveryTasks.deliveryId, occurrences[0].id),
          ),
        );
      const deliveryCopy = await copyRealDelivery(
        db,
        context,
        occurrences[0].id,
      );
      expect(deliveryCopy.tasks).toEqual([
        { name: "Criar", durationMinutes: 90 },
      ]);
      expect(await db.select({ value: count() }).from(servicePackages)).toEqual(
        beforePackages,
      );
      expect(await db.select({ value: count() }).from(services)).toEqual(
        beforeModels,
      );
      const outsider = {
        ...context,
        user: { ...context.user, id: randomUUID() },
      };
      await expect(copyRealProject(db, outsider, project.id)).rejects.toThrow();
      await expect(
        copyRealDelivery(db, outsider, occurrences[0].id),
      ).rejects.toThrow();
    });
  });
});
