import { and, asc, eq, max } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { affectedRows, type Database } from "../db/database";
import { personalTasks } from "../db/schema";

export type PersonalTaskView = {
  id: string;
  title: string;
  done: boolean;
};

function view(row: typeof personalTasks.$inferSelect): PersonalTaskView {
  return { id: row.id, title: row.title, done: row.completed };
}

export async function listPersonalTasks(
  database: Database,
  userId: string,
): Promise<PersonalTaskView[]> {
  return (
    await database
      .select()
      .from(personalTasks)
      .where(eq(personalTasks.userId, userId))
      .orderBy(asc(personalTasks.sortOrder), asc(personalTasks.createdAt))
  ).map(view);
}

export async function createPersonalTask(
  database: Database,
  userId: string,
  title: string,
): Promise<PersonalTaskView> {
  const id = randomUUID();
  const [lastTask] = await database
    .select({ sortOrder: max(personalTasks.sortOrder) })
    .from(personalTasks)
    .where(eq(personalTasks.userId, userId));
  await database
    .insert(personalTasks)
    .values({
      id,
      userId,
      title: title.trim(),
      sortOrder: (lastTask?.sortOrder ?? -1) + 1,
    });
  const [created] = await database
    .select()
    .from(personalTasks)
    .where(and(eq(personalTasks.id, id), eq(personalTasks.userId, userId)))
    .limit(1);
  if (!created) throw new Error("A tarefa pessoal não pôde ser criada.");
  return view(created);
}

export async function updatePersonalTask(
  database: Database,
  userId: string,
  taskId: string,
  completed: boolean,
): Promise<PersonalTaskView | null> {
  const result = await database
    .update(personalTasks)
    .set({ completed, updatedAt: new Date() })
    .where(and(eq(personalTasks.id, taskId), eq(personalTasks.userId, userId)));
  if (affectedRows(result) !== 1) return null;
  const [updated] = await database
    .select()
    .from(personalTasks)
    .where(and(eq(personalTasks.id, taskId), eq(personalTasks.userId, userId)))
    .limit(1);
  return updated ? view(updated) : null;
}

export async function deletePersonalTask(
  database: Database,
  userId: string,
  taskId: string,
): Promise<boolean> {
  const result = await database
    .delete(personalTasks)
    .where(and(eq(personalTasks.id, taskId), eq(personalTasks.userId, userId)));
  return affectedRows(result) === 1;
}
