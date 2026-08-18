import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";

type SqlRow = Record<string, unknown>;

export type ProjectContractSeed = {
  id: string;
  workspaceId: string;
  name: string;
  ownerUserId: string;
  amountCents: number;
  firstDueDate: string;
  installmentCount: number;
  notes: string;
};

export type PersonalFinanceSeedProfile = {
  userId: string;
  username: string;
  workspaceId: string;
};

export type ProjectContractSeedTotals = {
  projects: number;
  installments: number;
  financialEntries: number;
  contractAmountCents: number;
};

export type ManualFinanceUserTotals = {
  entries: number;
  revenues: number;
  expenses: number;
};

export type ManualFinanceSeedTotals = ManualFinanceUserTotals & {
  byUser: Record<string, ManualFinanceUserTotals>;
};

const MANUAL_FINANCE_PLAN = {
  teste1: { revenues: 7, expenses: 5 },
  teste2: { revenues: 8, expenses: 7 },
  teste3: { revenues: 10, expenses: 8 },
} as const;

type ManualFinanceUsername = keyof typeof MANUAL_FINANCE_PLAN;

const revenueTemplates = [
  ["Consultoria estratégica", "Consultoria"],
  ["Licenciamento de identidade", "Licenciamento"],
  ["Workshop de planejamento", "Treinamentos"],
  ["Comissão comercial", "Comissões"],
  ["Mentoria executiva", "Mentorias"],
  ["Auditoria de comunicação", "Auditoria"],
  ["Venda de template", "Produtos digitais"],
  ["Produção adicional", "Serviços adicionais"],
  ["Reembolso de fornecedor", "Reembolsos"],
  ["Manutenção mensal", "Manutenção"],
] as const;

const expenseTemplates = [
  ["Assinatura de ferramentas", "Ferramentas"],
  ["Hospedagem e domínio", "Infraestrutura"],
  ["Campanha de anúncios", "Marketing"],
  ["Honorários contábeis", "Contabilidade"],
  ["Impostos e taxas", "Impostos"],
  ["Apoio de freelancer", "Terceirização"],
  ["Transporte para reunião", "Transporte"],
  ["Mensalidade de coworking", "Escritório"],
] as const;

function quoteIdentifier(identifier: string): string {
  if (!/^[a-z_][a-z0-9_]*$/u.test(identifier)) {
    throw new Error(`Identificador SQL invalido: ${identifier}`);
  }
  return `"${identifier}"`;
}

async function insertRows(
  client: PoolClient,
  table: "project_installments" | "financial_entries",
  rows: SqlRow[],
): Promise<void> {
  if (!rows.length) return;
  const columns = Object.keys(rows[0]!);
  for (let start = 0; start < rows.length; start += 400) {
    const batch = rows.slice(start, start + 400);
    const values: unknown[] = [];
    const tuples = batch.map((row) => {
      if (
        columns.length !== Object.keys(row).length ||
        columns.some((column) => !(column in row))
      ) {
        throw new Error(`Linhas inconsistentes para app.${table}.`);
      }
      const placeholders = columns.map((column) => {
        values.push(row[column]);
        return `$${values.length}`;
      });
      return `(${placeholders.join(", ")})`;
    });
    await client.query(
      `insert into app.${quoteIdentifier(table)} (${columns.map(quoteIdentifier).join(", ")}) values ${tuples.join(", ")}`,
      values,
    );
  }
}

function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return (
    !Number.isNaN(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === value
  );
}

