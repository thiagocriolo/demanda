import { error, json } from "@sveltejs/kit";
import { randomUUID } from "node:crypto";
import {
  and,
  asc,
  count,
  desc,
  eq,
  inArray,
  isNotNull,
  isNull,
  or,
  sql,
} from "drizzle-orm";
import { z } from "zod";
import type { RequestHandler } from "./$types";
import {
  requireAuthenticatedRequest,
  throwAuthorizationHttpError,
} from "$lib/server/authorization/http";
import { readRequestInput } from "$lib/server/authorization/request-input";
import { requireWorkspacePermissionForUpdate } from "$lib/server/authorization/workspace-context";
import { getDatabase } from "$lib/server/db";
import { escapeLikeMySql } from "$lib/server/db/helpers";
import {
  businesses,
  contractInstallments,
  contracts,
  projects,
} from "$lib/server/db/schema";

const querySchema = z
  .object({
    page: z.coerce.number().int().min(1).max(100_000).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(25),
    query: z.string().trim().max(100).default(""),
    workspaceId: z.string().uuid().optional(),
    orderBy: z.enum(["updated", "name_asc", "name_desc"]).default("updated"),
    archived: z.enum(["exclude", "include", "only"]).default("exclude"),
  })
  .strict();
const installmentSchema = z
  .object({
    number: z.number().int().min(1).max(99),
    dueDate: z.string().date(),
    amountCents: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
    status: z.string().trim().max(64),
  })
  .strict();
export const _contractMutationSchema = z
  .object({
    workspaceId: z.string().uuid().optional(),
    name: z.string().trim().min(1).max(140),
    businessId: z.string().uuid(),
    contractType: z.enum(["one_off", "recurring"]),
    amountCents: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
    startDate: z.string().date().nullable(),
    endDate: z.string().date().nullable(),
    firstDueDate: z.string().date().nullable(),
    paymentMethod: z.string().trim().max(120),
    paymentTerms: z.string().trim().max(2_000),
    financeNotes: z.string().trim().max(4_000),
    installments: z.array(installmentSchema).max(99),
  })
  .strict();

export function _validInstallments(
  input: z.infer<typeof _contractMutationSchema>,
): boolean {
  if (input.contractType === "recurring")
    return input.installments.length === 0 && input.startDate !== null;
  if (input.amountCents > 0 && !input.installments.length) return false;
  if (
    input.installments.length &&
    input.firstDueDate !== input.installments[0]?.dueDate
  )
    return false;
  return (
    input.installments.every(
      (item, index) =>
        item.number === index + 1 &&
        (!index || input.installments[index - 1]!.dueDate <= item.dueDate),
    ) &&
    input.installments.reduce((sum, item) => sum + item.amountCents, 0) ===
      input.amountCents
  );
}

function hasValidContractDates(
  input: z.infer<typeof _contractMutationSchema>,
): boolean {
  return !input.startDate || !input.endDate || input.startDate <= input.endDate;
}

export function _contractPayload(
  contract: typeof contracts.$inferSelect,
  businessName: string,
  installments: (typeof contractInstallments.$inferSelect)[] = [],
  projectCount = 0,
) {
  return {
    id: contract.id,
    workspaceId: contract.workspaceId,
    ownerUserId: contract.ownerUserId,
    name: contract.name,
    business: { id: contract.businessId, name: businessName },
    contractType: contract.contractType,
    amountCents: contract.amountCents,
    startDate: contract.startDate,
    endDate: contract.endDate,
    firstDueDate: contract.firstDueDate,
    paymentMethod: contract.paymentMethod ?? "",
    paymentTerms: contract.paymentTerms ?? "",
    financeNotes: contract.financeNotes ?? "",
    projectCount,
    installments: installments.map((item) => ({
      id: item.id,
      number: item.number,
      dueDate: item.dueDate,
      amountCents: item.amountCents,
      status: item.statusKey ?? "pending",
    })),
    archivedAt: contract.archivedAt?.toISOString() ?? null,
    createdAt: contract.createdAt.toISOString(),
    updatedAt: contract.updatedAt.toISOString(),
  };
}

