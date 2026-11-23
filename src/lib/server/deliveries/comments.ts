import { randomUUID } from "node:crypto";
import { and, asc, eq } from "drizzle-orm";
import type { RequestAuthorizationContext } from "$lib/server/authorization/workspace-context";
import { requireWorkspacePermission } from "$lib/server/authorization/workspace-context";
import type { Database } from "$lib/server/db/database";
import { deliveryComments, users } from "$lib/server/db/schema";
import { getWorkspaceDelivery } from "./service";

export type DeliveryComment = {
  id: string;
  body: string;
  authorName: string;
  createdAt: string;
};

async function commentsForDelivery(
  database: Database,
  workspaceId: string,
  deliveryId: string,
): Promise<DeliveryComment[]> {
  const rows = await database
    .select({
      id: deliveryComments.id,
      body: deliveryComments.body,
      authorName: users.name,
      createdAt: deliveryComments.createdAt,
    })
    .from(deliveryComments)
    .innerJoin(users, eq(users.id, deliveryComments.authorUserId))
    .where(
      and(
        eq(deliveryComments.workspaceId, workspaceId),
        eq(deliveryComments.deliveryId, deliveryId),
      ),
    )
    .orderBy(asc(deliveryComments.createdAt), asc(deliveryComments.id));
  return rows.map((row) => ({
    ...row,
    createdAt: row.createdAt.toISOString(),
  }));
}

export async function listWorkspaceDeliveryComments(
  database: Database,
  context: RequestAuthorizationContext,
  deliveryId: string,
): Promise<DeliveryComment[]> {
  const delivery = await getWorkspaceDelivery(database, context, deliveryId);
  return commentsForDelivery(database, delivery.workspaceId, delivery.id);
}

export async function createWorkspaceDeliveryComment(
  database: Database,
  context: RequestAuthorizationContext,
  deliveryId: string,
  body: string,
): Promise<DeliveryComment> {
  const delivery = await getWorkspaceDelivery(database, context, deliveryId);
  await requireWorkspacePermission(
    database,
    context.user.id,
    delivery.workspaceId,
    "workspace:write",
  );
  const id = randomUUID();
  await database.insert(deliveryComments).values({
    id,
    workspaceId: delivery.workspaceId,
    deliveryId: delivery.id,
    authorUserId: context.user.id,
    body,
  });
  const [comment] = await commentsForDelivery(
    database,
    delivery.workspaceId,
    delivery.id,
  ).then((comments) => comments.filter((item) => item.id === id));
  if (!comment) throw new Error("Não foi possível criar o comentário.");
  return comment;
}