function addDays(value: string, days: number): string {
  const date = new Date(`${value}T12:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function addMonths(value: string, months: number): string {
  const [year, month, day] = value.split("-").map(Number);
  const first = new Date(Date.UTC(year!, month! - 1 + months, 1));
  const lastDay = new Date(
    Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0),
  ).getUTCDate();
  first.setUTCDate(Math.min(day!, lastDay));
  return first.toISOString().slice(0, 10);
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function manualFinanceUsername(value: string): ManualFinanceUsername {
  const normalized = value.toLowerCase();
  if (!Object.hasOwn(MANUAL_FINANCE_PLAN, normalized)) {
    throw new Error(`Usuario sem plano financeiro no seed: ${value}.`);
  }
  return normalized as ManualFinanceUsername;
}

function creationDateForDueDate(dueDate: string): Date {
  const candidate = addDays(dueDate, -30);
  const createdDate = candidate < todayIso() ? candidate : todayIso();
  return new Date(`${createdDate}T12:00:00.000Z`);
}

function centsToDecimal(cents: number): string {
  if (!Number.isSafeInteger(cents) || cents <= 0) {
    throw new Error("O valor financeiro precisa ser positivo e seguro.");
  }
  return `${Math.trunc(cents / 100)}.${String(cents % 100).padStart(2, "0")}`;
}

function splitPositiveAmount(amountCents: number, count: number): number[] {
  if (!Number.isSafeInteger(amountCents) || amountCents <= 0) {
    throw new Error("O contrato precisa ter valor positivo e seguro.");
  }
  if (!Number.isInteger(count) || count < 1 || count > 99) {
    throw new Error("A quantidade de parcelas precisa estar entre 1 e 99.");
  }
  if (amountCents < count) {
    throw new Error("O contrato nao pode gerar parcelas de valor zero.");
  }
  const base = Math.trunc(amountCents / count);
  const remainder = amountCents % count;
  return Array.from(
    { length: count },
    (_, index) => base + (index < remainder ? 1 : 0),
  );
}

async function validateProjectContracts(
  client: PoolClient,
  projects: ProjectContractSeed[],
): Promise<void> {
  if (new Set(projects.map(({ id }) => id)).size !== projects.length) {
    throw new Error("Projetos duplicados no plano financeiro do seed.");
  }
  for (const project of projects) {
    if (!isIsoDate(project.firstDueDate)) {
      throw new Error(`Primeiro vencimento invalido no projeto ${project.id}.`);
    }
    splitPositiveAmount(project.amountCents, project.installmentCount);
  }
  if (!projects.length) return;

  const result = await client.query<{
    id: string;
    workspace_id: string;
    name: string;
    owner_user_id: string;
    amount_cents: string;
    first_due_date: string | null;
    contract_type: string;
  }>(
    `select project.id,
            project.workspace_id,
            project.name,
            workspace.owner_user_id,
            project.amount_cents::text,
            project.first_due_date::text,
            project.contract_type
       from app.projects project
       inner join app.workspaces workspace on workspace.id = project.workspace_id
      where project.id = any($1::uuid[])`,
    [projects.map(({ id }) => id)],
  );
  const storedById = new Map(result.rows.map((row) => [row.id, row]));
  for (const project of projects) {
    const stored = storedById.get(project.id);
    if (
      !stored ||
      stored.workspace_id !== project.workspaceId ||
      stored.name !== project.name ||
      stored.owner_user_id !== project.ownerUserId ||
      Number(stored.amount_cents) !== project.amountCents ||
      stored.first_due_date !== project.firstDueDate ||
      stored.contract_type !== "one_off"
    ) {
      throw new Error(
        `O contrato estrutural do projeto ${project.id} diverge do banco.`,
      );
    }
  }
}

export async function materializeProjectContracts(
  client: PoolClient,
  projects: ProjectContractSeed[],
): Promise<ProjectContractSeedTotals> {
  await validateProjectContracts(client, projects);
  const contractAmountCents = projects.reduce(
    (total, project) => total + project.amountCents,
    0,
  );
  if (!Number.isSafeInteger(contractAmountCents)) {
    throw new Error("O total dos contratos excede o limite monetário seguro.");
  }
  const installmentRows: SqlRow[] = [];
  const financialRows: SqlRow[] = [];
  const today = todayIso();

  for (const [projectIndex, project] of projects.entries()) {
    const amounts = splitPositiveAmount(
      project.amountCents,
      project.installmentCount,
    );
    for (const [installmentIndex, amountCents] of amounts.entries()) {
      const installmentId = randomUUID();
      const number = installmentIndex + 1;
      const dueDate = addMonths(project.firstDueDate, installmentIndex);
      const isSettled =
        dueDate < today && (projectIndex + installmentIndex) % 3 === 0;
      const settledAt = isSettled ? new Date(`${dueDate}T15:00:00.000Z`) : null;
      const createdAt = creationDateForDueDate(dueDate);
      installmentRows.push({
        id: installmentId,
        workspace_id: project.workspaceId,
        project_id: project.id,
        number,
        due_date: dueDate,
        amount_cents: amountCents,
        status_key: isSettled ? "settled" : "pending",
      });
      financialRows.push({
        id: randomUUID(),
        workspace_id: project.workspaceId,
        project_id: project.id,
        project_installment_id: installmentId,
        source: "project",
        type: "revenue",
        mode: "one_off",
        title: project.name,
        category: "Contratos",
        notes: project.notes,
        amount: centsToDecimal(amountCents),
        competence_date: dueDate,
        due_date: dueDate,
        status: isSettled ? "settled" : "open",
        settled_at: settledAt,
        settled_by_user_id: isSettled ? project.ownerUserId : null,
        series_id: project.id,
        series_kind: "installment",
        series_number: number,
        series_count: project.installmentCount,
        version: 1,
        created_by_user_id: project.ownerUserId,
        updated_by_user_id: project.ownerUserId,
        created_at: createdAt,
        updated_at: settledAt ?? new Date(),
      });
    }
  }

  await insertRows(client, "project_installments", installmentRows);
  await insertRows(client, "financial_entries", financialRows);
  return {
    projects: projects.length,
    installments: installmentRows.length,
    financialEntries: financialRows.length,
    contractAmountCents,
  };
}

async function validatePersonalFinanceProfiles(
  client: PoolClient,
  profiles: PersonalFinanceSeedProfile[],
): Promise<void> {
  if (
    profiles.length !== 3 ||
    new Set(profiles.map(({ userId }) => userId)).size !== profiles.length ||
    new Set(profiles.map(({ username }) => username)).size !== profiles.length
  ) {
    throw new Error(
      "Informe um perfil pessoal unico para cada usuario do seed.",
    );
  }
  const expectedUsers = Object.keys(MANUAL_FINANCE_PLAN).sort().join(",");
  if (
    profiles
      .map(({ username }) => username.toLowerCase())
      .sort()
      .join(",") !== expectedUsers
  ) {
    throw new Error(
      "Os perfis financeiros devem pertencer a teste1, teste2 e teste3.",
    );
  }

  const result = await client.query<{
    user_id: string;
    username: string;
    workspace_id: string;
  }>(
    `select app_user.id user_id,
            app_user.username,
            workspace.id workspace_id
       from app.users app_user
       inner join app.workspaces workspace
         on workspace.owner_user_id = app_user.id
        and workspace.kind = 'personal'
      where app_user.id = any($1::uuid[])`,
    [profiles.map(({ userId }) => userId)],
  );
  const storedByUserId = new Map(result.rows.map((row) => [row.user_id, row]));
  for (const profile of profiles) {
    const stored = storedByUserId.get(profile.userId);
    if (
      !stored ||
      stored.username.toLowerCase() !== profile.username.toLowerCase() ||
      stored.workspace_id !== profile.workspaceId
    ) {
      throw new Error(
        `O workspace financeiro de ${profile.username} nao e pessoal.`,
      );
    }
  }
}

function manualFinancialRow(input: {
  profile: PersonalFinanceSeedProfile;
  type: "revenue" | "expense";
  template: readonly [string, string];
  amountCents: number;
  dueDate: string;
  index: number;
}): SqlRow {
  const { profile, type, template, amountCents, dueDate, index } = input;
  const today = todayIso();
  const isSettled = dueDate < today && index % 2 === 0;
  const isPaused = !isSettled && index % 5 === 4;
  const settledAt = isSettled ? new Date(`${dueDate}T16:00:00.000Z`) : null;
  const createdAt = creationDateForDueDate(dueDate);
  return {
    id: randomUUID(),
    workspace_id: profile.workspaceId,
    project_id: null,
    project_installment_id: null,
    source: "manual",
    type,
    mode: "one_off",
    title: `${template[0]} - ${profile.username}`,
    category: template[1],
    notes:
      type === "revenue"
        ? `Receita avulsa cadastrada por ${profile.username}.`
        : `Despesa operacional cadastrada por ${profile.username}.`,
    amount: centsToDecimal(amountCents),
    competence_date: addDays(dueDate, -5),
    due_date: dueDate,
    status: isSettled ? "settled" : isPaused ? "paused" : "open",
    settled_at: settledAt,
    settled_by_user_id: isSettled ? profile.userId : null,
    series_id: null,
    series_kind: null,
    series_number: null,
    series_count: null,
    version: 1,
    created_by_user_id: profile.userId,
    updated_by_user_id: profile.userId,
    created_at: createdAt,
    updated_at: settledAt ?? new Date(),
  };
}

export async function seedManualUserFinances(
  client: PoolClient,
  profiles: PersonalFinanceSeedProfile[],
): Promise<ManualFinanceSeedTotals> {
  await validatePersonalFinanceProfiles(client, profiles);
  const rows: SqlRow[] = [];
  const byUser: Record<string, ManualFinanceUserTotals> = {};
  const today = todayIso();

  for (const profile of profiles) {
    const username = manualFinanceUsername(profile.username);
    const stableUserIndex = Number(username.at(-1)) - 1;
    const plan = MANUAL_FINANCE_PLAN[username];
    for (let index = 0; index < plan.revenues; index += 1) {
      rows.push(
        manualFinancialRow({
          profile,
          type: "revenue",
          template: revenueTemplates[index]!,
          amountCents: 85_000 + stableUserIndex * 23_700 + index * 31_250,
          dueDate: addDays(today, -48 + index * 13 + stableUserIndex * 3),
          index,
        }),
      );
    }
    for (let index = 0; index < plan.expenses; index += 1) {
      rows.push(
        manualFinancialRow({
          profile,
          type: "expense",
          template: expenseTemplates[index]!,
          amountCents: 12_900 + stableUserIndex * 7_300 + index * 9_850,
          dueDate: addDays(today, -36 + index * 15 + stableUserIndex * 4),
          index,
        }),
      );
    }
    byUser[username] = {
      entries: plan.revenues + plan.expenses,
      revenues: plan.revenues,
      expenses: plan.expenses,
    };
  }

  await insertRows(client, "financial_entries", rows);
  return {
    entries: rows.length,
    revenues: profiles.reduce(
      (total, profile) =>
        total +
        MANUAL_FINANCE_PLAN[manualFinanceUsername(profile.username)].revenues,
      0,
    ),
    expenses: profiles.reduce(
      (total, profile) =>
        total +
        MANUAL_FINANCE_PLAN[manualFinanceUsername(profile.username)].expenses,
      0,
    ),
    byUser,
  };
}
