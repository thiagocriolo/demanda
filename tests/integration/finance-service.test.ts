import "dotenv/config";
import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import type { RequestAuthorizationContext } from "../../src/lib/server/authorization/workspace-context";
import { WorkspaceNotFoundError } from "../../src/lib/server/authorization/workspace-context";
import { parseServerEnvironment } from "../../src/lib/server/config/env-schema";
import {
  createDatabase,
  type Database,
} from "../../src/lib/server/db/database";
import { createDatabasePool } from "../../src/lib/server/db/pool";
import {
  auditLogs,
  businesses,
  financialEntries,
  projectInstallments,
  projects,
  users,
  workspaceMembers,
  workspaces,
  type WorkspaceRole,
} from "../../src/lib/server/db/schema";
import {
  FinancialVersionConflictError,
  changeFinancialEntryState,
  createFinancialEntry,
  deleteFinancialEntry,
  getFinancialSnapshot,
} from "../../src/lib/server/finance/service";

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
  if (!user) throw new Error("Usuário financeiro não criado.");
  return user;
}

function context(
  user: typeof users.$inferSelect,
  workspace: typeof workspaces.$inferSelect,
  role: WorkspaceRole,
): RequestAuthorizationContext {
  const now = new Date();
  return {
    user: {
      id: user.id,
      username: user.username,
      name: user.name,
      email: user.email,
      avatarUrl: user.avatarUrl,
    },
    session: {
      id: randomUUID(),
      userId: user.id,
      activeWorkspaceId: workspace.id,
      remembered: false,
      createdAt: now,
      lastSeenAt: now,
      expiresAt: new Date(now.getTime() + 60_000),
    },
    activeWorkspace: {
      workspace: {
        id: workspace.id,
        name: workspace.name,
        description: workspace.description,
        icon: workspace.icon,
        color: workspace.color,
        kind: workspace.kind,
        ownerUserId: workspace.ownerUserId,
      },
      membership: { userId: user.id, role, joinedAt: now },
    },
  };
}

async function fixture(database: Database, label = "BE12") {
  const owner = await insertUser(database, `${label}Owner`);
  const outsider = await insertUser(database, `${label}Outsider`);
  const [workspace] = await database
    .insert(workspaces)
    .values({
      name: `${label} workspace`,
      kind: "shared",
      ownerUserId: owner.id,
    })
    .returning();
  if (!workspace) throw new Error("Workspace financeiro não criado.");
  const [privateWorkspace] = await database
    .insert(workspaces)
    .values({
      name: `${label} registros privados`,
      kind: "personal",
      ownerUserId: owner.id,
    })
    .returning();
  if (!privateWorkspace) {
    throw new Error("Workspace privado financeiro nao criado.");
  }
  const [business] = await database
    .insert(businesses)
    .values({
      workspaceId: privateWorkspace.id,
      ownerUserId: owner.id,
      name: `${label} negócio`,
      categoryKey: "cliente",
      stageKey: "ativo",
    })
    .returning();
  if (!business) throw new Error("Negócio financeiro não criado.");
  const [project] = await database
    .insert(projects)
    .values({
      workspaceId: workspace.id,
      businessId: business.id,
      name: `${label} projeto`,
      statusKey: "execucao",
      amountCents: 10_001,
      contractType: "one_off",
      firstDueDate: "2026-07-31",
      financeNotes: "Gerado pelo projeto",
    })
    .returning();
  if (!project) throw new Error("Projeto financeiro não criado.");
  const installments = await database
    .insert(projectInstallments)
    .values([
      {
        workspaceId: workspace.id,
        projectId: project.id,
        number: 1,
        dueDate: "2026-07-31",
        amountCents: 5_000,
        statusKey: "pending",
      },
      {
        workspaceId: workspace.id,
        projectId: project.id,
        number: 2,
        dueDate: "2026-08-31",
        amountCents: 5_001,
        statusKey: "pending",
      },
    ])
    .returning();
  return {
    owner,
    outsider,
    workspace,
    privateWorkspace,
    business,
    project,
    installments,
    ownerContext: context(owner, workspace, "owner"),
    outsiderContext: context(outsider, workspace, "member"),
  };
}

