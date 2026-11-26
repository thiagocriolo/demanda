import type { EntityRecord } from "../entities/types";
import { moneyToCents } from "../finance/money";
import type { ContractServicePackageSelection } from "../service-packages/types";
import {
  createChangeChannel,
  jsonRequest,
  requestJson as fetchJson,
} from "../http/client";

export type Contract = {
  id: string;
  workspaceId: string;
  ownerUserId: string;
  sourceServicePackageId?: string | null;
  name: string;
  business: { id: string; name: string };
  contractType: "one_off" | "recurring";
  amountCents: number;
  startDate: string | null;
  endDate: string | null;
  firstDueDate: string | null;
  paymentMethod: string;
  paymentTerms: string;
  financeNotes: string;
  projectCount: number;
  installments: ContractInstallment[];
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ContractInstallment = {
  id: string;
  number: number;
  dueDate: string;
  amountCents: number;
  status: string;
};

export type ContractInstallmentInput = Omit<ContractInstallment, "id">;

export type ContractMutationInput = {
  /** Required when the contract is first created; immutable afterwards. */
  workspaceId?: string;
  name: string;
  businessId: string;
  contractType: "one_off" | "recurring";
  amountCents: number;
  startDate: string | null;
  endDate: string | null;
  firstDueDate: string | null;
  paymentMethod: string;
  paymentTerms: string;
  financeNotes: string;
  installments: ContractInstallmentInput[];
  servicePackage?: ContractServicePackageSelection;
};

export type ContractList = {
  workspaceId: string;
  items: Contract[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  facets: { all: number; archived: number; statuses: Record<string, number> };
};

export class ContractApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "ContractApiError";
  }
}

function requestJson<T>(input: string, init?: RequestInit): Promise<T> {
  return fetchJson<T>(fetch, input, init, {
    fallbackMessage: "Não foi possível concluir a operação com o contrato.",
    createError: (status, message) => new ContractApiError(status, message),
  });
}

export async function listContracts(options: {
  page: number;
  pageSize: number;
  query: string;
  orderBy: "updated" | "name_asc" | "name_desc";
  archived: "exclude" | "include" | "only";
  workspaceId?: string;
  signal?: AbortSignal;
}): Promise<ContractList> {
  const params = new URLSearchParams({
    page: String(options.page),
    pageSize: String(options.pageSize),
    archived: options.archived,
    orderBy: options.orderBy,
  });
  if (options.query.trim()) params.set("query", options.query.trim());
  if (options.workspaceId) params.set("workspaceId", options.workspaceId);
  return requestJson<ContractList>(`/api/contracts?${params}`, {
    signal: options.signal,
  });
}

/** Active contracts accessible to the authenticated user (optionally filtered by workspace). */
export async function listAllActiveContracts(
  options: { workspaceId?: string; signal?: AbortSignal } = {},
): Promise<Contract[]> {
  const first = await listContracts({
    page: 1,
    pageSize: 100,
    query: "",
    orderBy: "name_asc",
    archived: "exclude",
    ...options,
  });
  const items = [...first.items];
  for (let page = 2; page <= first.totalPages; page += 1) {
    const result = await listContracts({
      page,
      pageSize: 100,
      query: "",
      orderBy: "name_asc",
      archived: "exclude",
      ...options,
    });
    items.push(...result.items);
  }
  return items;
}

export function getContract(id: string): Promise<Contract> {
  return requestJson<Contract>(`/api/contracts/${encodeURIComponent(id)}`);
}

export async function createContract(
  input: ContractMutationInput,
): Promise<Contract> {
  const contract = await requestJson<Contract>(
    "/api/contracts",
    jsonRequest("POST", input),
  );
  notifyContractsChanged();
  if (input.servicePackage && typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("demanda:projects-changed"));
    window.dispatchEvent(new CustomEvent("demanda:deliveries-changed"));
  }
  return contract;
}

export async function updateContract(
  id: string,
  input: ContractMutationInput,
): Promise<Contract> {
  const contract = await requestJson<Contract>(
    `/api/contracts/${encodeURIComponent(id)}`,
    jsonRequest("PUT", input),
  );
  notifyContractsChanged();
  return contract;
}

export async function archiveContract(id: string): Promise<void> {
  await requestJson<{ archived: true }>(
    `/api/contracts/${encodeURIComponent(id)}`,
    {
      method: "PATCH",
    },
  );
  notifyContractsChanged();
}

export async function deleteContract(
  id: string,
  options: { retainFinancialEntries?: boolean } = {},
): Promise<void> {
  await requestJson<{ deleted: true }>(
    `/api/contracts/${encodeURIComponent(id)}`,
    {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        retainFinancialEntries: options.retainFinancialEntries ?? false,
      }),
    },
  );
  notifyContractsChanged();
}

