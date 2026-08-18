import { and, eq, or, sql } from "drizzle-orm";
import { z } from "zod";
import type { Database } from "../db/database";
import { publicProfileMediaUrl } from "../social/profile-media";
import {
  connectionRequests,
  userConnections,
  users,
  workspaceMembers,
} from "../db/schema";

export class ConnectionOperationError extends Error {
  constructor(
    message: string,
    readonly status = 409,
  ) {
    super(message);
    this.name = "ConnectionOperationError";
  }
}

export type SocialUserSummary = {
  id: string;
  name: string;
  username: string;
  avatarUrl: string | null;
  coverUrl?: string | null;
};

export type ConnectionSummary = SocialUserSummary & {
  connectedAt: string;
  source: "instant" | "request";
};

export type ConnectionRequestSummary = {
  id: string;
  direction: "incoming" | "outgoing";
  createdAt: string;
  user: SocialUserSummary;
};

export type ConnectionDashboard = {
  connections: ConnectionSummary[];
  requests: ConnectionRequestSummary[];
};

function toIso(value: Date | string): string {
  return value instanceof Date
    ? value.toISOString()
    : new Date(value).toISOString();
}

export type ConnectionUserSearchResult = {
  kind: "user";
  id: string;
  username: string;
  name: string;
  email: string;
  avatarUrl: string | null;
  exact: boolean;
};

export type ConnectionInviteSearchResult = {
  kind: "invite";
  id: string;
  email: string;
  exact: true;
};

export type ConnectionSearchResult =
  ConnectionUserSearchResult | ConnectionInviteSearchResult;

type SearchRow = {
  id: string;
  username: string;
  name: string;
  email: string;
  avatar_url: string | null;
  relevance: number;
};

const emailSchema = z.string().trim().email().max(320);

function canonicalPair(firstUserId: string, secondUserId: string) {
  return firstUserId < secondUserId
    ? { userAId: firstUserId, userBId: secondUserId }
    : { userAId: secondUserId, userBId: firstUserId };
}

export async function listConnectionDashboard(
  database: Database,
  actorUserId: string,
): Promise<ConnectionDashboard> {
  const connections = await database.execute<{
    id: string;
    name: string;
    username: string;
    avatar_url: string | null;
    cover_url: string | null;
    connected_at: Date | string;
    source: "instant" | "request";
  }>(sql`
    select
      peer.id,
      peer.name,
      peer.username,
      peer.avatar_url,
      nullif(preference.settings #>> '{profile,cover}', '') as cover_url,
      connection.created_at as connected_at,
      case when connection.workspace_connected_at is not null
        then 'instant' else 'request' end as source
    from app.user_connections connection
    inner join app.users peer on peer.id = case
      when connection.user_a_id = ${actorUserId}::uuid then connection.user_b_id
      else connection.user_a_id end
    left join app.user_preferences preference on preference.user_id = peer.id
    where connection.user_a_id = ${actorUserId}::uuid
       or connection.user_b_id = ${actorUserId}::uuid
    order by peer.name asc
  `);

  const requests = await database.execute<{
    id: string;
    requested_by_user_id: string;
    created_at: Date | string;
    peer_id: string;
    peer_name: string;
    peer_username: string;
    peer_avatar_url: string | null;
    peer_cover_url: string | null;
  }>(sql`
    select
      request.id,
      request.requested_by_user_id,
      request.created_at,
      peer.id as peer_id,
      peer.name as peer_name,
      peer.username as peer_username,
      peer.avatar_url as peer_avatar_url,
      nullif(preference.settings #>> '{profile,cover}', '') as peer_cover_url
    from app.connection_requests request
    inner join app.users peer on peer.id = case
      when request.user_a_id = ${actorUserId}::uuid then request.user_b_id
      else request.user_a_id end
    left join app.user_preferences preference on preference.user_id = peer.id
    where request.status = 'pending'
      and (request.user_a_id = ${actorUserId}::uuid
        or request.user_b_id = ${actorUserId}::uuid)
    order by request.created_at desc
  `);

  return {
    connections: connections.rows.map((row) => ({
      id: row.id,
      name: row.name,
      username: row.username,
      avatarUrl: row.avatar_url,
      coverUrl: publicProfileMediaUrl(row.cover_url),
      connectedAt: toIso(row.connected_at),
      source: row.source,
    })),
    requests: requests.rows.map((row) => ({
      id: row.id,
      direction:
        row.requested_by_user_id === actorUserId ? "outgoing" : "incoming",
      createdAt: toIso(row.created_at),
      user: {
        id: row.peer_id,
        name: row.peer_name,
        username: row.peer_username,
        avatarUrl: row.peer_avatar_url,
        coverUrl: publicProfileMediaUrl(row.peer_cover_url),
      },
    })),
  };
}

