import { randomUUID } from "node:crypto";
import { and, asc, eq } from "drizzle-orm";
import type { RequestAuthorizationContext } from "$lib/server/authorization/workspace-context";
import { requireWorkspacePermission } from "$lib/server/authorization/workspace-context";
import type { Database } from "$lib/server/db/database";
import { taskComments, users } from "$lib/server/db/schema";
import { getWorkspaceTask } from "./service";

export type TaskComment = {
  id: string;
  body: string;
  authorName: string;
  createdAt: string;
};

async function commentsForTask(
  database: Database,
  workspaceId: string,
  taskId: string,
): Promise<TaskComment[]> {
  const rows = await database
    .select({
      id: taskComments.id,
      body: taskComments.body,
      authorName: users.name,
      createdAt: taskComments.createdAt,
    })
    .from(taskComments)
    .innerJoin(users, eq(users.id, taskComments.authorUserId))
    .where(
      and(
        eq(taskComments.workspaceId, workspaceId),
        eq(taskComments.taskId, taskId),
      ),
    )
    .orderBy(asc(taskComments.createdAt), asc(taskComments.id));
  return rows.map((row) => ({
    ...row,
    createdAt: row.createdAt.toISOString(),
  }));
}

export async function listWorkspaceTaskComments(
  database: Database,
  context: RequestAuthorizationContext,
  taskId: string,
): Promise<TaskComment[]> {
  const task = await getWorkspaceTask(database, context, taskId);
  return commentsForTask(database, task.workspaceId, task.id);
}

export async function createWorkspaceTaskComment(
  database: Database,
  context: RequestAuthorizationContext,
  taskId: string,
  body: string,
): Promise<TaskComment> {
  const task = await getWorkspaceTask(database, context, taskId);
  await requireWorkspacePermission(
    database,
    context.user.id,
    task.workspaceId,
    "workspace:write",
  );
  const id = randomUUID();
  await database.insert(taskComments).values({
    id,
    workspaceId: task.workspaceId,
    taskId: task.id,
    authorUserId: context.user.id,
    body,
  });
  const [comment] = await commentsForTask(
    database,
    task.workspaceId,
    task.id,
  ).then((comments) => comments.filter((item) => item.id === id));
  if (!comment) throw new Error("Não foi possível criar o comentário.");
  return comment;
}
