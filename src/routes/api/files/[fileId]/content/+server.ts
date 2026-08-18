import type { RequestHandler } from "./$types";
import { requireAuthenticatedRequest } from "$lib/server/authorization/http";
import { getDatabase } from "$lib/server/db";
import { getServerEnvironment } from "$lib/server/config/env";
import { throwStoredFileHttpError } from "$lib/server/files/http";
import { getPrivateFileContent } from "$lib/server/files/service";
import { createPrivateFileStorage } from "$lib/server/files/storage";

export const GET: RequestHandler = async ({ locals, params }) => {
  const context = requireAuthenticatedRequest(locals);
  try {
    const file = await getPrivateFileContent(
      getDatabase(),
      context,
      params.fileId,
      createPrivateFileStorage(getServerEnvironment()),
    );
    return new Response(Uint8Array.from(file.bytes).buffer, {
      headers: {
        "content-type": file.mimeType,
        "content-length": String(file.bytes.byteLength),
        "cache-control": "private, max-age=300",
        etag: `"${file.sha256}"`,
        "x-content-type-options": "nosniff",
      },
    });
  } catch (cause) {
    throwStoredFileHttpError(cause);
  }
};
