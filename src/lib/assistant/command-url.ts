const queryParameter = "commands";
const maximumPayloadLength = 24_000;

function toBase64Url(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replace(/\+/gu, "-")
    .replace(/\//gu, "_")
    .replace(/=+$/gu, "");
}

function fromBase64Url(value: string): string {
  if (
    !value ||
    value.length > maximumPayloadLength ||
    !/^[A-Za-z0-9_-]+$/u.test(value)
  ) {
    throw new Error(
      "O link de comandos é inválido ou excede o tamanho permitido.",
    );
  }
  const padded = value
    .replace(/-/gu, "+")
    .replace(/_/gu, "/")
    .padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
}

export function commandReviewUrl(commandDocument: string): string {
  // O fragmento fica somente no navegador e não é enviado ao proxy/servidor.
  // Isso evita HTTP 431 quando o lote é grande.
  return `/assistente/executar#${queryParameter}=${toBase64Url(commandDocument)}`;
}

export function commandDocumentFromUrl(value: string | null): string {
  if (!value) throw new Error("Este link não contém um lote de comandos.");
  try {
    return fromBase64Url(value);
  } catch (cause) {
    throw new Error(
      cause instanceof Error
        ? cause.message
        : "Não foi possível ler o lote de comandos deste link.",
    );
  }
}

export function commandDocumentFromHash(hash: string): string {
  const fragment = hash.startsWith("#") ? hash.slice(1) : hash;
  return commandDocumentFromUrl(
    new URLSearchParams(fragment).get(queryParameter),
  );
}