export async function requestConnection(
  database: Database,
  actorUserId: string,
  targetUserId: string,
): Promise<ConnectionRequestSummary> {
  if (actorUserId === targetUserId) {
    throw new ConnectionOperationError(
      "Você não pode se conectar consigo mesmo.",
      400,
    );
  }
  const pair = canonicalPair(actorUserId, targetUserId);
  return database.transaction(async (transaction) => {
    const [target] = await transaction
      .select({
        id: users.id,
        name: users.name,
        username: users.username,
        avatarUrl: users.avatarUrl,
      })
      .from(users)
      .where(and(eq(users.id, targetUserId), sql`${users.deletedAt} is null`))
      .limit(1);
    if (!target)
      throw new ConnectionOperationError("Usuário não encontrado.", 404);

    const [connected] = await transaction
      .select({ userAId: userConnections.userAId })
      .from(userConnections)
      .where(
        and(
          eq(userConnections.userAId, pair.userAId),
          eq(userConnections.userBId, pair.userBId),
        ),
      )
      .limit(1);
    if (connected)
      throw new ConnectionOperationError("Vocês já estão conectados.");

    const [pending] = await transaction
      .select()
      .from(connectionRequests)
      .where(
        and(
          eq(connectionRequests.userAId, pair.userAId),
          eq(connectionRequests.userBId, pair.userBId),
          eq(connectionRequests.status, "pending"),
        ),
      )
      .limit(1);
    if (pending) {
      const direction =
        pending.requestedByUserId === actorUserId ? "outgoing" : "incoming";
      throw new ConnectionOperationError(
        direction === "outgoing"
          ? "A solicitação já foi enviada."
          : "Essa pessoa já enviou uma solicitação para você.",
      );
    }

    const now = new Date();
    const [created] = await transaction
      .insert(connectionRequests)
      .values({
        ...pair,
        requestedByUserId: actorUserId,
        status: "pending",
        respondedAt: null,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [connectionRequests.userAId, connectionRequests.userBId],
        set: {
          requestedByUserId: actorUserId,
          status: "pending",
          respondedAt: null,
          createdAt: now,
          updatedAt: now,
        },
      })
      .returning();
    if (!created)
      throw new ConnectionOperationError(
        "Não foi possível enviar a solicitação.",
      );
    return {
      id: created.id,
      direction: "outgoing",
      createdAt: created.createdAt.toISOString(),
      user: target,
    };
  });
}

export async function respondToConnectionRequest(
  database: Database,
  actorUserId: string,
  requestId: string,
  action: "accept" | "decline" | "cancel",
): Promise<void> {
  await database.transaction(async (transaction) => {
    const [request] = await transaction
      .select()
      .from(connectionRequests)
      .where(
        and(
          eq(connectionRequests.id, requestId),
          eq(connectionRequests.status, "pending"),
          or(
            eq(connectionRequests.userAId, actorUserId),
            eq(connectionRequests.userBId, actorUserId),
          ),
        ),
      )
      .limit(1);
    if (!request)
      throw new ConnectionOperationError("Solicitação não encontrada.", 404);
    const isSender = request.requestedByUserId === actorUserId;
    if ((action === "cancel") !== isSender) {
      throw new ConnectionOperationError(
        isSender
          ? "Você pode cancelar, mas não responder à própria solicitação."
          : "Somente quem enviou pode cancelar a solicitação.",
        403,
      );
    }
    const now = new Date();
    if (action === "accept") {
      await transaction
        .insert(userConnections)
        .values({
          userAId: request.userAId,
          userBId: request.userBId,
          manualConnectedAt: now,
        })
        .onConflictDoUpdate({
          target: [userConnections.userAId, userConnections.userBId],
          set: { manualConnectedAt: now, updatedAt: now },
        });
    }
    await transaction
      .update(connectionRequests)
      .set({
        status:
          action === "accept"
            ? "accepted"
            : action === "decline"
              ? "declined"
              : "cancelled",
        respondedAt: now,
        updatedAt: now,
      })
      .where(eq(connectionRequests.id, request.id));
  });
}

