import { and, asc, eq, sql } from "drizzle-orm";
import type { Database } from "../db/database";
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
  const [created] = await database
    .insert(personalTasks)
    .values({
      userId,
      title: title.trim(),
      sortOrder: sql`coalesce((select max(${personalTasks.sortOrder}) + 1 from ${personalTasks} where ${personalTasks.userId} = ${userId}), 0)`,
    })
    .returning();
  if (!created) throw new Error("A tarefa pessoal não pôde ser criada.");
  return view(created);
}

export async function updatePersonalTask(
  database: Database,
  userId: string,
  taskId: string,
  completed: boolean,
): Promise<PersonalTaskView | null> {
  const [updated] = await database
    .update(personalTasks)
    .set({ completed, updatedAt: new Date() })
    .where(and(eq(personalTasks.id, taskId), eq(personalTasks.userId, userId)))
    .returning();
  return updated ? view(updated) : null;
}

export async function deletePersonalTask(
  database: Database,
  userId: string,
  taskId: string,
): Promise<boolean> {
  const removed = await database
    .delete(personalTasks)
    .where(and(eq(personalTasks.id, taskId), eq(personalTasks.userId, userId)))
    .returning({ id: personalTasks.id });
  return removed.length === 1;
}
