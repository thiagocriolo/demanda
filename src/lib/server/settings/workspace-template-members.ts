import { eq } from "drizzle-orm";
import { users, workspaceMembers } from "../db/schema";
import type { SettingsDatabase } from "./database";
import { SettingsRelationsInvalidError } from "./errors";

export interface WorkspaceMemberIndex {
  ids: Set<string>;
  byName: Map<string, string[]>;
}

export async function loadWorkspaceMemberIndex(
  database: SettingsDatabase,
  workspaceId: string,
): Promise<WorkspaceMemberIndex> {
  const rows = await database
    .select({ id: users.id, name: users.name })
    .from(workspaceMembers)
    .innerJoin(users, eq(users.id, workspaceMembers.userId))
    .where(eq(workspaceMembers.workspaceId, workspaceId));
  const byName = new Map<string, string[]>();
  for (const row of rows) {
    const key = row.name.trim().toLocaleLowerCase("pt-BR");
    byName.set(key, [...(byName.get(key) ?? []), row.id]);
  }
  return { ids: new Set(rows.map(({ id }) => id)), byName };
}

export function resolveResponsibleIds(
  explicit: string[] | undefined,
  legacy: string,
  members: WorkspaceMemberIndex,
  fallback: string[],
): string[] {
  const requested = explicit?.length
    ? explicit
    : legacy.split(/[,;]+/u).flatMap((name) => {
        const matches = members.byName.get(
          name.trim().toLocaleLowerCase("pt-BR"),
        );
        return matches?.length === 1 ? matches : [];
      });
  const result = requested.length ? requested : fallback;
  if (result.some((id) => !members.ids.has(id))) {
    throw new SettingsRelationsInvalidError(
      "Um responsável não pertence ao workspace.",
    );
  }
  return [...new Set(result)];
}
