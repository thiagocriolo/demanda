import { and, asc, eq, max } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { affectedRows, type Database } from "../db/database";
import { personalDeliveries } from "../db/schema";

export type PersonalDeliveryView = {
  id: string;
  title: string;
  done: boolean;
};

function view(row: typeof personalDeliveries.$inferSelect): PersonalDeliveryView {
  return { id: row.id, title: row.title, done: row.completed };
}

export async function listPersonalDeliveries(
  database: Database,
  userId: string,
): Promise<PersonalDeliveryView[]> {
  return (
    await database
      .select()
      .from(personalDeliveries)
      .where(eq(personalDeliveries.userId, userId))
      .orderBy(asc(personalDeliveries.sortOrder), asc(personalDeliveries.createdAt))
  ).map(view);
}

export async function createPersonalDelivery(
  database: Database,
  userId: string,
  title: string,
): Promise<PersonalDeliveryView> {
  const id = randomUUID();
  const [lastDelivery] = await database
    .select({ sortOrder: max(personalDeliveries.sortOrder) })
    .from(personalDeliveries)
    .where(eq(personalDeliveries.userId, userId));
  await database
    .insert(personalDeliveries)
    .values({
      id,
      userId,
      title: title.trim(),
      sortOrder: (lastDelivery?.sortOrder ?? -1) + 1,
    });
  const [created] = await database
    .select()
    .from(personalDeliveries)
    .where(and(eq(personalDeliveries.id, id), eq(personalDeliveries.userId, userId)))
    .limit(1);
  if (!created) throw new Error("A tarefa pessoal não pôde ser criada.");
  return view(created);
}

export async function updatePersonalDelivery(
  database: Database,
  userId: string,
  deliveryId: string,
  completed: boolean,
): Promise<PersonalDeliveryView | null> {
  const result = await database
    .update(personalDeliveries)
    .set({ completed, updatedAt: new Date() })
    .where(and(eq(personalDeliveries.id, deliveryId), eq(personalDeliveries.userId, userId)));
  if (affectedRows(result) !== 1) return null;
  const [updated] = await database
    .select()
    .from(personalDeliveries)
    .where(and(eq(personalDeliveries.id, deliveryId), eq(personalDeliveries.userId, userId)))
    .limit(1);
  return updated ? view(updated) : null;
}

export async function deletePersonalDelivery(
  database: Database,
  userId: string,
  deliveryId: string,
): Promise<boolean> {
  const result = await database
    .delete(personalDeliveries)
    .where(and(eq(personalDeliveries.id, deliveryId), eq(personalDeliveries.userId, userId)));
  return affectedRows(result) === 1;
}
