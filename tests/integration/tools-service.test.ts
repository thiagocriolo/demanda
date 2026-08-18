import "dotenv/config";
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import type { RequestAuthorizationContext } from "../../src/lib/server/authorization/workspace-context";
import { parseServerEnvironment } from "../../src/lib/server/config/env-schema";
import {
  createDatabase,
  type Database,
} from "../../src/lib/server/db/database";
import { createDatabasePool } from "../../src/lib/server/db/pool";
import {
  businesses,
  projects,
  tasks,
  users,
  workspaceMembers,
  workspaces,
  type WorkspaceRole,
} from "../../src/lib/server/db/schema";
import {
  createWorkspaceToolModel,
  createWorkspaceToolUse,
  listWorkspaceToolResponses,
  listWorkspaceTools,
  submitWorkspaceToolResponse,
  ToolInputError,
  ToolVersionConflictError,
  updateWorkspaceToolModel,
} from "../../src/lib/server/tools/service";
import type { IntensityToolConfig } from "../../src/lib/tools/types";

const pool = createDatabasePool(parseServerEnvironment(process.env));
const database = createDatabase(pool);

class RollbackFixture extends Error {}

async function withRollback(
  run: (database: Database) => Promise<void>,
): Promise<void> {
  try {
    await database.transaction(async (transaction) => {
      await run(transaction as unknown as Database);
      throw new RollbackFixture();
    });
  } catch (cause) {
    if (cause instanceof RollbackFixture) return;
    throw cause;
  }
}

async function insertUser(database: Database, label: string) {
  const suffix = randomUUID().replaceAll("-", "").slice(0, 16);
  const [user] = await database
    .insert(users)
    .values({
      name: label,
      username: `${label.toLowerCase()}_${suffix}`,
      email: `${label.toLowerCase()}-${suffix}@example.test`,
    })
    .returning();
  if (!user) throw new Error("Usuário não criado.");
  return user;
}

async function insertWorkspace(
  database: Database,
  ownerId: string,
  name: string,
) {
  const [workspace] = await database
    .insert(workspaces)
    .values({ name, kind: "shared", ownerUserId: ownerId })
    .returning();
  if (!workspace) throw new Error("Workspace não criado.");
  return workspace;
}

async function insertTaskContext(
  database: Database,
  workspaceId: string,
  ownerUserId: string,
) {
  const [business] = await database
    .insert(businesses)
    .values({
      workspaceId,
      ownerUserId,
      name: "Cliente Acme",
      categoryKey: "cliente",
      stageKey: "ativo",
    })
    .returning();
  if (!business) throw new Error("Negócio não criado.");
  const [project] = await database
    .insert(projects)
    .values({
      workspaceId,
      businessId: business.id,
      name: "Identidade Acme",
      statusKey: "execucao",
      startDate: "2026-08-01",
    })
    .returning();
  if (!project) throw new Error("Projeto não criado.");
  const [task] = await database
    .insert(tasks)
    .values({
      workspaceId,
      projectId: project.id,
      businessId: business.id,
      name: "Definir direção visual",
      statusKey: "producao",
    })
    .returning();
  if (!task) throw new Error("Tarefa não criada.");
  return { business, project, task };
}

function context(
  user: typeof users.$inferSelect,
  workspace: typeof workspaces.$inferSelect,
  role: WorkspaceRole,
): RequestAuthorizationContext {
  const now = new Date();
  return {
    user: {
      id: user.id,
      username: user.username,
      name: user.name,
      email: user.email,
      avatarUrl: user.avatarUrl,
    },
    session: {
      id: randomUUID(),
      userId: user.id,
      activeWorkspaceId: workspace.id,
      remembered: false,
      createdAt: now,
      lastSeenAt: now,
      expiresAt: new Date(now.getTime() + 60_000),
    },
    activeWorkspace: {
      workspace: {
        id: workspace.id,
        name: workspace.name,
        description: workspace.description,
        icon: workspace.icon,
        color: workspace.color,
        kind: workspace.kind,
        ownerUserId: workspace.ownerUserId,
      },
      membership: { userId: user.id, role, joinedAt: now },
    },
  };
}

