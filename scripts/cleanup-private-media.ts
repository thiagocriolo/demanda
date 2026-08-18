import "dotenv/config";
import { parseServerEnvironment } from "../src/lib/server/config/env-schema";
import { createDatabase } from "../src/lib/server/db/database";
import { createDatabasePool } from "../src/lib/server/db/pool";
import { cleanupPrivateMedia } from "../src/lib/server/files/cleanup";
import { createPrivateFileStorage } from "../src/lib/server/files/storage";

const deleteOrphans = process.argv.includes("--delete-orphans");
const environment = parseServerEnvironment(process.env);
const pool = createDatabasePool(environment);
try {
  const result = await cleanupPrivateMedia(
    createDatabase(pool),
    createPrivateFileStorage(environment),
    { deleteOrphans },
  );

  console.log(
    JSON.stringify(
      {
        mode: deleteOrphans ? "cleanup" : "dry-run-orphans",
        temporaryDeleted: result.temporaryDeleted.length,
        interruptedDeletionsCompleted:
          result.interruptedDeletionsCompleted.length,
        staleRecordsDeleted: result.staleRecordsDeleted.length,
        orphanKeysFound: result.orphanKeys.length,
        orphanKeysDeleted: result.orphanKeysDeleted.length,
        staleReservationUsersReleased: result.staleReservationUsersReleased,
      },
      null,
      2,
    ),
  );
} finally {
  await pool.end();
}
