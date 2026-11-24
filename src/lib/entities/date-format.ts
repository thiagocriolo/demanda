const ISO_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/u;
const DATE_VALUE_PATTERN =
  /^(?:(\d{2})[./](\d{2})[./](\d{4})|(\d{4})-(\d{2})-(\d{2}))$/u;

export function formatDateInput(value: string): string {
  const trimmed = value.trim();
  const iso = ISO_DATE_PATTERN.exec(trimmed);
  if (iso) {
    return `${iso[3]}/${iso[2]}/${iso[1]}`;
  }

  const digits = value.replace(/\D/gu, "").slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}

export function dateInputCaretPosition(
  rawValue: string,
  rawCaret: number | null,
  formattedValue: string,
): number {
  if (ISO_DATE_PATTERN.test(rawValue.trim())) {
    return formattedValue.length;
  }

  const caret = rawCaret ?? rawValue.length;
  const digitsBeforeCaret = Math.min(
    rawValue.slice(0, caret).replace(/\D/gu, "").length,
    8,
  );
  const position =
    digitsBeforeCaret <= 2
      ? digitsBeforeCaret
      : digitsBeforeCaret <= 4
        ? digitsBeforeCaret + 1
        : digitsBeforeCaret + 2;

  return Math.min(position, formattedValue.length);
}

export function formatDateForDisplay(value: string): string {
  const raw = value.trim();
  if (!raw) return "";
  const iso = ISO_DATE_PATTERN.exec(raw);
  if (iso) return `${iso[3]}/${iso[2]}/${iso[1]}`;
  const digits = /^(\d{2})(\d{2})(\d{4})$/u.exec(raw);
  if (digits) return `${digits[1]}/${digits[2]}/${digits[3]}`;
  return raw.replaceAll(".", "/");
}

export function normalizeDateInput(value: string): string | null {
  const raw = value.trim();
  if (!raw) return "";
  const match = DATE_VALUE_PATTERN.exec(raw);
  if (!match) return null;

  const year = Number(match[3] ?? match[4]);
  const month = Number(match[2] ?? match[5]);
  const day = Number(match[1] ?? match[6]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }

  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}
