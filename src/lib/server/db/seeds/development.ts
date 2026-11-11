import { and, eq } from "drizzle-orm";
import { avatarProfileUrl } from "../../../avatar/avatar-options";
import type { Database } from "../database";
import { users, workspaceMembers, workspaces } from "../schema";

export const DEVELOPMENT_USER_ID = "00000000-0000-4000-8000-000000000001";
export const DEVELOPMENT_WORKSPACE_ID = "00000000-0000-4000-8000-000000000002";

export async function seedDevelopmentDatabase(
  database: Database,
): Promise<void> {
  const timestamp = new Date();

  await database.transaction(async (transaction) => {
    await transaction
      .insert(users)
      .values({
        id: DEVELOPMENT_USER_ID,
        name: "Thiago",
        username: "thiago",
        email: "thiago@demanda.local",
        avatarUrl: avatarProfileUrl("avatar-08", "#2E56FF"),
        updatedAt: timestamp,
      })
      .onDuplicateKeyUpdate({
        set: {
          name: "Thiago",
          username: "thiago",
          email: "thiago@demanda.local",
          avatarUrl: avatarProfileUrl("avatar-08", "#2E56FF"),
          updatedAt: timestamp,
          deletedAt: null,
        },
      });

    await transaction
      .insert(workspaces)
      .values({
        id: DEVELOPMENT_WORKSPACE_ID,
        name: "Pessoal",
        description: "Seus projetos e tarefas particulares.",
        icon: "house",
        color: "blue",
        kind: "personal",
        ownerUserId: DEVELOPMENT_USER_ID,
        updatedAt: timestamp,
      })
      .onDuplicateKeyUpdate({
        set: {
          name: "Pessoal",
          description: "Seus projetos e tarefas particulares.",
          icon: "house",
          color: "blue",
          kind: "personal",
          ownerUserId: DEVELOPMENT_USER_ID,
          updatedAt: timestamp,
          archivedAt: null,
        },
      });

    const [ownerMembership] = await transaction
      .select({ role: workspaceMembers.role })
      .from(workspaceMembers)
      .where(
        and(
          eq(workspaceMembers.workspaceId, DEVELOPMENT_WORKSPACE_ID),
          eq(workspaceMembers.userId, DEVELOPMENT_USER_ID),
        ),
      )
      .limit(1);

    if (ownerMembership?.role !== "owner") {
      throw new Error(
        "O seed não produziu o vínculo de proprietário esperado.",
      );
    }
  });
}
