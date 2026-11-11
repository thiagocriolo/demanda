import { randomUUID } from "node:crypto";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { affectedRows, rawRows, type Database } from "../db/database";
import {
  communities,
  communityInvitations,
  communityJoinRequests,
  communityMembers,
  storedFiles,
  users,
} from "../db/schema";
import type {
  Community,
  CommunityFeedPage,
  CommunityInvitation,
  CommunityJoinRequest,
  CommunityMember,
  CommunityMemberCandidate,
  CreateCommunityInput,
  CreateSocialPostInput,
} from "$lib/social/types";
import {
  searchConnectionUsers,
  type ConnectionUserSearchResult,
} from "../connections/service";
import {
  createSocialPost,
  hydratePosts,
  type PostRow,
  SocialOperationError,
} from "./service";
import { publicProfileMediaUrl } from "./profile-media";

function toIso(value: Date | string): string {
  return value instanceof Date
    ? value.toISOString()
    : new Date(value).toISOString();
}

type CommunityRow = {
  id: string;
  link_name: string;
  name: string;
  description: string;
  topic: string;
  visibility: "public" | "private";
  cover_file_id: string | null;
  created_at: Date | string;
  current_user_role: "owner" | "admin" | "member";
  member_count: number | string;
};

async function communityRows(
  database: Database,
  actorUserId: string,
  linkName?: string,
): Promise<CommunityRow[]> {
  const result = await database.execute<CommunityRow>(sql`
    select
      community.id,
      community.link_name,
      community.name,
      community.description,
      community.topic,
      community.visibility,
      community.cover_file_id,
      community.created_at,
      membership.role as current_user_role,
      (select count(*) from community_members member_count
        where member_count.community_id = community.id) as member_count
    from communities community
    inner join community_members membership
      on membership.community_id = community.id
      and membership.user_id = ${actorUserId}
    where community.deleted_at is null
      and (${linkName ?? null} is null or community.link_name = ${linkName ?? null})
    order by community.created_at desc, community.id desc
  `);
  return rawRows<CommunityRow>(result);
}

async function membersForCommunities(
  database: Database,
  communityIds: string[],
): Promise<Map<string, CommunityMember[]>> {
  const grouped = new Map<string, CommunityMember[]>();
  if (communityIds.length === 0) return grouped;
  const result = await database.execute<{
    community_id: string;
    role: "owner" | "admin" | "member";
    joined_at: Date | string;
    user_id: string;
    user_name: string;
    user_username: string;
    user_avatar_url: string | null;
    user_cover_url: string | null;
  }>(sql`
    select
      membership.community_id,
      membership.role,
      membership.joined_at,
      person.id as user_id,
      person.name as user_name,
      person.username as user_username,
      person.avatar_url as user_avatar_url,
      nullif(json_unquote(json_extract(preference.settings, '$.profile.cover')), '') as user_cover_url
    from community_members membership
    inner join users person on person.id = membership.user_id
    left join user_preferences preference on preference.user_id = person.id
    where membership.community_id in ${sql`(${sql.join(
      communityIds.map((id) => sql`${id}`),
      sql`, `,
    )})`}
    order by
      case membership.role when 'owner' then 0 when 'admin' then 1 else 2 end,
      person.name asc
  `);
  for (const row of rawRows<{
    community_id: string;
    role: "owner" | "admin" | "member";
    joined_at: Date | string;
    user_id: string;
    user_name: string;
    user_username: string;
    user_avatar_url: string | null;
    user_cover_url: string | null;
  }>(result)) {
    const member: CommunityMember = {
      role: row.role,
      joinedAt: toIso(row.joined_at),
      user: {
        id: row.user_id,
        name: row.user_name,
        username: row.user_username,
        avatarUrl: row.user_avatar_url,
        coverUrl: publicProfileMediaUrl(row.user_cover_url),
      },
    };
    grouped.set(row.community_id, [
      ...(grouped.get(row.community_id) ?? []),
      member,
    ]);
  }
  return grouped;
}

