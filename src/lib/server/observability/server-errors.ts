/** Keep query parameters, cookies and request bodies out of server diagnostics. */
export function describeServerError(error: unknown): Record<string, unknown>[] {
  const errors: Record<string, unknown>[] = [];
  const visited = new Set<unknown>();
  let current = error;

  while (current && typeof current === "object" && !visited.has(current)) {
    visited.add(current);
    const record = current as Record<string, unknown>;
    const detail: Record<string, unknown> = {};
    for (const field of ["name", "code", "errno", "sqlState", "sqlMessage"]) {
      if (
        typeof record[field] === "string" ||
        typeof record[field] === "number"
      ) {
        detail[field] = record[field];
      }
    }
    if (typeof record.message === "string") {
      // Drizzle embeds the entire query and its bound values in this message.
      detail.message = record.message.startsWith("Failed query:")
        ? "Database query failed (see cause)"
        : record.message;
    }
    if (typeof record.stack === "string") {
      detail.frames = record.stack
        .split("\n")
        .filter((line) => /^\s+at /.test(line));
    }
    errors.push(detail);
    current = record.cause;
  }

  if (errors.length === 0) errors.push({ message: String(error) });
  return errors;
}
