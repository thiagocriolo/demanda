import { error, json } from "@sveltejs/kit";
import { and, asc, count, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import type { RequestHandler } from "./$types";
import {
  _contractMutationSchema,
  _contractPayload,
  _recurringInstallments,
  _validInstallments,
} from "../+server";
import {
  requireAuthenticatedRequest,
  throwAuthorizationHttpError,
} from "$lib/server/authorization/http";
import { readRequestInput } from "$lib/server/authorization/request-input";
import {
  requireActiveWorkspacePermission,
  requireWorkspacePermissionForUpdate,
} from "$lib/server/authorization/workspace-context";
import { getDatabase } from "$lib/server/db";
import {
  businesses,
  contractInstallments,
  contracts,
  financialEntries,
  projects,
} from "$lib/server/db/schema";

const deleteSchema = z
  .object({ retainFinancialEntries: z.boolean().default(false) })
  .strict();

async function findContract(
  contractId: string,
  ownerUserId: string,
  workspaceId?: string,
) {
  const database = getDatabase();
  const [result] = await database
    .select({ contract: contracts, businessName: businesses.name })
    .from(contracts)
    .innerJoin(businesses, eq(businesses.id, contracts.businessId))
    .where(
      and(
        eq(contracts.ownerUserId, ownerUserId),
        eq(contracts.id, contractId),
        ...(workspaceId ? [eq(contracts.workspaceId, workspaceId)] : []),
      ),
    )
    .limit(1);
  if (!result) return null;
  const installments = await database
    .select()
    .from(contractInstallments)
    .where(
      and(
        eq(contractInstallments.workspaceId, result.contract.workspaceId),
        eq(contractInstallments.contractId, contractId),
      ),
    )
    .orderBy(asc(contractInstallments.number));
  const [projectCount] = await database
    .select({ value: count() })
    .from(projects)
    .where(
      and(
        eq(projects.workspaceId, result.contract.workspaceId),
        eq(projects.contractId, contractId),
        isNull(projects.archivedAt),
      ),
    );
  return { ...result, installments, projectCount: projectCount?.value ?? 0 };
}
function ensureId(id: string): void {
  if (!z.string().uuid().safeParse(id).success)
    error(404, "Contrato não encontrado.");
}

export const GET: RequestHandler = async ({ locals, params }) => {
  const context = requireAuthenticatedRequest(locals);
  ensureId(params.contractId);
  try {
    const result = await findContract(params.contractId, context.user.id);
    if (!result) error(404, "Contrato não encontrado.");
    return json(
      _contractPayload(
        result.contract,
        result.businessName,
        result.installments,
        result.projectCount,
      ),
    );
  } catch (cause) {
    throwAuthorizationHttpError(cause);
  }
};

export const PUT: RequestHandler = async ({ locals, params, request }) => {
  const context = requireAuthenticatedRequest(locals);
  ensureId(params.contractId);
  const parsed = _contractMutationSchema.safeParse(
    await readRequestInput(request),
  );
  if (
    !parsed.success ||
    !_validInstallments(parsed.data) ||
    (parsed.data.startDate &&
      parsed.data.endDate &&
      parsed.data.startDate > parsed.data.endDate)
  )
    error(400, "Dados financeiros do contrato inválidos.");
  try {
    const database = getDatabase();
    const existing = await findContract(params.contractId, context.user.id);
    if (!existing) error(404, "Contrato não encontrado.");
    const workspace = await requireWorkspacePermissionForUpdate(
      database,
      context.user.id,
      existing.contract.workspaceId,
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
    const updatedAt = new Date();
    await database.transaction(async (transaction) => {
      await transaction
        .update(contracts)
        .set({
          ...parsed.data,
          workspaceId: workspace.workspace.id,
          ownerUserId: existing.contract.ownerUserId,
          paymentMethod: parsed.data.paymentMethod || null,
          paymentTerms: parsed.data.paymentTerms || null,
          financeNotes: parsed.data.financeNotes || null,
          updatedAt,
        })
        .where(
          and(
            eq(contracts.workspaceId, workspace.workspace.id),
            eq(contracts.id, params.contractId),
          ),
        );
      await transaction
        .delete(contractInstallments)
        .where(
          and(
            eq(contractInstallments.workspaceId, workspace.workspace.id),
            eq(contractInstallments.contractId, params.contractId),
          ),
        );
      const installmentValues =
        parsed.data.contractType === "recurring"
          ? _recurringInstallments(parsed.data)
          : parsed.data.installments;
      if (installmentValues.length)
        await transaction.insert(contractInstallments).values(
          installmentValues.map((item) => ({
            workspaceId: workspace.workspace.id,
            contractId: params.contractId,
            number: item.number,
            dueDate: item.dueDate,
            amountCents: item.amountCents,
            statusKey: item.status || null,
          })),
        );
    });
    const updated = await findContract(
      params.contractId,
      context.user.id,
      workspace.workspace.id,
    );
    if (!updated) error(404, "Contrato não encontrado.");
    return json(
      _contractPayload(
        updated.contract,
        business.name,
        updated.installments,
        updated.projectCount,
      ),
    );
  } catch (cause) {
    throwAuthorizationHttpError(cause);
  }
};

export const PATCH: RequestHandler = async ({ locals, params }) => {
  error(405, "Contratos nÃ£o podem ser arquivados.");
  const context = requireAuthenticatedRequest(locals);
  ensureId(params.contractId);
  try {
    const workspace = requireActiveWorkspacePermission(
      context,
      "workspace:write",
    );
    const existing = await findContract(params.contractId, context.user.id);
    if (!existing) error(404, "Contrato não encontrado.");
    if (!existing?.contract.archivedAt) {
      const now = new Date();
      await getDatabase()
        .update(contracts)
        .set({ archivedAt: now, updatedAt: now })
        .where(
          and(
            eq(contracts.workspaceId, workspace.workspace.id),
            eq(contracts.id, params.contractId),
          ),
        );
    }
    return json({ archived: true });
  } catch (cause) {
    throwAuthorizationHttpError(cause);
  }
};

export const DELETE: RequestHandler = async ({ locals, params, request }) => {
  const context = requireAuthenticatedRequest(locals);
  ensureId(params.contractId);
  const parsed = deleteSchema.safeParse(await readRequestInput(request));
  if (!parsed.success) error(400, "OpÃ§Ã£o de exclusÃ£o invÃ¡lida.");
  try {
    const database = getDatabase();
    const existing = await findContract(params.contractId, context.user.id);
    if (!existing) error(404, "Contrato não encontrado.");
    const workspace = await requireWorkspacePermissionForUpdate(
      database,
      context.user.id,
      existing.contract.workspaceId,
      "workspace:write",
    );
    const [linked] = await database
      .select({ id: projects.id })
      .from(projects)
      .where(
        and(
          eq(projects.workspaceId, workspace.workspace.id),
          eq(projects.contractId, params.contractId),
        ),
      )
      .limit(1);
    if (linked)
      error(409, "Não é possível excluir um contrato vinculado a projetos.");
    await database.transaction(async (transaction) => {
      if (parsed.data.retainFinancialEntries) {
        await transaction
          .update(financialEntries)
          .set({
            source: "manual",
            contractId: null,
            contractInstallmentId: null,
            seriesId: null,
            seriesKind: null,
            seriesNumber: null,
            seriesCount: null,
            updatedByUserId: context.user.id,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(financialEntries.ownerUserId, context.user.id),
              eq(financialEntries.workspaceId, workspace.workspace.id),
              eq(financialEntries.contractId, params.contractId),
            ),
          );
      }
      await transaction
        .delete(contracts)
        .where(
          and(
            eq(contracts.workspaceId, workspace.workspace.id),
            eq(contracts.id, params.contractId),
          ),
        );
    });
    return json({
      deleted: true,
      retainedFinancialEntries: parsed.data.retainFinancialEntries,
    });
  } catch (cause) {
    throwAuthorizationHttpError(cause);
  }
};
