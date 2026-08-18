import { error } from "@sveltejs/kit";
import { z } from "zod";
import type { RequestHandler } from "./$types";
import { getServerEnvironment } from "$lib/server/config/env";
import { getDatabase } from "$lib/server/db";
import { throwStoredFileHttpError } from "$lib/server/files/http";
import { getPublicFileContent } from "$lib/server/files/service";
import { createPrivateFileStorage } from "$lib/server/files/storage";

export const GET: RequestHandler = async ({ params }) => {
  const id = z.string().uuid().safeParse(params.fileId);
  if (!id.success) error(404, "Arquivo não encontrado.");

  try {
    const file = await getPublicFileContent(
      getDatabase(),
      id.data,
      createPrivateFileStorage(getServerEnvironment()),
    );
    return new Response(Uint8Array.from(file.bytes).buffer, {
      headers: {
        "content-type": file.mimeType,
        "content-length": String(file.bytes.byteLength),
        "cache-control": "public, max-age=300",
        etag: `"${file.sha256}"`,
        "x-content-type-options": "nosniff",
      },
    });
  } catch (cause) {
    throwStoredFileHttpError(cause);
  }
};