describe("Ferramentas: Modelos, Usos e Respostas", () => {
  afterAll(() => pool.end());

  it("localiza anexos visuais aninhados com a mesma expressão da autorização", async () => {
    const fileId = randomUUID();
    const result = await database.execute<{ allowed: boolean }>(sql`
      select jsonb_path_exists(
        ${JSON.stringify({ items: [{ assets: [{ fileId }] }] })}::jsonb,
        '$.**.fileId ? (@ == $fileId)',
        jsonb_build_object('fileId', ${fileId}::text)
      ) as allowed
    `);
    expect(result.rows[0]?.allowed).toBe(true);
  });

  it("preserva snapshot, deriva contexto da tarefa e aceita vários participantes", async () => {
    await withRollback(async (database) => {
      const owner = await insertUser(database, "ToolOwner");
      const participant = await insertUser(database, "ToolParticipant");
      const workspace = await insertWorkspace(
        database,
        owner.id,
        "Ferramentas",
      );
      await database.insert(workspaceMembers).values({
        workspaceId: workspace.id,
        userId: participant.id,
        role: "member",
      });
      const { task } = await insertTaskContext(
        database,
        workspace.id,
        owner.id,
      );
      const ownerContext = context(owner, workspace, "owner");
      const participantContext = context(participant, workspace, "member");
      const scaleId = randomUUID();
      const originalConfig: IntensityToolConfig = {
        kind: "intensity",
        instructions: "Defina a personalidade da marca.",
        scales: [{ id: scaleId, leftLabel: "Clássico", rightLabel: "Moderno" }],
      };

      const model = await createWorkspaceToolModel(database, ownerContext, {
        toolKey: "intensity",
        name: "Personalidade da marca",
        description: "Escalas para direcionamento",
        config: originalConfig,
      });
      const use = await createWorkspaceToolUse(database, ownerContext, {
        modelId: model.id,
        name: "Personalidade desejada — Acme",
        taskId: task.id,
        content: { kind: "intensity" },
        status: "open",
      });

      expect(use.context).toMatchObject({
        task: { id: task.id, name: "Definir direção visual" },
        project: { name: "Identidade Acme" },
        business: { name: "Cliente Acme" },
      });

      const changedConfig: IntensityToolConfig = {
        ...originalConfig,
        scales: [
          { id: scaleId, leftLabel: "Tradicional", rightLabel: "Inovador" },
        ],
      };
      const changedModel = await updateWorkspaceToolModel(
        database,
        ownerContext,
        model.id,
        {
          name: model.name,
          description: model.description,
          config: changedConfig,
          version: model.version,
        },
      );
      await expect(
        updateWorkspaceToolModel(database, ownerContext, model.id, {
          name: model.name,
          description: model.description,
          config: changedConfig,
          version: model.version,
        }),
      ).rejects.toBeInstanceOf(ToolVersionConflictError);

      await submitWorkspaceToolResponse(database, ownerContext, use.id, {
        kind: "intensity",
        values: [{ scaleId, value: 50 }],
      });
      await submitWorkspaceToolResponse(database, participantContext, use.id, {
        kind: "intensity",
        values: [{ scaleId, value: 75 }],
      });
      await expect(
        submitWorkspaceToolResponse(database, participantContext, use.id, {
          kind: "intensity",
          values: [{ scaleId, value: 52 }],
        }),
      ).rejects.toBeInstanceOf(ToolInputError);

      const responses = await listWorkspaceToolResponses(
        database,
        ownerContext,
        use.id,
      );
      expect(responses).toHaveLength(2);
      expect(responses.map(({ respondent }) => respondent.id)).toEqual(
        expect.arrayContaining([owner.id, participant.id]),
      );

      const snapshot = await listWorkspaceTools(database, ownerContext);
      expect(snapshot.models[0]).toMatchObject({
        id: changedModel.id,
        usageCount: 1,
        config: changedConfig,
      });
      expect(snapshot.uses[0]).toMatchObject({
        id: use.id,
        responseCount: 2,
        configSnapshot: originalConfig,
      });
    });
  });

  it("impede vínculo de Uso com tarefa de outro workspace", async () => {
    await withRollback(async (database) => {
      const ownerA = await insertUser(database, "ToolTenantA");
      const ownerB = await insertUser(database, "ToolTenantB");
      const workspaceA = await insertWorkspace(
        database,
        ownerA.id,
        "Workspace A",
      );
      const workspaceB = await insertWorkspace(
        database,
        ownerB.id,
        "Workspace B",
      );
      const { task: taskB } = await insertTaskContext(
        database,
        workspaceB.id,
        ownerB.id,
      );
      const contextA = context(ownerA, workspaceA, "owner");
      const scaleId = randomUUID();
      const model = await createWorkspaceToolModel(database, contextA, {
        toolKey: "intensity",
        name: "Direção visual",
        description: "",
        config: {
          kind: "intensity",
          instructions: "",
          scales: [
            { id: scaleId, leftLabel: "Discreto", rightLabel: "Ousado" },
          ],
        },
      });
      await expect(
        createWorkspaceToolUse(database, contextA, {
          modelId: model.id,
          name: "Uso inválido",
          taskId: taskB.id,
          content: { kind: "intensity" },
          status: "open",
        }),
      ).rejects.toBeInstanceOf(ToolInputError);
    });
  });
});
