/** Keep HTML response headers within managed hosting proxy limits. */
export function stripHtmlLinkHeader(response: Response): Response {
  if (
    response.headers.get("content-type")?.toLowerCase().startsWith("text/html")
  ) {
    // Large pages produce a Link header > 8 KiB. Hosting proxies can reject
    // that otherwise valid response before it reaches the browser (HTTP 500).
    // Stylesheets and client entry scripts remain in the rendered document.
    response.headers.delete("link");
  }
  return response;
}
