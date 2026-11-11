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
    const [rows] = await pool.query(
      `select
        (select count(*) from users
          where username in ('teste1', 'teste2', 'teste3')) as seedUsers,
        (select count(*) from workspaces) as seedWorkspaces,
        (select count(*) from workspace_members) as seedMemberships,
        (select count(*)
          from workspaces as workspace
          where workspace.owner_user_id in (
            select id from users where username in ('teste1', 'teste2', 'teste3')
          ) and ((select count(*) from workspace_members as member
                 where member.workspace_id = workspace.id
                   and member.role = 'owner') <> 1
             or not exists (
               select 1 from workspace_members as owner_member
               where owner_member.workspace_id = workspace.id
                 and owner_member.user_id = workspace.owner_user_id
                 and owner_member.role = 'owner'
             ))) as invalidWorkspaceOwners`,
    );
    const state = (rows as VerificationRow[])[0];

    if (
      !state ||
      state.seedUsers !== 3 ||
      state.seedWorkspaces < 3 ||
      state.seedMemberships < 3 ||
      state.invalidWorkspaceOwners !== 0
    ) {
      throw new Error(
        `O núcleo persistido não respeita os invariants da BE-02: ${JSON.stringify(state)}.`,
      );
    }

    console.log(
      "Núcleo MySQL válido: 3 usuários seed, ao menos 3 workspaces e 3 vínculos.",
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