async function hydrateCommunities(
  database: Database,
  rows: CommunityRow[],
): Promise<Community[]> {
  const members = await membersForCommunities(
    database,
    rows.map((row) => row.id),
  );
  return rows.map((row) => ({
    id: row.id,
    linkName: row.link_name,
    name: row.name,
    description: row.description,
    topic: row.topic,
    visibility: row.visibility,
    coverUrl: row.cover_file_id
      ? `/api/files/${row.cover_file_id}/content`
      : null,
    memberCount: Number(row.member_count),
    currentUserRole: row.current_user_role,
    createdAt: toIso(row.created_at),
    members: members.get(row.id) ?? [],
  }));
}

export async function listCommunities(
  database: Database,
  actorUserId: string,
): Promise<Community[]> {
  return hydrateCommunities(
    database,
    await communityRows(database, actorUserId),
  );
}

export async function getCommunity(
  database: Database,
  actorUserId: string,
  linkName: string,
): Promise<Community> {
  const [community] = await hydrateCommunities(
    database,
    await communityRows(database, actorUserId, linkName),
  );
  if (!community) {
    throw new SocialOperationError(
      "Comunidade não encontrada ou acesso não autorizado.",
      404,
    );
  }
  return community;
}

export async function createCommunity(
  database: Database,
  actorUserId: string,
  input: CreateCommunityInput,
): Promise<Community> {
  const memberUserIds = [...new Set(input.memberUserIds)].filter(
    (userId) => userId !== actorUserId,
  );

  return database.transaction(async (transaction) => {
    const [existingLinkName] = await transaction
      .select({ id: communities.id })
      .from(communities)
      .where(eq(communities.linkName, input.linkName));
    if (existingLinkName) {
      throw new SocialOperationError(
        "Este @linkname já está sendo usado.",
        409,
      );
    }

    if (input.coverFileId) {
      const [cover] = await transaction
        .select({ id: storedFiles.id })
        .from(storedFiles)
        .where(
          and(
            eq(storedFiles.id, input.coverFileId),
            eq(storedFiles.ownerUserId, actorUserId),
            eq(storedFiles.purpose, "attachment"),
            eq(storedFiles.status, "ready"),
            isNull(storedFiles.deletedAt),
          ),
        );
      if (!cover)
        throw new SocialOperationError("A imagem de capa não está disponível.");
    }

    if (memberUserIds.length > 0) {
      const availableUsers = await transaction
        .select({ id: users.id })
        .from(users)
        .where(and(inArray(users.id, memberUserIds), isNull(users.deletedAt)));
      if (availableUsers.length !== memberUserIds.length) {
        throw new SocialOperationError(
          "Uma ou mais pessoas selecionadas não estão disponíveis.",
        );
      }
    }

    const id = randomUUID();
    await transaction
      .insert(communities)
      .values({
        id,
        ownerUserId: actorUserId,
        coverFileId: input.coverFileId ?? null,
        linkName: input.linkName,
        name: input.name.trim(),
        description: input.description.trim(),
        topic: input.topic.trim(),
        visibility: input.visibility,
      })
      ;
    if (!id)
      throw new SocialOperationError(
        "Não foi possível criar a comunidade.",
        500,
      );

    await transaction.insert(communityMembers).values({
      communityId: id,
      userId: actorUserId,
      role: "owner",
    });
    if (memberUserIds.length > 0) {
      await transaction.insert(communityInvitations).values(
        memberUserIds.map((invitedUserId) => ({
          communityId: id,
          invitedUserId,
          invitedByUserId: actorUserId,
        })),
      );
    }

    return getCommunity(transaction as Database, actorUserId, input.linkName);
  });
}

async function communityIdForMember(
  database: Database,
  actorUserId: string,
  linkName: string,
): Promise<string> {
  const [row] = await database
    .select({ id: communities.id })
    .from(communities)
    .innerJoin(
      communityMembers,
      and(
        eq(communityMembers.communityId, communities.id),
        eq(communityMembers.userId, actorUserId),
      ),
    )
    .where(
      and(eq(communities.linkName, linkName), isNull(communities.deletedAt)),
    );
  if (!row) throw new SocialOperationError("Comunidade não encontrada.", 404);
  return row.id;
}

async function assertCommunityMember(
  database: Database,
  actorUserId: string,
  communityId: string,
): Promise<void> {
  const [membership] = await database
    .select({ userId: communityMembers.userId })
    .from(communityMembers)
    .where(
      and(
        eq(communityMembers.communityId, communityId),
        eq(communityMembers.userId, actorUserId),
      ),
    );
  if (!membership)
    throw new SocialOperationError("Acesso não autorizado à comunidade.", 403);
}

