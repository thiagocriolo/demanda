import { and, asc, eq, inArray, sql, type SQL } from "drizzle-orm";
import type { ProjectResponsible } from "../../projects/types";
import {
  requireActiveWorkspacePermission,
  type RequestAuthorizationContext,
} from "../authorization/workspace-context";
import { affectedRows, type Database } from "../db/database";
import {
  projectTags,
  serviceTags,
  tags,
  users,
  workspaceMembers,
} from "../db/schema";
import { touchWorkspaceConfiguration } from "../settings/version";
import { normalizeProjectTagLabel, projectTagKey } from "./validation";

export type ProjectDatabase = Pick<
  Database,
  "select" | "insert" | "update" | "delete"
>;

export function workspaceIdFromContext(
  context: RequestAuthorizationContext,
): string {
  return requireActiveWorkspacePermission(context, "workspace:read").workspace
    .id;
}

export function iso(value: Date | null): string | null {
  return value?.toISOString() ?? null;
}

export function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (character) => `\\${character}`);
}

export function databaseConstraint(error: unknown): string | undefined {
  const visited = new Set<unknown>();
  let current = error;
  while (current && typeof current === "object" && !visited.has(current)) {
    visited.add(current);
    if ("constraint" in current && typeof current.constraint === "string") {
      return current.constraint;
    }
    if ("sqlMessage" in current && typeof current.sqlMessage === "string") {
      const match =
        /CONSTRAINT `([^`]+)`/u.exec(current.sqlMessage) ??
        /for key ['`]([^'`]+)['`]/u.exec(current.sqlMessage);
      if (match?.[1]) return match[1].split(".").at(-1);
    }
    current = "cause" in current ? current.cause : undefined;
  }
  return undefined;
}

export async function memberDetails(
  database: ProjectDatabase,
  workspaceId: string,
  userIds?: string[],
): Promise<ProjectResponsible[]> {
  if (userIds && !userIds.length) return [];
  const conditions: SQL[] = [eq(workspaceMembers.workspaceId, workspaceId)];
  if (userIds) conditions.push(inArray(workspaceMembers.userId, userIds));
  const rows = await database
    .select({
      userId: workspaceMembers.userId,
      name: users.name,
      email: users.email,
      avatarUrl: users.avatarUrl,
      role: workspaceMembers.role,
    })
    .from(workspaceMembers)
    .innerJoin(users, eq(users.id, workspaceMembers.userId))
    .where(and(...conditions))
    .orderBy(asc(sql`lower(${users.name})`), asc(users.id));
  return rows;
}

export async function validateAndLockMembers(
  database: ProjectDatabase,
  workspaceId: string,
  userIds: string[],
  errorFactory: () => Error,
): Promise<void> {
  if (
    userIds.length < 1 ||
    userIds.length > 20 ||
    new Set(userIds).size !== userIds.length
  ) {
    throw errorFactory();
  }
  const rows = await database
    .select({ userId: workspaceMembers.userId })
    .from(workspaceMembers)
    .where(
      and(
        eq(workspaceMembers.workspaceId, workspaceId),
        inArray(workspaceMembers.userId, [...userIds].sort()),
      ),
    )
    .orderBy(asc(workspaceMembers.userId))
    .for("update");
  if (rows.length !== userIds.length) throw errorFactory();
}

export async function existingTagIds(
  database: ProjectDatabase,
  table: typeof serviceTags | typeof projectTags,
  workspaceId: string,
  parentId: string,
): Promise<Set<string>> {
  const parentColumn =
    table === serviceTags ? serviceTags.serviceId : projectTags.projectId;
  const rows = await database
    .select({ tagId: table.tagId })
    .from(table)
    .where(and(eq(table.workspaceId, workspaceId), eq(parentColumn, parentId)));
  return new Set(rows.map(({ tagId }) => tagId));
}

export async function resolveAndLockTags(
  database: ProjectDatabase,
  workspaceId: string,
  labels: string[],
  previouslyLinked = new Set<string>(),
  errorFactory: () => Error,
): Promise<(typeof tags.$inferSelect)[]> {
  const normalized = labels.map((label) => ({
    key: projectTagKey(label),
    label: normalizeProjectTagLabel(label),
  }));
  if (
    normalized.length > 30 ||
    normalized.some(({ key }) => !/^[a-z0-9][a-z0-9_-]{0,63}$/u.test(key)) ||
    new Set(normalized.map(({ key }) => key)).size !== normalized.length
  ) {
    throw errorFactory();
  }
  if (!normalized.length) return [];
  const createdTags = await database
    .insert(tags)
    .values(normalized.map(({ key, label }) => ({ workspaceId, key, label })))
    .onDuplicateKeyUpdate({ set: { key: sql`${tags.key}` } });
  if (affectedRows(createdTags)) {
    await touchWorkspaceConfiguration(database, workspaceId);
  }
  const rows = await database
    .select()
    .from(tags)
    .where(
      and(
        eq(tags.workspaceId, workspaceId),
        inArray(tags.key, normalized.map(({ key }) => key).sort()),
      ),
    )
    .orderBy(asc(tags.key))
    .for("update");
  if (
    rows.length !== normalized.length ||
    rows.some((row) => row.archivedAt && !previouslyLinked.has(row.id))
  ) {
    throw errorFactory();
  }
  const byKey = new Map(rows.map((row) => [row.key, row]));
  return normalized.map(({ key }) => byKey.get(key)!).filter(Boolean);
}
