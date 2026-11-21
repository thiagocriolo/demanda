import "dotenv/config";
import { parseServerEnvironment } from "../src/lib/server/config/env-schema";
import { createDatabasePool } from "../src/lib/server/db/pool";
import { LOAD_SEED_WORKSPACE_IDS } from "./seed-load-test";

type VerificationRow = {
  workspaces: number;
  people: number;
  invalidContracts: number;
  invalidProjects: number;
  invalidDeliveries: number;
  invalidTasks: number;
};

async function main(): Promise<void> {
  const environment = parseServerEnvironment(process.env);
  const pool = createDatabasePool(environment);
  const placeholders = LOAD_SEED_WORKSPACE_IDS.map(() => "?").join(", ");

  try {
    const [rows] = await pool.query(
      `select
        (select count(*) from workspaces where id in (${placeholders})) as workspaces,
        (select count(*) from contacts where workspace_id in (${placeholders})) as people,
        (select count(*) from (
          select contact.id
          from contacts contact
          left join business_responsibles br
            on br.workspace_id = contact.workspace_id and br.contact_id = contact.id
          left join contracts c
            on c.workspace_id = br.workspace_id and c.business_id = br.business_id
          where contact.workspace_id in (${placeholders})
          group by contact.id
          having count(c.id) not between 1 and 4
        ) invalid_contracts) as invalidContracts,
        (select count(*) from (
          select c.id
          from contracts c
          left join projects p on p.workspace_id = c.workspace_id and p.contract_id = c.id
          where c.workspace_id in (${placeholders})
          group by c.id having count(p.id) not between 1 and 10
        ) invalid_projects) as invalidProjects,
        (select count(*) from (
          select p.id
          from projects p
          left join tasks t on t.workspace_id = p.workspace_id and t.project_id = p.id
          where p.workspace_id in (${placeholders})
          group by p.id having count(t.id) not between 3 and 10
        ) invalid_deliveries) as invalidDeliveries,
        (select count(*) from (
          select t.id
          from tasks t
          left join task_subtasks st on st.workspace_id = t.workspace_id and st.task_id = t.id
          where t.workspace_id in (${placeholders})
          group by t.id having count(st.id) not between 3 and 10
        ) invalid_tasks) as invalidTasks`,
      [
        ...LOAD_SEED_WORKSPACE_IDS,
        ...LOAD_SEED_WORKSPACE_IDS,
        ...LOAD_SEED_WORKSPACE_IDS,
        ...LOAD_SEED_WORKSPACE_IDS,
        ...LOAD_SEED_WORKSPACE_IDS,
        ...LOAD_SEED_WORKSPACE_IDS,
      ],
    );
    const state = (rows as VerificationRow[])[0];
    if (
      !state ||
      state.workspaces !== 4 ||
      state.people !== 30 ||
      state.invalidContracts !== 0 ||
      state.invalidProjects !== 0 ||
      state.invalidDeliveries !== 0 ||
      state.invalidTasks !== 0
    ) {
      throw new Error(`A massa de carga é inválida: ${JSON.stringify(state)}.`);
    }
    console.log(
      "Seed de carga válido: 4 workspaces e 30 pessoas, com todas as cardinalidades solicitadas.",
    );
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Erro desconhecido";
  console.error(`[seed:verify] ${message}`);
  process.exitCode = 1;
});