async function communityRole(
  database: Database,
  actorUserId: string,
  linkName: string,
): Promise<{ communityId: string; role: "owner" | "admin" | "member" }> {
  const [membership] = await database
    .select({ communityId: communities.id, role: communityMembers.role })
    .from(communities)
    .innerJoin(
      communityMembers,
      and(
        eq(communityMembers.communityId, communities.id),
        eq(communityMembers.userId, actorUserId),
      ),
    )
    .where(
      and(eq(communities.linkName, linkName), isNull(communities.deletedAt)),
    );
  if (!membership)
    throw new SocialOperationError("Comunidade não encontrada.", 404);
  return membership;
}

export async function searchCommunityMemberCandidates(
  database: Database,
  actorUserId: string,
  linkName: string,
  query: string,
  limit = 3,
): Promise<CommunityMemberCandidate[]> {
  const actor = await communityRole(database, actorUserId, linkName);
  if (actor.role === "member")
    throw new SocialOperationError(
      "Somente administradores e gestores podem adicionar membros.",
      403,
    );

  const memberships = await database
    .select({ userId: communityMembers.userId })
    .from(communityMembers)
    .where(eq(communityMembers.communityId, actor.communityId));
  const memberIds = new Set(memberships.map((member) => member.userId));
  const invitations = await database
    .select({ userId: communityInvitations.invitedUserId })
    .from(communityInvitations)
    .where(
      and(
        eq(communityInvitations.communityId, actor.communityId),
        eq(communityInvitations.status, "pending"),
      ),
    );
  const invitedUserIds = new Set(invitations.map(({ userId }) => userId));
  const candidates = await searchConnectionUsers(
    database,
    actorUserId,
    query,
    Math.max(limit * 4, 12),
  );

  return candidates
    .filter(
      (candidate): candidate is ConnectionUserSearchResult =>
        candidate.kind === "user" &&
        !memberIds.has(candidate.id) &&
        !invitedUserIds.has(candidate.id),
    )
    .slice(0, limit)
    .map((candidate) => ({
      id: candidate.id,
      name: candidate.name,
      username: candidate.username,
      avatarUrl: candidate.avatarUrl,
    }));
}

export async function inviteCommunityMember(
  database: Database,
  actorUserId: string,
  linkName: string,
  memberUserId: string,
): Promise<void> {
  const actor = await communityRole(database, actorUserId, linkName);
  if (actor.role === "member")
    throw new SocialOperationError(
      "Somente administradores e gestores podem adicionar membros.",
      403,
    );

  return database.transaction(async (transaction) => {
    const [person] = await transaction
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.id, memberUserId), isNull(users.deletedAt)));
    if (!person) throw new SocialOperationError("Pessoa não encontrada.", 404);

    const [membership] = await transaction
      .select({ userId: communityMembers.userId })
      .from(communityMembers)
      .where(
        and(
          eq(communityMembers.communityId, actor.communityId),
          eq(communityMembers.userId, memberUserId),
        ),
      );
    if (membership)
      throw new SocialOperationError("Essa pessoa já participa da comunidade.");

    const invitationId = randomUUID();
    const created = await transaction
      .insert(communityInvitations)
      .values({
        id: invitationId,
        communityId: actor.communityId,
        invitedUserId: memberUserId,
        invitedByUserId: actorUserId,
      })
      .onDuplicateKeyUpdate({
        set: { id: sql`${communityInvitations.id}` },
      });
    if (affectedRows(created) !== 1)
      throw new SocialOperationError("Essa pessoa já foi convidada.");
  });
}

