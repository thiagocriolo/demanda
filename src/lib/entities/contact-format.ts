export const BRAZILIAN_MOBILE_PHONE_PATTERN = "[1-9]{2} 9 [0-9]{4}\\.[0-9]{4}";
export const EMAIL_PATTERN = "[^\\s@]+@[^\\s@]+\\.[^\\s@]{2,}";

export function formatBrazilianMobilePhone(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 11);

  if (digits.length <= 2) return digits;
  if (digits.length <= 3) return `${digits.slice(0, 2)} ${digits.slice(2)}`;
  if (digits.length <= 7) {
    return `${digits.slice(0, 2)} ${digits.slice(2, 3)} ${digits.slice(3)}`;
  }

  return `${digits.slice(0, 2)} ${digits.slice(2, 3)} ${digits.slice(3, 7)}.${digits.slice(7)}`;
}

export function formatEmail(value: string): string {
  return value.replace(/\s/g, "").toLocaleLowerCase("pt-BR");
}

export function isValidBrazilianMobilePhone(value: string): boolean {
  return /^[1-9]{2} 9 [0-9]{4}\.[0-9]{4}$/.test(value);
}

export function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value);
}
