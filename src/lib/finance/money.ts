/**
 * Parses Brazilian or international currency strings into integer cents.
 * Handles thousand separators (e.g. "1.200") and 1-2 decimal digits (e.g. "1.200,50").
 */
export function moneyToCents(
  value: string | undefined,
  options: { allowNegative?: boolean } = {},
): number {
  const raw = (value ?? "").trim().replace(/\s|R\$/giu, "");
  if (!raw) return 0;
  const negative = raw.includes("-");
  if (negative && !options.allowNegative) return 0;
  const decimalSeparator = Math.max(raw.lastIndexOf(","), raw.lastIndexOf("."));
  let digits: string;
  if (
    decimalSeparator >= 0 &&
    raw.length - decimalSeparator - 1 >= 1 &&
    raw.length - decimalSeparator - 1 <= 2
  ) {
    const integer = raw.slice(0, decimalSeparator).replace(/\D/gu, "") || "0";
    const decimal = raw
      .slice(decimalSeparator + 1)
      .replace(/\D/gu, "")
      .padEnd(2, "0")
      .slice(0, 2);
    digits = `${integer}${decimal}`;
  } else {
    digits = `${raw.replace(/\D/gu, "")}00`;
  }
  const cents = Number(digits);
  return Number.isSafeInteger(cents) ? (negative ? -cents : cents) : 0;
}

/** Formats non-negative integer cents as pt-BR decimal string (without currency symbol). */
export function centsToMoney(cents: number): string {
  const safe = Math.max(0, Math.round(Number.isFinite(cents) ? cents : 0));
  return (safe / 100).toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/** Splits total integer cents across `count` installments, putting any remainder in the last one. */
export function splitCents(total: number, count: number): number[] {
  if (count <= 0) return [];
  const base = Math.trunc(total / count);
  return Array.from({ length: count }, (_, index) =>
    index === count - 1 ? total - base * (count - 1) : base,
  );
}