export async function listCommunityInvitations(
  database: Database,
  actorUserId: string,
): Promise<CommunityInvitation[]> {
  const result = await database.execute<{
    id: string;
    invited_at: Date | string;
    community_link_name: string;
    community_name: string;
    community_topic: string;
    community_cover_file_id: string | null;
    inviter_id: string;
    inviter_name: string;
    inviter_username: string;
    inviter_avatar_url: string | null;
  }>(sql`
    select
      invitation.id,
      invitation.invited_at,
      community.link_name as community_link_name,
      community.name as community_name,
      community.topic as community_topic,
      community.cover_file_id as community_cover_file_id,
      inviter.id as inviter_id,
      inviter.name as inviter_name,
      inviter.username as inviter_username,
      inviter.avatar_url as inviter_avatar_url
    from community_invitations invitation
    inner join communities community on community.id = invitation.community_id
    inner join users inviter on inviter.id = invitation.invited_by_user_id
    where invitation.invited_user_id = ${actorUserId}
      and invitation.status = 'pending'
      and community.deleted_at is null
    order by invitation.invited_at desc, invitation.id desc
  `);
  return rawRows<{
    id: string;
    invited_at: Date | string;
    community_link_name: string;
    community_name: string;
    community_topic: string;
    community_cover_file_id: string | null;
    inviter_id: string;
    inviter_name: string;
    inviter_username: string;
    inviter_avatar_url: string | null;
  }>(result).map((row) => ({
    id: row.id,
    invitedAt: toIso(row.invited_at),
    community: {
      linkName: row.community_link_name,
      name: row.community_name,
      topic: row.community_topic,
      coverUrl: row.community_cover_file_id
        ? `/api/files/${row.community_cover_file_id}/content`
        : null,
    },
    invitedBy: {
      id: row.inviter_id,
      name: row.inviter_name,
      username: row.inviter_username,
      avatarUrl: row.inviter_avatar_url,
    },
  }));
}

export async function acceptCommunityInvitation(
  database: Database,
  actorUserId: string,
  invitationId: string,
): Promise<Community> {
  return database.transaction(async (transaction) => {
    const [accepted] = await transaction
      .select({ communityId: communityInvitations.communityId })
      .from(communityInvitations)
      .where(
        and(
          eq(communityInvitations.id, invitationId),
          eq(communityInvitations.invitedUserId, actorUserId),
          eq(communityInvitations.status, "pending"),
        ),
      )
      .limit(1);
    if (!accepted)
      throw new SocialOperationError("Convite nÃ£o encontrado.", 404);
    const changed = await transaction
      .update(communityInvitations)
      .set({ status: "accepted", acceptedAt: new Date() })
      .where(
        and(
          eq(communityInvitations.id, invitationId),
          eq(communityInvitations.invitedUserId, actorUserId),
          eq(communityInvitations.status, "pending"),
        ),
      );
    if (affectedRows(changed) !== 1)
      throw new SocialOperationError("Convite não encontrado.", 404);

    const [community] = await transaction
      .select({ linkName: communities.linkName })
      .from(communities)
      .where(
        and(
          eq(communities.id, accepted.communityId),
          isNull(communities.deletedAt),
        ),
      );
    if (!community)
      throw new SocialOperationError("Comunidade não encontrada.", 404);

    await transaction
      .insert(communityMembers)
      .values({ communityId: accepted.communityId, userId: actorUserId })
      .onDuplicateKeyUpdate({
        set: { communityId: sql`${communityMembers.communityId}` },
      });
    return getCommunity(
      transaction as Database,
      actorUserId,
      community.linkName,
    );
  });
}

export async function promoteCommunityMember(
  database: Database,
  actorUserId: string,
  linkName: string,
  memberUserId: string,
): Promise<Community> {
  const actor = await communityRole(database, actorUserId, linkName);
  if (actor.role !== "owner")
    throw new SocialOperationError(
      "Somente o administrador pode promover gestores.",
      403,
    );
  const updated = await database
    .update(communityMembers)
    .set({ role: "admin" })
    .where(
      and(
        eq(communityMembers.communityId, actor.communityId),
        eq(communityMembers.userId, memberUserId),
        eq(communityMembers.role, "member"),
      ),
    );
  if (affectedRows(updated) !== 1)
    throw new SocialOperationError(
      "Membro não encontrado ou já é gestor.",
      404,
    );
  return getCommunity(database, actorUserId, linkName);
}