export const GET: RequestHandler = async ({ locals, url }) => {
  const context = requireAuthenticatedRequest(locals);
  const parsed = querySchema.safeParse(Object.fromEntries(url.searchParams));
  if (!parsed.success) error(400, "Filtros de contratos inválidos.");
  try {
    const database = getDatabase();
    const query = parsed.data;
    const pattern = query.query ? `%${escapeLikeMySql(query.query)}%` : null;
    const conditions = [eq(contracts.ownerUserId, context.user.id)];
    if (query.workspaceId)
      conditions.push(eq(contracts.workspaceId, query.workspaceId));
    if (query.archived === "exclude")
      conditions.push(isNull(contracts.archivedAt));
    if (query.archived === "only")
      conditions.push(isNotNull(contracts.archivedAt));
    if (pattern)
      conditions.push(
        or(
          sql`${contracts.name} like ${pattern} escape '!'`,
          sql`${businesses.name} like ${pattern} escape '!'`,
        )!,
      );
    const ordering =
      query.orderBy === "name_asc"
        ? [asc(sql`lower(${contracts.name})`), asc(contracts.id)]
        : query.orderBy === "name_desc"
          ? [desc(sql`lower(${contracts.name})`), desc(contracts.id)]
          : [desc(contracts.updatedAt), desc(contracts.id)];
    const [rows, totalRows, facets] = await Promise.all([
      database
        .select({ contract: contracts, businessName: businesses.name })
        .from(contracts)
        .innerJoin(businesses, eq(businesses.id, contracts.businessId))
        .where(and(...conditions))
        .orderBy(...ordering)
        .limit(query.pageSize)
        .offset((query.page - 1) * query.pageSize),
      database
        .select({ value: count() })
        .from(contracts)
        .where(and(...conditions)),
      database
        .select({
          archived: sql<boolean>`${contracts.archivedAt} is not null`,
          value: count(),
        })
        .from(contracts)
        .where(eq(contracts.ownerUserId, context.user.id))
        .groupBy(sql`${contracts.archivedAt} is not null`),
    ]);
    const ids = rows.map(({ contract }) => contract.id);
    const installments = ids.length
      ? await database
          .select()
          .from(contractInstallments)
          .where(inArray(contractInstallments.contractId, ids))
          .orderBy(asc(contractInstallments.number))
      : [];
    const projectCounts = ids.length
      ? await database
          .select({ contractId: projects.contractId, value: count() })
          .from(projects)
          .where(
            and(inArray(projects.contractId, ids), isNull(projects.archivedAt)),
          )
          .groupBy(projects.contractId)
      : [];
    const byContract = new Map<string, typeof installments>();
    for (const item of installments) {
      const values = byContract.get(item.contractId) ?? [];
      values.push(item);
      byContract.set(item.contractId, values);
    }
    const projectCountByContract = new Map(
      projectCounts.flatMap(({ contractId, value }) =>
        contractId ? [[contractId, value] as const] : [],
      ),
    );
    const active = facets
      .filter((item) => !item.archived)
      .reduce((sum, item) => sum + item.value, 0);
    const archived = facets
      .filter((item) => item.archived)
      .reduce((sum, item) => sum + item.value, 0);
    return json({
      workspaceId: query.workspaceId ?? "global",
      items: rows.map(({ contract, businessName }) =>
        _contractPayload(
          contract,
          businessName,
          byContract.get(contract.id),
          projectCountByContract.get(contract.id),
        ),
      ),
      page: query.page,
      pageSize: query.pageSize,
      total: totalRows[0]?.value ?? 0,
      totalPages: Math.ceil((totalRows[0]?.value ?? 0) / query.pageSize),
      facets: {
        all:
          query.archived === "only"
            ? archived
            : query.archived === "include"
              ? active + archived
              : active,
        archived,
        statuses: {},
      },
    });
  } catch (cause) {
    throwAuthorizationHttpError(cause);
  }
};

export const POST: RequestHandler = async ({ locals, request }) => {
  const context = requireAuthenticatedRequest(locals);
  const parsed = _contractMutationSchema.safeParse(
    await readRequestInput(request),
  );
  if (
    !parsed.success ||
    !_validInstallments(parsed.data) ||
    !hasValidContractDates(parsed.data)
  )
    error(400, "Dados financeiros do contrato inválidos.");
  try {
    const database = getDatabase();
    const workspaceId = parsed.data.workspaceId;
    if (!workspaceId) error(400, "Selecione o workspace do contrato.");
    const workspace = await requireWorkspacePermissionForUpdate(
      database,
      context.user.id,
      workspaceId,
      "workspace:write",
    );
    const [business] = await database
      .select({ id: businesses.id, name: businesses.name })
      .from(businesses)
      .where(
        and(
          eq(businesses.id, parsed.data.businessId),
          eq(businesses.ownerUserId, context.user.id),
        ),
      )
      .limit(1);
    if (!business) error(400, "Selecione um negócio da sua biblioteca.");
    const {
      installments: installmentValues,
      workspaceId: _,
      ...input
    } = parsed.data;
    const now = new Date();
    const contract = {
      id: randomUUID(),
      workspaceId: workspace.workspace.id,
      ownerUserId: context.user.id,
      ...input,
      paymentMethod: input.paymentMethod || null,
      paymentTerms: input.paymentTerms || null,
      financeNotes: input.financeNotes || null,
      createdAt: now,
      updatedAt: now,
      archivedAt: null,
    };
    await database.transaction(async (transaction) => {
      await transaction.insert(contracts).values(contract);
      // A recurring agreement always owns one system-managed operational
      // project. Deliveries are added to this project and renewed by cycle.
      if (contract.contractType === "recurring") {
        await transaction.insert(projects).values({
          id: randomUUID(),
          workspaceId: contract.workspaceId,
          businessId: contract.businessId,
          contractId: contract.id,
          isInstitutional: true,
          name: "Institucional",
          statusKey: "execucao",
          startDate: contract.startDate,
          endDate: contract.endDate,
          engagementType: "personal",
          contractType: "recurring",
          createdAt: now,
          updatedAt: now,
        });
      }
      if (installmentValues.length)
        await transaction.insert(contractInstallments).values(
          installmentValues.map((item) => ({
            workspaceId: contract.workspaceId,
            contractId: contract.id,
            number: item.number,
            dueDate: item.dueDate,
            amountCents: item.amountCents,
            statusKey: item.status || null,
          })),
        );
    });
    const installments = await database
      .select()
      .from(contractInstallments)
      .where(
        and(
          eq(contractInstallments.workspaceId, contract.workspaceId),
          eq(contractInstallments.contractId, contract.id),
        ),
      )
      .orderBy(asc(contractInstallments.number));
    return json(_contractPayload(contract, business.name, installments), {
      status: 201,
    });
  } catch (cause) {
    throwAuthorizationHttpError(cause);
  }
};
