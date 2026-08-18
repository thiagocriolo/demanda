export type MediaEvent =
  | "upload.requested"
  | "upload.received"
  | "validation.completed"
  | "processing.started"
  | "processing.completed"
  | "upload.failed"
  | "storage.failed"
  | "media.deleted"
  | "temporary.cleaned";

type MediaEventFields = Record<
  string,
  string | number | boolean | null | undefined
>;

/** Structured logs never include bytes, signed URLs, names or storage credentials. */
export function logMediaEvent(
  event: MediaEvent,
  fields: MediaEventFields = {},
  level: "info" | "error" = "info",
): void {
  const payload = JSON.stringify({
    scope: "private_media",
    event,
    ...fields,
  });
  if (level === "error") console.error(payload);
  else console.info(payload);
}
