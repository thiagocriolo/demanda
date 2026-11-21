import type { Contract } from "./client";

export type ContractFilter = "active" | "one_off" | "recurring" | "archived";
export type ContractSort =
  "updated" | "name_asc" | "name_desc" | "amount_desc" | "amount_asc";

export type ContractPortfolioSummary = {
  activeCount: number;
  activeAmountCents: number;
  oneOffCount: number;
  oneOffAmountCents: number;
  recurringCount: number;
  recurringAmountCents: number;
  archivedCount: number;
  linkedProjectsCount: number;
};

export function formatContractMoney(amountCents: number): string {
  return (amountCents / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

export function formatContractDate(value: string | null | undefined): string {
  if (!value) return "";
  const match = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(value.trim());
  if (!match) return value;
  return `${match[3]}/${match[2]}/${match[1]}`;
}

export function formatContractPeriod(contract: Contract): string {
  const start = formatContractDate(contract.startDate);
  const end = formatContractDate(contract.endDate);
  if (start && end) return `${start} → ${end}`;
  if (start) return `Desde ${start}`;
  if (end) return `Até ${end}`;
  const due = formatContractDate(contract.firstDueDate);
  if (due) {
    return contract.contractType === "recurring"
      ? `Vencimento ${due}`
      : `1º venc. ${due}`;
  }
  return "Período em aberto";
}

export function formatContractPeriodDetail(contract: Contract): string {
  if (contract.paymentMethod.trim()) return contract.paymentMethod.trim();
  return formatContractDuration(contract);
}

export function formatContractDuration(contract: Contract): string {
  if (contract.startDate && contract.endDate) {
    const startMs = Date.parse(`${contract.startDate}T00:00:00Z`);
    const endMs = Date.parse(`${contract.endDate}T00:00:00Z`);
    if (
      Number.isFinite(startMs) &&
      Number.isFinite(endMs) &&
      endMs >= startMs
    ) {
      const days = Math.round((endMs - startMs) / 86_400_000) + 1;
      return days === 1 ? "1 dia" : `${days} dias`;
    }
  }
  return contract.contractType === "recurring"
    ? "Cobrança mensal"
    : "Pagamento não informado";
}

export function formatContractScheduleMeta(contract: Contract): string {
  if (contract.contractType === "recurring") {
    return contract.paymentMethod
      ? `Mensal · ${contract.paymentMethod}`
      : "Cobrança recorrente";
  }
  const count = contract.installments.length;
  const installmentText =
    count > 1 ? `${count} parcelas` : count === 1 ? "À vista" : "Sem parcelas";
  return contract.paymentMethod
    ? `${installmentText} · ${contract.paymentMethod}`
    : installmentText;
}

export function summarizeContractPortfolio(
  contracts: Contract[],
): ContractPortfolioSummary {
  const summary: ContractPortfolioSummary = {
    activeCount: 0,
    activeAmountCents: 0,
    oneOffCount: 0,
    oneOffAmountCents: 0,
    recurringCount: 0,
    recurringAmountCents: 0,
    archivedCount: 0,
    linkedProjectsCount: 0,
  };

  for (const contract of contracts) {
    if (contract.archivedAt) {
      summary.archivedCount += 1;
      continue;
    }
    summary.activeCount += 1;
    summary.activeAmountCents += contract.amountCents;
    summary.linkedProjectsCount += contract.projectCount ?? 0;
    if (contract.contractType === "recurring") {
      summary.recurringCount += 1;
      summary.recurringAmountCents += contract.amountCents;
    } else {
      summary.oneOffCount += 1;
      summary.oneOffAmountCents += contract.amountCents;
    }
  }

  return summary;
}

function normalizeSearch(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .trim()
    .toLocaleLowerCase("pt-BR");
}

export function filterAndSortContracts(
  contracts: Contract[],
  options: {
    filter: ContractFilter;
    workspaceId: string;
    query: string;
    sort: ContractSort;
  },
): Contract[] {
  const query = normalizeSearch(options.query);

  const filtered = contracts.filter((contract) => {
    const isArchived = Boolean(contract.archivedAt);
    if (options.filter === "archived") {
      if (!isArchived) return false;
    } else {
      if (isArchived) return false;
      if (options.filter === "one_off" && contract.contractType !== "one_off") {
        return false;
      }
      if (
        options.filter === "recurring" &&
        contract.contractType !== "recurring"
      ) {
        return false;
      }
    }

    if (
      options.workspaceId !== "all" &&
      contract.workspaceId !== options.workspaceId
    ) {
      return false;
    }

    if (query) {
      const haystack = normalizeSearch(
        `${contract.name} ${contract.business.name} ${contract.paymentMethod}`,
      );
      if (!haystack.includes(query)) return false;
    }

    return true;
  });

  return filtered.toSorted((left, right) => {
    switch (options.sort) {
      case "name_asc":
        return left.name.localeCompare(right.name, "pt-BR");
      case "name_desc":
        return right.name.localeCompare(left.name, "pt-BR");
      case "amount_desc":
        return (
          right.amountCents - left.amountCents ||
          left.name.localeCompare(right.name, "pt-BR")
        );
      case "amount_asc":
        return (
          left.amountCents - right.amountCents ||
          left.name.localeCompare(right.name, "pt-BR")
        );
      case "updated":
      default:
        return right.updatedAt.localeCompare(left.updatedAt);
    }
  });
}
