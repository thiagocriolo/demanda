import { FinancialInvalidOperationError } from "./errors";

export function centsToDecimal(cents: number): string {
  if (!Number.isSafeInteger(cents) || cents <= 0) {
    throw new FinancialInvalidOperationError("O valor monetário é inválido.");
  }
  const whole = Math.trunc(cents / 100);
  const fraction = String(cents % 100).padStart(2, "0");
  return `${whole}.${fraction}`;
}

export function decimalToCents(value: string): number {
  const match = /^(\d+)(?:\.(\d{1,2}))?$/u.exec(value);
  if (!match) throw new FinancialInvalidOperationError();
  const cents =
    BigInt(match[1]!) * 100n + BigInt((match[2] ?? "").padEnd(2, "0"));
  if (cents > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new FinancialInvalidOperationError(
      "O valor monetário excede o limite seguro.",
    );
  }
  return Number(cents);
}
