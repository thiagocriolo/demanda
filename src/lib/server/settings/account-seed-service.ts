import { createHash, randomUUID } from "node:crypto";
import { and, eq, inArray, isNull } from "drizzle-orm";
import {
  DELIVERY_COMPLETED_STATUS,
  TASK_COMPLETED_STATUS,
  TASK_PENDING_STATUS,
} from "../deliveries/types";
import type { Database } from "../db/database";
import {
  businesses,
  businessNotes,
  businessResponsibles,
  contactEmails,
  contactNotes,
  contactPhones,
  contacts,
  contractInstallments,
  contracts,
  deliveries,
  deliveryResponsibles,
  deliveryTasks,
  projectDeliveryRoutines,
  projectResponsibles,
  projects,
  users,
  workspaceMembers,
  workspaces,
} from "../db/schema";
import { institutionalOccurrenceDate } from "../projects/project-routines";
import fixtureData from "./account-seed-fixture.json";

const fixture = {
  ...fixtureData,
  people: fixtureData.people.map((person) => ({
    ...person,
    status: parseContactStatus(person.status),
  })),
  contracts: fixtureData.contracts.map((contract) => ({
    ...contract,
    contractType: parseContractType(contract.contractType),
  })),
};

function parseContactStatus(
  status: string,
): typeof contacts.$inferSelect.status {
  if (
    status === "lead" ||
    status === "prospect" ||
    status === "active" ||
    status === "inactive"
  ) {
    return status;
  }
  throw new Error(`Status de pessoa inválido no Seed: ${status}.`);
}

function parseContractType(
  type: string,
): typeof contracts.$inferSelect.contractType {
  if (type === "one_off" || type === "recurring") return type;
  throw new Error(`Frequência de contrato inválida no Seed: ${type}.`);
}

export class AccountSeedUnavailableError extends Error {}

function seedId(userId: string, kind: string, name: string): string {
  const digest = createHash("sha256")
    .update(JSON.stringify(["demanda-account-seed", userId, kind, name]))
    .digest("hex");
  return `${digest.slice(0, 8)}-${digest.slice(8, 12)}-8${digest.slice(13, 16)}-8${digest.slice(17, 20)}-${digest.slice(20, 32)}`;
}

function required<K, V>(records: ReadonlyMap<K, V>, key: K): V {
  const record = records.get(key);
  if (record === undefined)
    throw new Error(`Vínculo inválido no Seed: ${key}.`);
  return record;
}

function projectKey(contract: string, project: string): string {
  return JSON.stringify([contract, project]);
}

const totals = {
  workspaces: fixture.workspaces.length,
  people: fixture.people.length,
  businesses: fixture.businesses.length,
  contracts: fixture.contracts.length,
  projects: fixture.projects.length,
  deliveries: fixture.deliveries.length,
  tasks: fixture.deliveries.reduce(
    (count, delivery) => count + delivery.tasks.length,
    0,
  ),
};