export function contractToEntityRecord(contract: Contract): EntityRecord {
  return {
    id: contract.id,
    workspaceId: contract.workspaceId,
    contractWorkspaceId: contract.workspaceId,
    createdAt: contract.createdAt,
    updatedAt: contract.updatedAt,
    archivedAt: contract.archivedAt ?? "",
    nome: contract.name,
    name: contract.name,
    negocio: contract.business.name,
    negocioId: contract.business.id,
    contractType: contract.contractType,
    tipoContrato:
      contract.contractType === "recurring" ? "Recorrente" : "Pontual",
    valor: (contract.amountCents / 100).toLocaleString("pt-BR", {
      style: "currency",
      currency: "BRL",
    }),
    amountCents: String(contract.amountCents),
    dataInicio: contract.startDate ?? "",
    dataFim: contract.endDate ?? "",
    primeiroVencimento: contract.firstDueDate ?? "",
    condicoes: contract.paymentTerms,
    paymentMethod: contract.paymentMethod,
    financeNotes: contract.financeNotes,
    quantidadeProjetos: String(contract.projectCount ?? 0),
    parcelas: String(Math.max(1, contract.installments.length)),
    installments: JSON.stringify(contract.installments),
  };
}

function contractInstallmentInputs(
  value: string | undefined,
): ContractInstallmentInput[] {
  try {
    const parsed: unknown = value ? JSON.parse(value) : [];
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((item, index) => {
      if (!item || typeof item !== "object") return [];
      const source = item as Record<string, unknown>;
      if (
        typeof source.dueDate !== "string" ||
        !/^\d{4}-\d{2}-\d{2}$/u.test(source.dueDate)
      )
        return [];
      const amountCents =
        typeof source.amountCents === "number" ? source.amountCents : 0;
      return [
        {
          number: typeof source.number === "number" ? source.number : index + 1,
          dueDate: source.dueDate,
          amountCents,
          status: typeof source.status === "string" ? source.status : "pending",
        },
      ];
    });
  } catch {
    return [];
  }
}

function parseServicePackageSelection(
  value: string | undefined,
): ContractServicePackageSelection | undefined {
  if (!value?.trim()) return undefined;
  try {
    const parsed: unknown = JSON.parse(value);
    if (!parsed || typeof parsed !== "object") return undefined;
    const source = parsed as Record<string, unknown>;
    if (
      typeof source.packageId !== "string" ||
      !source.packageId.trim() ||
      typeof source.responsibleUserId !== "string" ||
      !source.responsibleUserId.trim()
    ) {
      return undefined;
    }
    return {
      packageId: source.packageId.trim(),
      responsibleUserId: source.responsibleUserId.trim(),
      includedProjectIds: Array.isArray(source.includedProjectIds)
        ? source.includedProjectIds.filter(
            (id): id is string => typeof id === "string" && Boolean(id.trim()),
          )
        : undefined,
      projectResponsibleOverrides:
        source.projectResponsibleOverrides &&
        typeof source.projectResponsibleOverrides === "object" &&
        !Array.isArray(source.projectResponsibleOverrides)
          ? Object.fromEntries(
              Object.entries(
                source.projectResponsibleOverrides as Record<string, unknown>,
              ).filter(
                (entry): entry is [string, string] =>
                  typeof entry[1] === "string" && Boolean(entry[1].trim()),
              ),
            )
          : undefined,
      customProjects: Array.isArray(source.customProjects)
        ? (source.customProjects as ContractServicePackageSelection["customProjects"])
        : undefined,
    };
  } catch {
    return undefined;
  }
}

export function entityValuesToContractInput(
  values: Record<string, string>,
): ContractMutationInput {
  const servicePackage = parseServicePackageSelection(values.servicePackage);
  return {
    workspaceId: (values.workspaceId ?? values.contractWorkspaceId ?? "").trim() || undefined,
    name: (values.nome ?? values.name ?? "").trim(),
    businessId: (values.negocioId ?? values.businessId ?? "").trim(),
    contractType:
      values.contractType === "recurring" ||
      values.tipoContrato === "Recorrente"
        ? "recurring"
        : "one_off",
    amountCents: /^\d+$/u.test(values.amountCents ?? "")
      ? Number(values.amountCents)
      : moneyToCents(values.valor),
    startDate: values.dataInicio?.trim() || null,
    endDate: values.dataFim?.trim() || null,
    firstDueDate: values.primeiroVencimento?.trim() || null,
    paymentMethod: values.paymentMethod?.trim() ?? "",
    paymentTerms: values.condicoes?.trim() ?? "",
    financeNotes: values.financeNotes?.trim() ?? "",
    installments: contractInstallmentInputs(values.installments),
    ...(servicePackage ? { servicePackage } : {}),
  };
}

export const CONTRACTS_CHANGED_EVENT = "demanda:contracts-changed";

const contractsChannel = createChangeChannel(CONTRACTS_CHANGED_EVENT);
const notifyContractsChanged = contractsChannel.notify;
export const observeContracts = contractsChannel.observe;