export async function listCommunityJoinRequests(
  database: Database,
  actorUserId: string,
  linkName: string,
): Promise<CommunityJoinRequest[]> {
  const actor = await communityRole(database, actorUserId, linkName);
  if (actor.role === "member")
    throw new SocialOperationError(
      "Somente administradores e gestores podem ver solicitações.",
      403,
    );
  const result = await database.execute<{
    id: string;
    requested_at: Date | string;
    user_id: string;
    user_name: string;
    user_username: string;
    user_avatar_url: string | null;
  }>(sql`
    select
      request.id,
      request.requested_at,
      person.id as user_id,
      person.name as user_name,
      person.username as user_username,
      person.avatar_url as user_avatar_url
    from community_join_requests request
    inner join users person on person.id = request.user_id
    where request.community_id = ${actor.communityId}
      and request.status = 'pending'
    order by request.requested_at asc, request.id asc
  `);
  return rawRows<{
    id: string;
    requested_at: Date | string;
    user_id: string;
    user_name: string;
    user_username: string;
    user_avatar_url: string | null;
  }>(result).map((row) => ({
    id: row.id,
    requestedAt: toIso(row.requested_at),
    user: {
      id: row.user_id,
      name: row.user_name,
      username: row.user_username,
      avatarUrl: row.user_avatar_url,
    },
  }));
}

export async function acceptCommunityJoinRequest(
  database: Database,
  actorUserId: string,
  linkName: string,
  requestId: string,
): Promise<Community> {
  const actor = await communityRole(database, actorUserId, linkName);
  if (actor.role === "member")
    throw new SocialOperationError(
      "Somente administradores e gestores podem aceitar solicitações.",
      403,
    );
  return database.transaction(async (transaction) => {
    const [request] = await transaction
      .select({ userId: communityJoinRequests.userId })
      .from(communityJoinRequests)
      .where(
        and(
          eq(communityJoinRequests.id, requestId),
          eq(communityJoinRequests.communityId, actor.communityId),
          eq(communityJoinRequests.status, "pending"),
        ),
      );
    if (!request)
      throw new SocialOperationError("Solicitação não encontrada.", 404);
    await transaction
      .insert(communityMembers)
      .values({ communityId: actor.communityId, userId: request.userId })
      .onDuplicateKeyUpdate({
        set: { communityId: sql`${communityMembers.communityId}` },
      });
    await transaction
      .update(communityJoinRequests)
      .set({
        status: "accepted",
        reviewedAt: new Date(),
        reviewedByUserId: actorUserId,
      })
      .where(eq(communityJoinRequests.id, requestId));
    return getCommunity(transaction as Database, actorUserId, linkName);
  });
}

export async function listCommunityFeed(
  database: Database,
  actorUserId: string,
  linkName: string,
  cursor?: string,
): Promise<CommunityFeedPage> {
  const communityId = await communityIdForMember(
    database,
    actorUserId,
    linkName,
  );
  await assertCommunityMember(database, actorUserId, communityId);
  const parsedCursor = cursor ? new Date(cursor) : undefined;
  const cursorIso = Number.isNaN(parsedCursor?.getTime())
    ? null
    : (parsedCursor?.toISOString() ?? null);
  const result = await database.execute<PostRow>(sql`
    select
      post.id, post.kind, post.title, post.body, post.link_url, post.created_at,
      author.id as author_id, author.name as author_name,
      author.username as author_username, author.avatar_url as author_avatar_url
    from social_posts post
    inner join users author on author.id = post.author_user_id
    where post.community_id = ${communityId}
      and post.deleted_at is null
      and (${cursorIso} is null or post.created_at < ${cursorIso})
    order by post.created_at desc, post.id desc
    limit 21
  `);
  const rows = rawRows<PostRow>(result);
  const hasMore = rows.length > 20;
  const visible = rows.slice(0, 20);
  return {
    items: await hydratePosts(database, visible, actorUserId),
    nextCursor:
      hasMore && visible.at(-1) ? toIso(visible.at(-1)!.created_at) : null,
  };
}

export async function createCommunityPost(
  database: Database,
  actorUserId: string,
  linkName: string,
  input: CreateSocialPostInput,
) {
  const communityId = await communityIdForMember(
    database,
    actorUserId,
    linkName,
  );
  await assertCommunityMember(database, actorUserId, communityId);
  if (input.kind !== "feed")
    throw new SocialOperationError("Publicação inválida.");
  return createSocialPost(database, actorUserId, input, communityId);
}
