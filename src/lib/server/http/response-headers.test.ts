import { describe, expect, it } from "vitest";
import { stripHtmlLinkHeader } from "./response-headers";

describe("stripHtmlLinkHeader", () => {
  it("removes oversized HTML preload headers while keeping document preloads and cookies", async () => {
    const html =
      '<!doctype html><html><head><link rel="modulepreload" href="/app.js"><link rel="stylesheet" href="/app.css"></head><body>Page</body></html>';
    const response = new Response(html, {
      headers: {
        "content-type": "text/html; charset=utf-8",
        link: Array.from(
          { length: 150 },
          (_, index) =>
            `</_app/immutable/chunks/module-${index}.js>; rel="modulepreload"; nopush`,
        ).join(", "),
        "set-cookie": "session=test; Path=/; HttpOnly; Secure",
        "cache-control": "private, no-store",
      },
    });
    expect(response.headers.get("link")!.length).toBeGreaterThan(8192);
    expect(stripHtmlLinkHeader(response)).toBe(response);
    expect(response.headers.has("link")).toBe(false);
    expect(response.headers.get("set-cookie")).toBe(
      "session=test; Path=/; HttpOnly; Secure",
    );
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(await response.text()).toBe(html);
  });

  it("preserves API pagination links and redirects", () => {
    const response = new Response("{}", {
      headers: {
        "content-type": "application/json",
        link: '</api/posts?page=2>; rel="next"',
      },
    });
    stripHtmlLinkHeader(response);
    expect(response.headers.get("link")).toContain('rel="next"');
    const redirect = new Response(null, {
      status: 303,
      headers: { location: "/dashboard", "set-cookie": "session=test; Path=/" },
    });
    stripHtmlLinkHeader(redirect);
    expect(redirect.status).toBe(303);
    expect(redirect.headers.get("location")).toBe("/dashboard");
    expect(redirect.headers.has("set-cookie")).toBe(true);
  });
});
