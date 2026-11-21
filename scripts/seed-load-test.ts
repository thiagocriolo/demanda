/**
 * Cria uma massa isolada para teste de carga e navegação.
 * Entregas são `tasks` e as tarefas executáveis são `task_subtasks`.
 */
import "dotenv/config";
import { randomUUID } from "node:crypto";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { parseServerEnvironment } from "../src/lib/server/config/env-schema";
import { createDatabase } from "../src/lib/server/db/database";
import { createDatabasePool } from "../src/lib/server/db/pool";
import {
  authSessions,
  businesses,
  businessResponsibles,
  contacts,
  contracts,
  projects,
  taskSubtasks,
  tasks,
  users,
  workspaceMembers,
  workspaces,
} from "../src/lib/server/db/schema";

export const LOAD_SEED_USERNAME = "sararabranding";
export const LOAD_SEED_WORKSPACE_IDS = [
  "10000000-0000-4000-8000-000000000101",
  "10000000-0000-4000-8000-000000000102",
  "10000000-0000-4000-8000-000000000103",
  "10000000-0000-4000-8000-000000000104",
] as const;

const WORKSPACE_NAMES = [
  "Carga — Criação",
  "Carga — Marketing",
  "Carga — Produto",
  "Carga — Suporte",
] as const;
const WORKSPACE_COLORS = ["blue", "violet", "orange", "green"] as const;
const PEOPLE_PER_WORKSPACE = [8, 8, 7, 7] as const;
const BATCH_SIZE = 500;

type SeedTotals = {
  people: number;
  contracts: number;
  projects: number;
  deliveries: number;
  tasks: number;
};

