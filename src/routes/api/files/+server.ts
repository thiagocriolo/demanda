import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import {
  auditRequestMetadata,
  requireAuthenticatedRequest,
} from "$lib/server/authorization/http";
import { getDatabase } from "$lib/server/db";
import { getServerEnvironment } from "$lib/server/config/env";
import { throwStoredFileHttpError } from "$lib/server/files/http";
import { uploadPrivateMedia } from "$lib/server/files/service";
import { createPrivateFileStorage } from "$lib/server/files/storage";
import {
  MAX_PRIVATE_MEDIA_BYTES,
  storedFilePurposeSchema,
} from "$lib/server/files/validation";

export const POST: RequestHandler = async (event) => {
  const context = requireAuthenticatedRequest(event.locals);
  const contentLength = Number(
    event.request.headers.get("content-length") ?? 0,
  );
  if (contentLength > MAX_PRIVATE_MEDIA_BYTES + 128 * 1024) {
    return json(
      { message: "O arquivo ultrapassa o tamanho máximo permitido." },
      { status: 413 },
    );
  }
  const form = await event.request.formData();
  const purpose = storedFilePurposeSchema.safeParse(form.get("purpose"));
  const file = form.get("file");
  if (!purpose.success || !(file instanceof File)) {
    return json({ message: "Envio de arquivo inválido." }, { status: 400 });
  }
  if (file.size > MAX_PRIVATE_MEDIA_BYTES) {
    return json(
      { message: "O arquivo ultrapassa o tamanho máximo permitido." },
      { status: 413 },
    );
  }
  try {
    const stored = await uploadPrivateMedia(
      getDatabase(),
      context,
      {
        purpose: purpose.data,
        originalName: file.name,
        claimedMimeType: file.type,
        content: new Uint8Array(await file.arrayBuffer()),
      },
      auditRequestMetadata(event),
      createPrivateFileStorage(getServerEnvironment()),
    );
    return json({ file: stored }, { status: 201 });
  } catch (cause) {
    throwStoredFileHttpError(cause);
  }
};