const manual = (overrides: Record<string, unknown> = {}) => ({
  title: "Receita manual",
  type: "revenue" as const,
  mode: "one_off" as const,
  amountCents: 10,
  competenceDate: "2026-06-30",
  dueDate: "2026-07-10",
  category: "Outros",
  notes: "",
  ...overrides,
});

describe("leitura do Financeiro por workspace", () => {
  it("permite workspace vinculado e revalida o acesso", () =>
    withRollback(async (transaction) => {
      const active = await fixture(transaction, "ScopeA");
      const requested = await fixture(transaction, "ScopeB");
      await transaction.insert(workspaceMembers).values({
        workspaceId: requested.workspace.id,
        userId: active.owner.id,
        role: "member",
      });

      const snapshot = await getFinancialSnapshot(
        transaction,
        active.ownerContext,
        { workspaceId: requested.workspace.id },
      );
      expect(snapshot.workspaceId).toBe(requested.workspace.id);
      expect(snapshot.entries).toHaveLength(2);
      expect(
        snapshot.entries.every(
          ({ businessName }) => businessName === requested.business.name,
        ),
      ).toBe(true);
      await expect(
        getFinancialSnapshot(transaction, requested.ownerContext, {
          workspaceId: active.workspace.id,
        }),
      ).rejects.toBeInstanceOf(WorkspaceNotFoundError);
    }));
});

