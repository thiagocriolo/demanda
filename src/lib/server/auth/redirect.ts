export function safeInternalRedirect(
  candidate: string | null | undefined,
  fallback = "/dashboard",
): string {
  if (!candidate || !candidate.startsWith("/") || candidate.startsWith("//")) {
    return fallback;
  }

  try {
    const parsed = new URL(candidate, "https://demanda.invalid");
    if (parsed.origin !== "https://demanda.invalid") return fallback;
    if (parsed.pathname.includes("\\")) return fallback;
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return fallback;
  }
}