function dateAfter(days: number): string {
  const value = new Date();
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

/** Runs only in non-production environments and replaces only this fixture. */
export async function seedLoadTestDatabase(): Promise<SeedTotals> {
  if (process.env.NODE_ENV === "production") {
    throw new Error("O seed de carga não pode rodar em produção.");
  }

  const environment = parseServerEnvironment(process.env);
  const pool = createDatabasePool(environment);
  const database = createDatabase(pool);
  const now = new Date();
  try {
    // A migration 0013 introduziu a cadeia contrato -> projeto.
    await pool.query("select 1 from contracts limit 1");
  } catch (error) {
    await pool.end();
    const detail = error instanceof Error ? ` (${error.message})` : "";
    throw new Error(
      `A tabela de contratos não está disponível. Execute \`npm run db:migrate\` antes de \`npm run db:seed:load\`.${detail}`,
    );
  }
  const [owner] = await database
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.username, LOAD_SEED_USERNAME), isNull(users.deletedAt)))
    .limit(1);
  if (!owner) {
    await pool.end();
    throw new Error(`O usuário @${LOAD_SEED_USERNAME} não foi encontrado.`);
  }
  const ownerUserId = owner.id;
  const contactRows: (typeof contacts.$inferInsert)[] = [];
  const businessRows: (typeof businesses.$inferInsert)[] = [];
  const responsibleRows: (typeof businessResponsibles.$inferInsert)[] = [];
  const contractRows: (typeof contracts.$inferInsert)[] = [];
  const projectRows: (typeof projects.$inferInsert)[] = [];
  const deliveryRows: (typeof tasks.$inferInsert)[] = [];
  const taskRows: (typeof taskSubtasks.$inferInsert)[] = [];

  let personNumber = 0;
  for (const [workspaceIndex, peopleCount] of PEOPLE_PER_WORKSPACE.entries()) {
    const workspaceId = LOAD_SEED_WORKSPACE_IDS[workspaceIndex]!;
    for (let personIndex = 0; personIndex < peopleCount; personIndex += 1) {
      personNumber += 1;
      const contactId = randomUUID();
      const businessId = randomUUID();
      const personName = `Pessoa de teste ${String(personNumber).padStart(2, "0")}`;
      contactRows.push({
        id: contactId,
        workspaceId,
        ownerUserId,
        name: personName,
        contactType: "person",
        status: "active",
        profession: "Contato para teste de carga",
        createdAt: now,
        updatedAt: now,
      });
      businessRows.push({
        id: businessId,
        workspaceId,
        ownerUserId,
        name: `Negócio — ${personName}`,
        categoryKey: "servicos",
        stageKey: "ativo",
        createdAt: now,
        updatedAt: now,
      });
      responsibleRows.push({
        id: randomUUID(),
        workspaceId,
        businessId,
        contactId,
        sortOrder: 0,
      });

      const contractCount = 1 + ((personNumber - 1) % 4);
      for (
        let contractIndex = 0;
        contractIndex < contractCount;
        contractIndex += 1
      ) {
        const contractId = randomUUID();
        const contractNumber = contractIndex + 1;
        contractRows.push({
          id: contractId,
          workspaceId,
          businessId,
          name: `Contrato ${contractNumber} — ${personName}`,
          amountCents:
            1_500_000 + personNumber * 10_000 + contractIndex * 5_000,
          firstDueDate: dateAfter(contractIndex * 7),
          paymentMethod: "Transferência bancária",
          paymentTerms: "Pagamento em parcelas mensais.",
          financeNotes: "Criado pelo seed de carga.",
          createdAt: now,
          updatedAt: now,
        });

        const projectCount = 1 + ((personNumber + contractIndex - 1) % 10);
        for (
          let projectIndex = 0;
          projectIndex < projectCount;
          projectIndex += 1
        ) {
          const projectId = randomUUID();
          const projectNumber = projectIndex + 1;
          projectRows.push({
            id: projectId,
            workspaceId,
            businessId,
            contractId,
            name: `Projeto ${projectNumber} — ${personName}`,
            statusKey: "planejamento",
            briefing: "Projeto gerado para validar listas, filtros e detalhes.",
            startDate: dateAfter(projectIndex),
            endDate: dateAfter(projectIndex + 30),
            engagementType: "fee",
            contractType: "one_off",
            amountCents: 50_000 + projectIndex * 2_500,
            createdAt: now,
            updatedAt: now,
          });

          const deliveryCount =
            3 + ((personNumber + contractIndex + projectIndex) % 8);
          for (
            let deliveryIndex = 0;
            deliveryIndex < deliveryCount;
            deliveryIndex += 1
          ) {
            const deliveryId = randomUUID();
            const deliveryNumber = deliveryIndex + 1;
            deliveryRows.push({
              id: deliveryId,
              workspaceId,
              projectId,
              businessId,
              name: `Entrega ${deliveryNumber} — Projeto ${projectNumber}`,
              description: "Entrega criada pelo seed de carga.",
              categoryKey: "producao",
              priorityKey: "normal",
              statusKey: "planejamento",
              dueDate: dateAfter(deliveryIndex + 7),
              engagementType: "fee",
              sortOrder: deliveryIndex,
              boardOrder: {},
              version: 1,
              createdAt: now,
              updatedAt: now,
            });
            const taskCount =
              3 + ((personNumber + projectIndex + deliveryIndex) % 8);
            for (let taskIndex = 0; taskIndex < taskCount; taskIndex += 1) {
              taskRows.push({
                id: randomUUID(),
                workspaceId,
                taskId: deliveryId,
                name: `Tarefa ${taskIndex + 1} da entrega ${deliveryNumber}`,
                durationMinutes: 60,
                statusKey: "pendente",
                sortOrder: taskIndex,
                createdAt: now,
                updatedAt: now,
              });
            }
          }
        }
      }
    }
  }

  try {
    await database.transaction(async (transaction) => {
      // Reexecutar o comando só apaga os quatro workspaces de fixture.
      await transaction
        .delete(workspaces)
        .where(inArray(workspaces.id, [...LOAD_SEED_WORKSPACE_IDS]));
      await transaction.insert(workspaces).values(
        LOAD_SEED_WORKSPACE_IDS.map((id, index) => ({
          id,
          name: WORKSPACE_NAMES[index]!,
          description: "Workspace exclusivo da massa de dados para teste.",
          icon: "briefcase-business",
          color: WORKSPACE_COLORS[index]!,
          kind: "shared" as const,
          ownerUserId,
          createdAt: now,
          updatedAt: now,
        })),
      );
      await transaction.insert(workspaceMembers).values(
        LOAD_SEED_WORKSPACE_IDS.map((workspaceId) => ({
          workspaceId,
          userId: ownerUserId,
          role: "owner" as const,
          joinedAt: now,
          updatedAt: now,
        })),
      );
      await transaction
        .update(authSessions)
        .set({ activeWorkspaceId: LOAD_SEED_WORKSPACE_IDS[0] })
        .where(
          and(
            eq(authSessions.userId, ownerUserId),
            isNull(authSessions.revokedAt),
          ),
        );
      await transaction.insert(contacts).values(contactRows);
      await transaction.insert(businesses).values(businessRows);
      await transaction.insert(businessResponsibles).values(responsibleRows);
      await transaction.insert(contracts).values(contractRows);
      await transaction.insert(projects).values(projectRows);
      for (let start = 0; start < deliveryRows.length; start += BATCH_SIZE) {
        await transaction
          .insert(tasks)
          .values(deliveryRows.slice(start, start + BATCH_SIZE));
      }
      for (let start = 0; start < taskRows.length; start += BATCH_SIZE) {
        await transaction
          .insert(taskSubtasks)
          .values(taskRows.slice(start, start + BATCH_SIZE));
      }
    });
    return {
      people: contactRows.length,
      contracts: contractRows.length,
      projects: projectRows.length,
      deliveries: deliveryRows.length,
      tasks: taskRows.length,
    };
  } finally {
    await pool.end();
  }
}

async function main(): Promise<void> {
  const totals = await seedLoadTestDatabase();
  console.log(
    `Seed de carga concluído: 4 workspaces, ${totals.people} pessoas, ${totals.contracts} contratos, ${totals.projects} projetos, ${totals.deliveries} entregas e ${totals.tasks} tarefas.`,
  );
  console.log(`Dados vinculados ao usuário @${LOAD_SEED_USERNAME}.`);
}

if (process.argv[1]?.includes("seed-load-test")) {
  main().catch((error: unknown) => {
    const message =
      error instanceof Error ? error.message : "Erro desconhecido";
    console.error(`[seed:load] ${message}`);
    process.exitCode = 1;
  });
}
