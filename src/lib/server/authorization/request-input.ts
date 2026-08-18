export async function readRequestInput(
  request: Request,
): Promise<Record<string, unknown>> {
  try {
    const contentType = request.headers.get("content-type") ?? "";
    if (contentType.includes("application/json")) {
      const value: unknown = await request.json();
      return value && typeof value === "object"
        ? (value as Record<string, unknown>)
        : {};
    }

    const formData = await request.formData();
    return Object.fromEntries(formData.entries());
  } catch {
    return {};
  }
}
