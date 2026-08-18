import type { FinanceInstallment } from "./finance";

function toCents(value: number): number {
  return Math.max(0, Math.round((Number.isFinite(value) ? value : 0) * 100));
}

function fromCents(value: number): number {
  return value / 100;
}

function splitCents(total: number, count: number): number[] {
  if (count <= 0) return [];
  const base = Math.trunc(total / count);
  const values = Array.from({ length: count }, () => base);
  values[count - 1] += total - base * count;
  return values;
}

export function addMonthsToFinanceDate(value: string, offset: number): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return "";

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const target = new Date(Date.UTC(year, month - 1 + offset, 1));
  const lastDay = new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0),
  ).getUTCDate();

  return [
    target.getUTCFullYear(),
    String(target.getUTCMonth() + 1).padStart(2, "0"),
    String(Math.min(day, lastDay)).padStart(2, "0"),
  ].join("-");
}

export function buildFinanceInstallments(
  amount: number,
  count: number,
  firstDueDate: string,
): FinanceInstallment[] {
  const normalizedCount = Math.max(2, Math.min(99, Math.trunc(count) || 2));
  const amounts = splitCents(toCents(amount), normalizedCount);

  return amounts.map((value, index) => ({
    number: index + 1,
    dueDate: addMonthsToFinanceDate(firstDueDate, index),
    amount: fromCents(value),
  }));
}

export function rebalanceFinanceInstallments(
  installments: FinanceInstallment[],
  changedIndex: number,
  changedAmount: number,
  totalAmount: number,
): FinanceInstallment[] {
  if (!installments[changedIndex]) return installments;

  const totalCents = toCents(totalAmount);
  const previousTotal = installments
    .slice(0, changedIndex)
    .reduce((sum, installment) => sum + toCents(installment.amount), 0);
  const changedCents = Math.min(
    toCents(changedAmount),
    Math.max(0, totalCents - previousTotal),
  );
  const followingCount = installments.length - changedIndex - 1;
  const followingAmounts = splitCents(
    Math.max(0, totalCents - previousTotal - changedCents),
    followingCount,
  );

  return installments.map((installment, index) => {
    if (index < changedIndex) return installment;
    if (index === changedIndex) {
      return { ...installment, amount: fromCents(changedCents) };
    }
    return {
      ...installment,
      amount: fromCents(followingAmounts[index - changedIndex - 1]),
    };
  });
}

export function financeInstallmentsTotal(
  installments: FinanceInstallment[],
): number {
  return fromCents(
    installments.reduce(
      (sum, installment) => sum + toCents(installment.amount),
      0,
    ),
  );
}
