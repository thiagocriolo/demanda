/** Extracts the constraint or index name from Drizzle/MySQL/PostgreSQL errors. */
export function databaseConstraint(error: unknown): string | undefined {
  const visited = new Set<unknown>();
  let current = error;
  while (current && typeof current === "object" && !visited.has(current)) {
    visited.add(current);
    if ("constraint" in current && typeof current.constraint === "string") {
      return current.constraint;
    }
    if ("sqlMessage" in current && typeof current.sqlMessage === "string") {
      const match =
        /CONSTRAINT `([^`]+)`/u.exec(current.sqlMessage) ??
        /for key ['`]([^'`]+)['`]/u.exec(current.sqlMessage);
      if (match?.[1]) return match[1].split(".").at(-1);
    }
    current = "cause" in current ? current.cause : undefined;
  }
  return undefined;
}

/** Escapes LIKE wildcards for MySQL queries using `ESCAPE '!'`. */
export function escapeLikeMySql(value: string): string {
  return value.replace(/[!%_]/g, (character) => `!${character}`);
}

/** Converts a nullable Date into an ISO-8601 string or null. */
export function toIsoTimestamp(value: Date | null): string | null {
  return value?.toISOString() ?? null;
}

/** Normalizes user-facing labels into canonical snake_case catalog keys. */
export function normalizeKey(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "_")
    .replace(/^[_-]+|[_-]+$/g, "")
    .replace(/_{2,}/g, "_");
}
