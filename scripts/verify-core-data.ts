import "dotenv/config";
import { parseServerEnvironment } from "../src/lib/server/config/env-schema";
import { createDatabasePool } from "../src/lib/server/db/pool";
type VerificationRow = {
  seedUsers: number;
  seedWorkspaces: number;
  seedMemberships: number;
  invalidWorkspaceOwners: number;
};

async function main(): Promise<void> {
  const environment = parseServerEnvironment(process.env);
  const pool = createDatabasePool(environment);

  try {
    const result = await pool.query<VerificationRow>(
      `select
        (select count(*)::int from app.users
          where username in ('teste1', 'teste2', 'teste3')) as "seedUsers",
        (select count(*)::int from app.workspaces) as "seedWorkspaces",
        (select count(*)::int from app.workspace_members) as "seedMemberships",
        (select count(*)::int
          from app.workspaces as workspace
          where (select count(*) from app.workspace_members as member
                 where member.workspace_id = workspace.id
                   and member.role = 'owner') <> 1
             or not exists (
               select 1 from app.workspace_members as owner_member
               where owner_member.workspace_id = workspace.id
                 and owner_member.user_id = workspace.owner_user_id
                 and owner_member.role = 'owner'
             )) as "invalidWorkspaceOwners"`,
    );
    const state = result.rows[0];

    if (
      !state ||
      state.seedUsers !== 3 ||
      state.seedWorkspaces < 7 ||
      state.seedMemberships < 12 ||
      state.invalidWorkspaceOwners !== 0
    ) {
      throw new Error(
        `O núcleo persistido não respeita os invariants da BE-02: ${JSON.stringify(state)}.`,
      );
    }

    console.log(
      "Núcleo persistido válido: 3 usuários seed, ao menos 7 workspaces e 12 vínculos.",
    );
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Erro desconhecido";
  console.error(`[database] Falha na verificação do núcleo: ${message}`);
  process.exitCode = 1;
});