describe("BE-12: Financeiro persistente", () => {
  it("materializa parcelas de projeto uma única vez e soma centavos exatamente", () =>
    withRollback(async (transaction) => {
      const data = await fixture(transaction, "Projection");
      const first = await getFinancialSnapshot(transaction, data.ownerContext);
      expect(first.entries).toHaveLength(2);
      expect(first.entries).toMatchObject([
        {
          source: "project",
          projectId: data.project.id,
          businessName: data.business.name,
          amountCents: 5_000,
          seriesNumber: 1,
          seriesCount: 2,
        },
        {
          source: "project",
          projectId: data.project.id,
          businessName: data.business.name,
          amountCents: 5_001,
          seriesNumber: 2,
          seriesCount: 2,
        },
      ]);
      expect(first.totals.revenueCents).toBe(10_001);

      const second = await getFinancialSnapshot(transaction, data.ownerContext);
      expect(
        second.entries.map(({ id, version }) => ({ id, version })),
      ).toEqual(first.entries.map(({ id, version }) => ({ id, version })));
    }));

  it("calcula totais sem ponto flutuante e consulta por competência", () =>
    withRollback(async (transaction) => {
      const data = await fixture(transaction, "Precision");
      await createFinancialEntry(transaction, data.ownerContext, manual());
      await createFinancialEntry(
        transaction,
        data.ownerContext,
        manual({
          title: "Despesa manual",
          type: "expense",
          amountCents: 20,
        }),
      );
      const competence = await getFinancialSnapshot(
        transaction,
        data.ownerContext,
        {
          from: "2026-06-01",
          to: "2026-06-30",
          basis: "competence",
        },
      );
      expect(competence.entries).toHaveLength(2);
      expect(competence.totals).toMatchObject({
        revenueCents: 10,
        expenseCents: 20,
        expectedBalanceCents: -10,
      });
      const stored = await transaction
        .select({ amount: financialEntries.amount })
        .from(financialEntries)
        .where(
          and(
            eq(financialEntries.workspaceId, data.workspace.id),
            eq(financialEntries.source, "manual"),
          ),
        );
      expect(stored.map(({ amount }) => amount)).toEqual(["0.10", "0.20"]);
    }));

  it("gera recorrências mensais, liquida, pausa e registra auditoria", () =>
    withRollback(async (transaction) => {
      const data = await fixture(transaction, "Workflow");
      const recurring = await createFinancialEntry(
        transaction,
        data.ownerContext,
        manual({
          title: "Ferramenta",
          type: "expense",
          mode: "recurring",
          amountCents: 1_999,
          competenceDate: "2026-01-31",
          dueDate: "2026-01-31",
          recurrenceCount: 3,
        }),
      );
      const series = recurring.entries.filter(
        ({ title }) => title === "Ferramenta",
      );
      expect(series.map(({ dueDate }) => dueDate)).toEqual([
        "2026-01-31",
        "2026-02-28",
        "2026-03-31",
      ]);
      const first = series[0]!;
      const paused = await changeFinancialEntryState(
        transaction,
        data.ownerContext,
        first.id,
        { version: first.version, action: "pause" },
      );
      const pausedEntry = paused.entries.find(({ id }) => id === first.id)!;
      expect(pausedEntry.status).toBe("paused");
      const resumed = await changeFinancialEntryState(
        transaction,
        data.ownerContext,
        first.id,
        { version: pausedEntry.version, action: "resume" },
      );
      const resumedEntry = resumed.entries.find(({ id }) => id === first.id)!;
      const settled = await changeFinancialEntryState(
        transaction,
        data.ownerContext,
        first.id,
        { version: resumedEntry.version, action: "settle" },
      );
      expect(settled.entries.find(({ id }) => id === first.id)?.status).toBe(
        "settled",
      );
      const logs = await transaction
        .select({ action: auditLogs.action })
        .from(auditLogs)
        .where(eq(auditLogs.workspaceId, data.workspace.id));
      expect(logs.map(({ action }) => action)).toEqual(
        expect.arrayContaining([
          "finance.create",
          "finance.pause",
          "finance.resume",
          "finance.settle",
        ]),
      );
    }));

  it("faz exclusão lógica versionada e rejeita acesso sem vínculo", () =>
    withRollback(async (transaction) => {
      const data = await fixture(transaction, "Authorization");
      const created = await createFinancialEntry(
        transaction,
        data.ownerContext,
        manual(),
      );
      const entry = created.entries.find(({ source }) => source === "manual")!;
      await expect(
        deleteFinancialEntry(transaction, data.ownerContext, entry.id, {
          version: entry.version + 1,
        }),
      ).rejects.toBeInstanceOf(FinancialVersionConflictError);
      const afterDelete = await deleteFinancialEntry(
        transaction,
        data.ownerContext,
        entry.id,
        { version: entry.version },
      );
      expect(afterDelete.entries.some(({ id }) => id === entry.id)).toBe(false);
      const [stored] = await transaction
        .select({ deletedAt: financialEntries.deletedAt })
        .from(financialEntries)
        .where(eq(financialEntries.id, entry.id));
      expect(stored?.deletedAt).toBeInstanceOf(Date);
      await expect(
        getFinancialSnapshot(transaction, data.outsiderContext),
      ).rejects.toBeInstanceOf(WorkspaceNotFoundError);
    }));

  it("propaga a liquidação automática para a parcela do projeto", () =>
    withRollback(async (transaction) => {
      const data = await fixture(transaction, "ProjectState");
      const snapshot = await getFinancialSnapshot(
        transaction,
        data.ownerContext,
      );
      const entry = snapshot.entries.find(
        ({ seriesNumber }) => seriesNumber === 1,
      )!;
      await changeFinancialEntryState(
        transaction,
        data.ownerContext,
        entry.id,
        { version: entry.version, action: "settle" },
      );
      const [installment] = await transaction
        .select({ status: projectInstallments.statusKey })
        .from(projectInstallments)
        .where(
          and(
            eq(projectInstallments.projectId, data.project.id),
            eq(projectInstallments.number, 1),
          ),
        );
      expect(installment?.status).toBe("settled");
    }));
});

afterAll(async () => {
  await pool.end();
});