export async function disconnectUsers(
  database: Database,
  actorUserId: string,
  targetUserId: string,
): Promise<void> {
  const pair = canonicalPair(actorUserId, targetUserId);
  const removed = await database
    .delete(userConnections)
    .where(
      and(
        eq(userConnections.userAId, pair.userAId),
        eq(userConnections.userBId, pair.userBId),
      ),
    )
    .returning({ userAId: userConnections.userAId });
  if (removed.length === 0) {
    throw new ConnectionOperationError("Conexão não encontrada.", 404);
  }
}

/** Registra como conexões todos os usuários que compartilham o workspace. */
export async function connectWorkspaceMembers(
  database: Database,
  workspaceId: string,
  userId: string,
): Promise<void> {
  const existingMembers = await database
    .select({ userId: workspaceMembers.userId })
    .from(workspaceMembers)
    .where(sql`${workspaceMembers.workspaceId} = ${workspaceId}`);
  const connectedAt = new Date();
  const pairs = existingMembers
    .filter((member) => member.userId !== userId)
    .map((member) => ({
      ...canonicalPair(userId, member.userId),
      workspaceConnectedAt: connectedAt,
    }));
  if (pairs.length === 0) return;

  await database
    .insert(userConnections)
    .values(pairs)
    .onConflictDoUpdate({
      target: [userConnections.userAId, userConnections.userBId],
      set: {
        workspaceConnectedAt: sql`coalesce(${userConnections.workspaceConnectedAt}, excluded.workspace_connected_at)`,
        updatedAt: connectedAt,
      },
    });
}

/** Busca contas globalmente por nome de usuário ou e-mail. */
export async function searchConnectionUsers(
  database: Database,
  actorUserId: string,
  rawQuery: string,
  limit = 3,
): Promise<ConnectionSearchResult[]> {
  const query = rawQuery.trim().toLocaleLowerCase("pt-BR");
  const usernameQuery = query.startsWith("@") ? query.slice(1) : query;
  if (!usernameQuery || limit <= 0) return [];

  const searchesEmail = !query.startsWith("@") && query.includes("@");
  const exactCondition = searchesEmail
    ? sql`lower(candidate.email) = ${query}`
    : sql`lower(candidate.username) = ${usernameQuery}`;
  const partialTerm = `%${searchesEmail ? query : usernameQuery}%`;
  const partialCondition = searchesEmail
    ? sql`lower(candidate.email) like ${partialTerm}`
    : sql`lower(candidate.username) like ${partialTerm}`;

  const result = await database.execute<SearchRow>(sql`
    with candidates as (
      select
        candidate.id,
        candidate.username,
        candidate.name,
        candidate.email,
        candidate.avatar_url,
        case
          when ${exactCondition} then 100
          when lower(candidate.username) like ${`${usernameQuery}%`} then 90
          when lower(candidate.email) like ${`${query}%`} then 80
          else 70
        end as relevance
      from app.users candidate
      where candidate.id <> ${actorUserId}::uuid
        and candidate.deleted_at is null
        and ${partialCondition}
    )
    select
      id,
      username,
      name,
      email,
      avatar_url,
      max(relevance)::integer as relevance
    from candidates
    group by id, username, name, email, avatar_url
    order by max(relevance) desc, username asc
    limit ${limit}
  `);

  const users: ConnectionSearchResult[] = result.rows.map((row) => ({
    kind: "user",
    id: row.id,
    username: row.username,
    name: row.name,
    email: row.email,
    avatarUrl: row.avatar_url,
    exact: row.relevance === 100,
  }));

  const validEmail = searchesEmail ? emailSchema.safeParse(query) : null;
  const hasExactAccount = users.some(
    (user) =>
      user.kind === "user" && user.email.toLocaleLowerCase("pt-BR") === query,
  );
  if (validEmail?.success && !hasExactAccount) {
    return [
      {
        kind: "invite",
        id: `email:${validEmail.data}`,
        email: validEmail.data,
        exact: true,
      },
      ...users,
    ].slice(0, limit) as ConnectionSearchResult[];
  }

  return users.slice(0, limit);
}