export async function seedAccountData(
  database: Database,
  ownerUserId: string,
): Promise<{ created: false } | { created: true; totals: typeof totals }> {
  return database.transaction(async (transaction) => {
    // Serialize Seed requests for the same account, including across servers.
    const [owner] = await transaction
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.id, ownerUserId), isNull(users.deletedAt)))
      .for("update");
    if (!owner) throw new AccountSeedUnavailableError("Conta indisponível.");

    const workspaceRows = fixture.workspaces.map((name) => ({
      id: seedId(ownerUserId, "workspace", name),
      name,
      ownerUserId,
      kind: "shared" as const,
    }));
    const [existingWorkspace] = await transaction
      .select({ id: workspaces.id })
      .from(workspaces)
      .where(
        inArray(
          workspaces.id,
          workspaceRows.map(({ id }) => id),
        ),
      )
      .limit(1);
    if (existingWorkspace) return { created: false };

    const [personal] = await transaction
      .select({ id: workspaces.id })
      .from(workspaces)
      .where(
        and(
          eq(workspaces.ownerUserId, ownerUserId),
          eq(workspaces.kind, "personal"),
        ),
      )
      .limit(1);
    if (!personal) {
      throw new AccountSeedUnavailableError(
        "O workspace Pessoal da conta não foi encontrado.",
      );
    }
    const workspaceByName = new Map(
      workspaceRows.map(({ name, id }) => [name, id]),
    );
    workspaceByName.set("Pessoal", personal.id);

    const personIds = new Map(
      fixture.people.map(({ name }) => [
        name,
        seedId(ownerUserId, "person", name),
      ]),
    );
    const businessIds = new Map(
      fixture.businesses.map(({ name }) => [
        name,
        seedId(ownerUserId, "business", name),
      ]),
    );
    const [existingPerson] = await transaction
      .select({ id: contacts.id })
      .from(contacts)
      .where(inArray(contacts.id, [...personIds.values()]))
      .limit(1);
    const [existingBusiness] = await transaction
      .select({ id: businesses.id })
      .from(businesses)
      .where(inArray(businesses.id, [...businessIds.values()]))
      .limit(1);
    if (existingPerson || existingBusiness) return { created: false };

    await transaction.insert(workspaces).values(workspaceRows);
    await transaction
      .insert(workspaceMembers)
      .values(
        workspaceRows.map(({ id }) => ({
          workspaceId: id,
          userId: ownerUserId,
          role: "owner" as const,
        })),
      );

    await transaction.insert(contacts).values(
      fixture.people.map(({ name, status }) => ({
        id: required(personIds, name),
        workspaceId: personal.id,
        ownerUserId,
        name,
        status,
      })),
    );
    await transaction.insert(contactPhones).values(
      fixture.people.map(({ name, phone }) => ({
        workspaceId: personal.id,
        contactId: required(personIds, name),
        number: phone,
        isPrimary: true,
      })),
    );
    await transaction.insert(contactEmails).values(
      fixture.people.map(({ name, email }) => ({
        workspaceId: personal.id,
        contactId: required(personIds, name),
        address: email,
        isPrimary: true,
      })),
    );
    await transaction.insert(contactNotes).values(
      fixture.people.map(({ name, bio }) => ({
        workspaceId: personal.id,
        contactId: required(personIds, name),
        body: bio,
      })),
    );

    await transaction.insert(businesses).values(
      fixture.businesses.map(({ name, stage, category }) => ({
        id: required(businessIds, name),
        workspaceId: personal.id,
        ownerUserId,
        name,
        stageKey: stage,
        categoryKey: category,
      })),
    );
    await transaction.insert(businessResponsibles).values(
      fixture.businesses.flatMap(({ name, partners }) =>
        partners.map((partner, sortOrder) => ({
          workspaceId: personal.id,
          businessId: required(businessIds, name),
          contactId: required(personIds, partner),
          sortOrder,
        })),
      ),
    );
    await transaction.insert(businessNotes).values(
      fixture.businesses.map(({ name, summary }) => ({
        workspaceId: personal.id,
        businessId: required(businessIds, name),
        body: summary,
      })),
    );

    const contractRows = fixture.contracts.map(
      ({
        name,
        business,
        workspace,
        contractType,
        totalCents,
        installments,
        ...details
      }) => {
        const first = installments[0];
        if (
          !first ||
          installments.reduce((sum, item) => sum + item.amountCents, 0) !==
            totalCents
        ) {
          throw new Error(`Parcelas inválidas no Seed: ${name}.`);
        }
        if (
          contractType === "recurring" &&
          installments.some((item) => item.amountCents !== first.amountCents)
        ) {
          throw new Error(`Mensalidades divergentes no Seed: ${name}.`);
        }
        return {
          id: randomUUID(),
          workspaceId: required(workspaceByName, workspace),
          ownerUserId,
          businessId: required(businessIds, business),
          name,
          contractType,
          // For recurring contracts, the amount field represents the monthly fee.
          amountCents:
            contractType === "recurring" ? first.amountCents : totalCents,
          firstDueDate: first.dueDate,
          ...details,
        };
      },
    );
    const contractByName = new Map(
      contractRows.map((contract) => [contract.name, contract]),
    );
    await transaction.insert(contracts).values(contractRows);
    await transaction.insert(contractInstallments).values(
      fixture.contracts.flatMap(({ name, installments }) => {
        const contract = required(contractByName, name);
        return installments.map((installment, index) => ({
          ...installment,
          workspaceId: contract.workspaceId,
          contractId: contract.id,
          number: index + 1,
          statusKey: "pending",
        }));
      }),
    );

    const projectRows = fixture.projects.map((project) => {
      const contract = required(contractByName, project.contract);
      if (project.contractType !== contract.contractType) {
        throw new Error(
          `Frequência do projeto diverge do contrato no Seed: ${project.name}.`,
        );
      }
      return {
        id: randomUUID(),
        workspaceId: contract.workspaceId,
        businessId: contract.businessId,
        contractId: contract.id,
        contractType: contract.contractType,
        name: project.name,
        briefing: project.briefing,
        statusKey: project.status,
      };
    });
    const projectByKey = new Map(
      projectRows.map((project) => [
        projectKey(project.contractId, project.name),
        project,
      ]),
    );
    await transaction.insert(projects).values(projectRows);
    await transaction.insert(projectResponsibles).values(
      projectRows.map(({ workspaceId, id }) => ({
        workspaceId,
        projectId: id,
        userId: ownerUserId,
      })),
    );

    const now = new Date();
    const recurrenceType = "daily";
    const today = now.toISOString().slice(0, 10);
    const occurrenceDate = institutionalOccurrenceDate(recurrenceType, today);
    const entries = fixture.deliveries.map((delivery, sortOrder) => {
      const contract = required(contractByName, delivery.contract);
      const project = required(
        projectByKey,
        projectKey(contract.id, delivery.project),
      );
      const completedAt =
        delivery.status === DELIVERY_COMPLETED_STATUS ? now : null;
      const content = {
        workspaceId: project.workspaceId,
        projectId: project.id,
        name: delivery.name,
        description: delivery.briefing,
        categoryKey: delivery.category,
        priorityKey: delivery.priority,
      };
      const routine =
        project.contractType === "recurring"
          ? {
              ...content,
              id: randomUUID(),
              responsibleUserId: ownerUserId,
              statusKey: "planejamento",
              recurrenceType,
              recurrenceDays: "[]",
              tagIds: "[]",
              tasks: JSON.stringify(
                delivery.tasks.map((name) => ({
                  name,
                  durationMinutes: 60,
                  status: TASK_PENDING_STATUS,
                })),
              ),
            }
          : null;
      return {
        routine,
        delivery: {
          ...content,
          id: randomUUID(),
          businessId: project.businessId,
          projectRoutineId: routine?.id ?? null,
          routineOccurrenceDate: routine ? occurrenceDate : null,
          sortOrder,
          boardOrder: {},
          statusKey: delivery.status,
          completedAt,
          createdAt: now,
          updatedAt: now,
        },
        tasks: delivery.tasks,
      };
    });
    const routines = entries.flatMap(({ routine }) =>
      routine ? [routine] : [],
    );
    if (routines.length)
      await transaction.insert(projectDeliveryRoutines).values(routines);
    await transaction
      .insert(deliveries)
      .values(entries.map(({ delivery }) => delivery));
    await transaction.insert(deliveryResponsibles).values(
      entries.map(({ delivery }) => ({
        workspaceId: delivery.workspaceId,
        deliveryId: delivery.id,
        userId: ownerUserId,
      })),
    );
    await transaction.insert(deliveryTasks).values(
      entries.flatMap(({ delivery, tasks }) =>
        tasks.map((name, sortOrder) => ({
          workspaceId: delivery.workspaceId,
          deliveryId: delivery.id,
          name,
          sortOrder,
          statusKey: delivery.completedAt
            ? TASK_COMPLETED_STATUS
            : TASK_PENDING_STATUS,
          completedAt: delivery.completedAt,
          createdAt: now,
          updatedAt: now,
        })),
      ),
    );

    return { created: true, totals };
  });
}
