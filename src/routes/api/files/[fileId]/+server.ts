import type { RequestHandler } from "./$types";
import {
  auditRequestMetadata,
  requireAuthenticatedRequest,
} from "$lib/server/authorization/http";
import { getDatabase } from "$lib/server/db";
import { getServerEnvironment } from "$lib/server/config/env";
import { throwStoredFileHttpError } from "$lib/server/files/http";
import { deletePrivateFile } from "$lib/server/files/service";
import { createPrivateFileStorage } from "$lib/server/files/storage";

export const DELETE: RequestHandler = async (event) => {
  const context = requireAuthenticatedRequest(event.locals);
  try {
    await deletePrivateFile(
      getDatabase(),
      context,
      event.params.fileId,
      auditRequestMetadata(event),
      createPrivateFileStorage(getServerEnvironment()),
    );
    return new Response(null, { status: 204 });
  } catch (cause) {
    throwStoredFileHttpError(cause);
  }
};
