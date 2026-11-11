import { randomUUID } from "node:crypto";
import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
import { affectedRows, rawRows, type Database } from "../db/database";
import {
  socialCommentLikes,
  socialPostBlocks,
  socialPostComments,
  socialPostLikes,
  socialPosts,
  storedFiles,
} from "../db/schema";
import type {
  CreateSocialPostInput,
  FeedActivityItem,
  FeedConnectionItem,
  FeedItem,
  FeedPage,
  SocialAuthor,
  SocialComment,
  SocialPost,
  SocialPostBlock,
  SocialPostInteraction,
} from "$lib/social/types";

export class SocialOperationError extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
    this.name = "SocialOperationError";
  }
}

export type PostRow = {
  id: string;
  kind: "feed" | "portfolio";
  title: string | null;
  body: string | null;
  link_url: string | null;
  created_at: Date | string;
  author_id: string;
  author_name: string;
  author_username: string;
  author_avatar_url: string | null;
};

function toIso(value: Date | string): string {
  return value instanceof Date
    ? value.toISOString()
    : new Date(value).toISOString();
}

function authorFromRow(row: PostRow): SocialAuthor {
  return {
    id: row.author_id,
    name: row.author_name,
    username: row.author_username,
    avatarUrl: row.author_avatar_url,
  };
}

async function blocksForPosts(
  database: Database,
  postIds: string[],
): Promise<Map<string, SocialPostBlock[]>> {
  const grouped = new Map<string, SocialPostBlock[]>();
  if (postIds.length === 0) return grouped;
  const rows = await database
    .select({
      id: socialPostBlocks.id,
      postId: socialPostBlocks.postId,
      kind: socialPostBlocks.kind,
      text: socialPostBlocks.textContent,
      fileId: socialPostBlocks.fileId,
      mimeType: storedFiles.mimeType,
      caption: socialPostBlocks.caption,
      position: socialPostBlocks.position,
    })
    .from(socialPostBlocks)
    .leftJoin(storedFiles, eq(storedFiles.id, socialPostBlocks.fileId))
    .where(inArray(socialPostBlocks.postId, postIds))
    .orderBy(asc(socialPostBlocks.position));
  for (const row of rows) {
    const block: SocialPostBlock = {
      id: row.id,
      kind: row.kind,
      text: row.text,
      imageUrl:
        row.kind === "image" && row.fileId
          ? `/api/files/${row.fileId}/content`
          : null,
      videoUrl:
        row.kind === "video" && row.fileId
          ? `/api/files/${row.fileId}/content`
          : null,
      mimeType: row.mimeType,
      caption: row.caption,
      position: row.position,
    };
    grouped.set(row.postId, [...(grouped.get(row.postId) ?? []), block]);
  }
  return grouped;
}

export async function hydratePosts(
  database: Database,
  rows: PostRow[],
  actorUserId?: string,
): Promise<SocialPost[]> {
  const postIds = rows.map((row) => row.id);
  const [blocks, interactions] = await Promise.all([
    blocksForPosts(database, postIds),
    interactionsForPosts(database, postIds, actorUserId),
  ]);
  return rows.map((row) => ({
    id: row.id,
    kind: row.kind,
    title: row.title,
    body: row.body,
    linkUrl: row.link_url,
    createdAt: toIso(row.created_at),
    author: authorFromRow(row),
    blocks: blocks.get(row.id) ?? [],
    likeCount: interactions.get(row.id)?.likeCount ?? 0,
    commentCount: interactions.get(row.id)?.commentCount ?? 0,
    likedByCurrentUser: interactions.get(row.id)?.likedByCurrentUser ?? false,
    canInteract: interactions.get(row.id)?.canInteract ?? false,
    canManage: row.author_id === actorUserId,
    viewerAuthenticated: Boolean(actorUserId),
  }));
}

type InteractionState = SocialPostInteraction & { canInteract: boolean };

function mysqlBoolean(value: boolean | number | string | null | undefined): boolean {
  return Number(value) === 1;
}

async function interactionsForPosts(
  database: Database,
  postIds: string[],
  actorUserId?: string,
): Promise<Map<string, InteractionState>> {
  const grouped = new Map<string, InteractionState>();
  if (postIds.length === 0) return grouped;
  const result = await database.execute<{
    post_id: string;
    like_count: number | string;
    comment_count: number | string;
    liked_by_current_user: boolean | number | string;
    can_interact: boolean | number | string;
  }>(sql`
    select
      post.id as post_id,
      (select count(*) from social_post_likes post_like
        where post_like.post_id = post.id) as like_count,
      (select count(*) from social_post_comments comment
        where comment.post_id = post.id and comment.deleted_at is null) as comment_count,
      (${actorUserId ?? null} is not null and exists (
        select 1 from social_post_likes current_like
        where current_like.post_id = post.id
          and current_like.user_id = ${actorUserId ?? null}
      )) as liked_by_current_user,
      (${actorUserId ?? null} is not null and (
        post.author_user_id = ${actorUserId ?? null}
        or exists (
          select 1 from user_connections connection
          where (connection.user_a_id = ${actorUserId ?? null}
            and connection.user_b_id = post.author_user_id)
             or (connection.user_b_id = ${actorUserId ?? null}
            and connection.user_a_id = post.author_user_id)
        )
        or exists (
          select 1 from community_members membership
          where membership.community_id = post.community_id
            and membership.user_id = ${actorUserId ?? null}
        )
      )) as can_interact
    from social_posts post
    where post.id in ${sql`(${sql.join(
      postIds.map((id) => sql`${id}`),
      sql`, `,
    )})`}
  `);
  for (const row of rawRows<{
    post_id: string;
    like_count: number | string;
    comment_count: number | string;
    liked_by_current_user: boolean | number | string;
    can_interact: boolean | number | string;
  }>(result)) {
    grouped.set(row.post_id, {
      likeCount: Number(row.like_count),
      commentCount: Number(row.comment_count),
      likedByCurrentUser: mysqlBoolean(row.liked_by_current_user),
      canInteract: mysqlBoolean(row.can_interact),
    });
  }
  return grouped;
}

async function visiblePostRows(
  database: Database,
  actorUserId: string,
  kind?: "feed" | "portfolio",
  cursor?: Date,
  limit = 24,
): Promise<PostRow[]> {
  const result = await database.execute<PostRow>(sql`
    select
      post.id, post.kind, post.title, post.body, post.link_url, post.created_at,
      author.id as author_id, author.name as author_name,
      author.username as author_username, author.avatar_url as author_avatar_url
    from social_posts post
    inner join users author on author.id = post.author_user_id
    where post.deleted_at is null
      and post.community_id is null
      and (${kind ?? null} is null or post.kind = ${kind ?? null})
      and (${cursor?.toISOString() ?? null} is null
        or post.created_at < ${cursor?.toISOString() ?? null})
      and (
        post.author_user_id = ${actorUserId}
        or exists (
          select 1 from user_connections connection
          where (connection.user_a_id = ${actorUserId}
            and connection.user_b_id = post.author_user_id)
             or (connection.user_b_id = ${actorUserId}
            and connection.user_a_id = post.author_user_id)
        )
      )
    order by post.created_at desc, post.id desc
    limit ${limit}
  `);
  return rawRows<PostRow>(result);
}

async function ownPortfolioRows(
  database: Database,
  authorUserId: string,
  cursor?: Date,
  limit = 24,
): Promise<PostRow[]> {
  const result = await database.execute<PostRow>(sql`
    select
      post.id, post.kind, post.title, post.body, post.link_url, post.created_at,
      author.id as author_id, author.name as author_name,
      author.username as author_username, author.avatar_url as author_avatar_url
    from social_posts post
    inner join users author on author.id = post.author_user_id
    where post.deleted_at is null
      and post.community_id is null
      and post.kind = 'portfolio'
      and post.author_user_id = ${authorUserId}
      and (${cursor?.toISOString() ?? null} is null
        or post.created_at < ${cursor?.toISOString() ?? null})
    order by post.created_at desc, post.id desc
    limit ${limit}
  `);
  return rawRows<PostRow>(result);
}

export async function createSocialPost(
  database: Database,
  authorUserId: string,
  input: CreateSocialPostInput,
  communityId?: string,
): Promise<SocialPost> {
  const body = input.body?.trim() || null;
  const linkUrl = input.linkUrl?.trim() || null;
  const title = input.title?.trim() || null;
  const imageBlocks = input.blocks.filter(
    (
      block,
    ): block is Extract<(typeof input.blocks)[number], { kind: "image" }> =>
      block.kind === "image",
  );
  const videoBlocks = input.blocks.filter(
    (
      block,
    ): block is Extract<(typeof input.blocks)[number], { kind: "video" }> =>
      block.kind === "video",
  );
  const mediaBlocks = [...imageBlocks, ...videoBlocks];
  if (input.kind === "feed" && !body && !linkUrl && mediaBlocks.length === 0) {
    throw new SocialOperationError(
      "Escreva algo, adicione uma imagem ou vídeo, ou inclua um link.",
    );
  }
  if (input.kind === "feed" && mediaBlocks.length > 10) {
    throw new SocialOperationError("Selecione no máximo 10 arquivos de mídia.");
  }
  if (input.kind === "portfolio" && !title) {
    throw new SocialOperationError("Dê um título ao projeto.");
  }
  if (input.kind === "portfolio" && imageBlocks.length === 0) {
    throw new SocialOperationError(
      "Adicione ao menos uma imagem ao portfólio.",
    );
  }
  if (input.kind === "portfolio" && videoBlocks.length > 0) {
    throw new SocialOperationError("O portfólio aceita somente imagens.");
  }

  const fileIds = mediaBlocks.map((block) => block.fileId);
  if (new Set(fileIds).size !== fileIds.length) {
    throw new SocialOperationError("Cada mídia só pode aparecer uma vez.");
  }
  return database.transaction(async (transaction) => {
    if (fileIds.length > 0) {
      const ownedFiles = await transaction
        .select({ id: storedFiles.id, mimeType: storedFiles.mimeType })
        .from(storedFiles)
        .where(
          and(
            inArray(storedFiles.id, fileIds),
            eq(storedFiles.ownerUserId, authorUserId),
            eq(storedFiles.purpose, "attachment"),
            eq(storedFiles.status, "ready"),
            isNull(storedFiles.deletedAt),
          ),
        );
      const ownedById = new Map(
        ownedFiles.map((file) => [file.id, file.mimeType]),
      );
      if (ownedById.size !== new Set(fileIds).size) {
        throw new SocialOperationError("Uma das mídias não está disponível.");
      }
      if (
        imageBlocks.some(
          (block) => !ownedById.get(block.fileId)?.startsWith("image/"),
        ) ||
        videoBlocks.some(
          (block) => !ownedById.get(block.fileId)?.startsWith("video/"),
        )
      ) {
        throw new SocialOperationError(
          "O formato de uma das mídias não corresponde à publicação.",
        );
      }
    }

    const id = randomUUID();
    await transaction
      .insert(socialPosts)
      .values({
        id,
        authorUserId,
        communityId: communityId ?? null,
        kind: input.kind,
        title,
        body,
        linkUrl,
      });
    const [created] = await transaction
      .select()
      .from(socialPosts)
      .where(eq(socialPosts.id, id))
      .limit(1);
    if (!created)
      throw new SocialOperationError("Não foi possível publicar.", 500);
    if (input.blocks.length > 0) {
      await transaction.insert(socialPostBlocks).values(
        input.blocks.map((block, position) =>
          block.kind === "text"
            ? {
                postId: created.id,
                kind: "text" as const,
                textContent: block.text.trim(),
                position,
              }
            : {
                postId: created.id,
                kind: block.kind,
                fileId: block.fileId,
                caption: block.caption?.trim() || null,
                position,
              },
        ),
      );
    }
    const rows = await transaction.execute<PostRow>(sql`
      select
        post.id, post.kind, post.title, post.body, post.link_url, post.created_at,
        author.id as author_id, author.name as author_name,
        author.username as author_username, author.avatar_url as author_avatar_url
      from social_posts post
      inner join users author on author.id = post.author_user_id
      where post.id = ${created.id}
    `);
    const [post] = await hydratePosts(
      transaction as Database,
      rawRows<PostRow>(rows),
      authorUserId,
    );
    if (!post)
      throw new SocialOperationError("Publicação não encontrada.", 500);
    return post;
  });
}

export async function listPortfolios(
  database: Database,
  actorUserId: string,
  cursor?: string,
): Promise<{ items: SocialPost[]; nextCursor: string | null }> {
  const parsedCursor = cursor ? new Date(cursor) : undefined;
  const rows = await ownPortfolioRows(database, actorUserId, parsedCursor, 19);
  const hasMore = rows.length > 18;
  const visible = rows.slice(0, 18);
  return {
    items: await hydratePosts(database, visible, actorUserId),
    nextCursor:
      hasMore && visible.at(-1) ? toIso(visible.at(-1)!.created_at) : null,
  };
}

export async function getPortfolio(
  database: Database,
  actorUserId: string,
  postId: string,
): Promise<SocialPost> {
  const result = await database.execute<PostRow>(sql`
    select
      post.id, post.kind, post.title, post.body, post.link_url, post.created_at,
      author.id as author_id, author.name as author_name,
      author.username as author_username, author.avatar_url as author_avatar_url
    from social_posts post
    inner join users author on author.id = post.author_user_id
    where post.id = ${postId} and post.kind = 'portfolio'
      and post.deleted_at is null
      and post.community_id is null
      and post.author_user_id = ${actorUserId}
  `);
  const [post] = await hydratePosts(database, rawRows<PostRow>(result), actorUserId);
  if (!post) throw new SocialOperationError("Portfólio não encontrado.", 404);
  return post;
}

export async function getSocialPost(
  database: Database,
  actorUserId: string,
  postId: string,
): Promise<SocialPost> {
  const result = await database.execute<PostRow>(sql`
    select
      post.id, post.kind, post.title, post.body, post.link_url, post.created_at,
      author.id as author_id, author.name as author_name,
      author.username as author_username, author.avatar_url as author_avatar_url
    from social_posts post
    inner join users author on author.id = post.author_user_id
    where post.id = ${postId}
      and post.deleted_at is null
      and (
        post.author_user_id = ${actorUserId}
        or (post.community_id is null and post.kind = 'portfolio')
        or (post.community_id is null and exists (
          select 1 from user_connections connection
          where (connection.user_a_id = ${actorUserId}
            and connection.user_b_id = post.author_user_id)
             or (connection.user_b_id = ${actorUserId}
            and connection.user_a_id = post.author_user_id)
        ))
        or exists (
          select 1 from community_members membership
          where membership.community_id = post.community_id
            and membership.user_id = ${actorUserId}
        )
      )
  `);
  const [post] = await hydratePosts(database, rawRows<PostRow>(result), actorUserId);
  if (!post) throw new SocialOperationError("Publicação não encontrada.", 404);
  return post;
}

export async function updateSocialPostBody(
  database: Database,
  actorUserId: string,
  postId: string,
  value: string,
): Promise<SocialPost> {
  const body = value.trim() || null;
  return database.transaction(async (transaction) => {
    const [owned] = await transaction
      .select({
        id: socialPosts.id,
        kind: socialPosts.kind,
        linkUrl: socialPosts.linkUrl,
      })
      .from(socialPosts)
      .where(
        and(
          eq(socialPosts.id, postId),
          eq(socialPosts.authorUserId, actorUserId),
          isNull(socialPosts.deletedAt),
        ),
      );
    if (!owned) {
      throw new SocialOperationError(
        "Você só pode editar suas próprias publicações.",
        403,
      );
    }
    if (owned.kind === "feed" && !body && !owned.linkUrl) {
      const [media] = await transaction
        .select({ id: socialPostBlocks.id })
        .from(socialPostBlocks)
        .where(
          and(
            eq(socialPostBlocks.postId, postId),
            inArray(socialPostBlocks.kind, ["image", "video"]),
          ),
        )
        .limit(1);
      if (!media) {
        throw new SocialOperationError("A publicação não pode ficar vazia.");
      }
    }
    await transaction
      .update(socialPosts)
      .set({ body, updatedAt: new Date() })
      .where(eq(socialPosts.id, postId));
    return getSocialPost(transaction as Database, actorUserId, postId);
  });
}

export async function deleteSocialPost(
  database: Database,
  actorUserId: string,
  postId: string,
): Promise<void> {
  const deleted = await database
    .update(socialPosts)
    .set({ deletedAt: new Date(), updatedAt: new Date() })
    .where(
      and(
        eq(socialPosts.id, postId),
        eq(socialPosts.authorUserId, actorUserId),
        isNull(socialPosts.deletedAt),
      ),
    );
  if (affectedRows(deleted) !== 1) {
    throw new SocialOperationError(
      "Você só pode excluir suas próprias publicações.",
      403,
    );
  }
}

export async function listFeed(
  database: Database,
  actorUserId: string,
  cursor?: string,
): Promise<FeedPage> {
  const cursorDate = cursor ? new Date(cursor) : undefined;
  const cursorIso = Number.isNaN(cursorDate?.getTime())
    ? null
    : (cursorDate?.toISOString() ?? null);
  const posts = await visiblePostRows(
    database,
    actorUserId,
    undefined,
    cursorDate,
    30,
  );
  const hydrated = await hydratePosts(database, posts, actorUserId);

  const activityRows = await database.execute<{
    id: string;
    entity: "workspace" | "project" | "task";
    title: string;
    context: string | null;
    occurred_at: Date | string;
    actor_id: string | null;
    actor_name: string | null;
    actor_username: string | null;
    actor_avatar_url: string | null;
  }>(sql`
    with connected_users as (
      select case when connection.user_a_id = ${actorUserId}
        then connection.user_b_id else connection.user_a_id end as user_id
      from user_connections connection
      where connection.user_a_id = ${actorUserId}
         or connection.user_b_id = ${actorUserId}
    ), visible_workspaces as (
      select distinct workspace.id
      from workspaces workspace
      inner join workspace_members member on member.workspace_id = workspace.id
      where member.user_id = ${actorUserId}
         or member.user_id in (select user_id from connected_users)
    ), events as (
      select concat('workspace:', workspace.id) as id, 'workspace' as entity,
        workspace.name as title, null as context, workspace.updated_at as occurred_at,
        workspace.id as workspace_id
      from workspaces workspace
      where workspace.id in (select id from visible_workspaces) and workspace.kind = 'shared'
      union all
      select concat('project:', project.id), 'project', project.name, workspace.name,
        project.updated_at, project.workspace_id
      from projects project
      inner join workspaces workspace on workspace.id = project.workspace_id
      where project.workspace_id in (select id from visible_workspaces) and project.archived_at is null
      union all
      select concat('task:', task.id), 'task', task.name, project.name,
        task.updated_at, task.workspace_id
      from tasks task
      inner join projects project on project.id = task.project_id and project.workspace_id = task.workspace_id
      where task.workspace_id in (select id from visible_workspaces) and task.archived_at is null
    )
    select event.*, actor.id as actor_id, actor.name as actor_name,
      actor.username as actor_username, actor.avatar_url as actor_avatar_url
    from events event
    left join lateral (
      select candidate.* from workspace_members member
      inner join users candidate on candidate.id = member.user_id
      where member.workspace_id = event.workspace_id
        and (candidate.id = ${actorUserId}
          or candidate.id in (select user_id from connected_users))
      order by (candidate.id = ${actorUserId}) desc, member.joined_at desc
      limit 1
    ) actor on true
    where (${cursorIso} is null or event.occurred_at < ${cursorIso})
    order by event.occurred_at desc
    limit 30
  `);

  const connectionRows = await database.execute<{
    id: string;
    occurred_at: Date | string;
    a_id: string;
    a_name: string;
    a_username: string;
    a_avatar_url: string | null;
    b_id: string;
    b_name: string;
    b_username: string;
    b_avatar_url: string | null;
  }>(sql`
    with connected_users as (
      select case when connection.user_a_id = ${actorUserId}
        then connection.user_b_id else connection.user_a_id end as user_id
      from user_connections connection
      where connection.user_a_id = ${actorUserId}
         or connection.user_b_id = ${actorUserId}
    )
    select concat('connection:', connection.user_a_id, ':', connection.user_b_id) as id,
      connection.created_at as occurred_at,
      a.id as a_id, a.name as a_name, a.username as a_username, a.avatar_url as a_avatar_url,
      b.id as b_id, b.name as b_name, b.username as b_username, b.avatar_url as b_avatar_url
    from user_connections connection
    inner join users a on a.id = connection.user_a_id
    inner join users b on b.id = connection.user_b_id
    where connection.user_a_id in (select user_id from connected_users)
      and connection.user_b_id in (select user_id from connected_users)
      and (${cursorIso} is null or connection.created_at < ${cursorIso})
    order by connection.created_at desc
    limit 30
  `);

  const activities: FeedActivityItem[] = rawRows<{
    id: string;
    entity: "workspace" | "project" | "task";
    title: string;
    context: string | null;
    occurred_at: Date | string;
    actor_id: string | null;
    actor_name: string | null;
    actor_username: string | null;
    actor_avatar_url: string | null;
  }>(activityRows).map((row) => ({
    id: row.id,
    kind: "activity",
    occurredAt: toIso(row.occurred_at),
    entity: row.entity,
    title: row.title,
    context: row.context,
    actor: row.actor_id
      ? {
          id: row.actor_id,
          name: row.actor_name!,
          username: row.actor_username!,
          avatarUrl: row.actor_avatar_url,
        }
      : null,
  }));
  const connectionItems: FeedConnectionItem[] = rawRows<{
    id: string;
    occurred_at: Date | string;
    a_id: string;
    a_name: string;
    a_username: string;
    a_avatar_url: string | null;
    b_id: string;
    b_name: string;
    b_username: string;
    b_avatar_url: string | null;
  }>(connectionRows).map(
    (row) => ({
      id: row.id,
      kind: "connection",
      occurredAt: toIso(row.occurred_at),
      people: [
        {
          id: row.a_id,
          name: row.a_name,
          username: row.a_username,
          avatarUrl: row.a_avatar_url,
        },
        {
          id: row.b_id,
          name: row.b_name,
          username: row.b_username,
          avatarUrl: row.b_avatar_url,
        },
      ],
    }),
  );
  const items: FeedItem[] = [
    ...hydrated.map((post) => ({
      id: `post:${post.id}`,
      kind: "post" as const,
      occurredAt: post.createdAt,
      post,
    })),
    ...activities,
    ...connectionItems,
  ]
    .sort(
      (a, b) =>
        b.occurredAt.localeCompare(a.occurredAt) || b.id.localeCompare(a.id),
    )
    .slice(0, 12);
  return {
    items,
    nextCursor: items.length === 12 ? items.at(-1)!.occurredAt : null,
  };
}

async function assertCanInteractWithPost(
  database: Database,
  actorUserId: string,
  postId: string,
): Promise<void> {
  const result = await database.execute<{ allowed: boolean }>(sql`
    select exists (
      select 1
      from social_posts post
      where post.id = ${postId}
        and post.deleted_at is null
        and (
          post.author_user_id = ${actorUserId}
          or exists (
            select 1 from user_connections connection
            where (connection.user_a_id = ${actorUserId}
              and connection.user_b_id = post.author_user_id)
               or (connection.user_b_id = ${actorUserId}
              and connection.user_a_id = post.author_user_id)
          )
          or exists (
            select 1 from community_members membership
            where membership.community_id = post.community_id
              and membership.user_id = ${actorUserId}
          )
        )
    ) as allowed
  `);
  if (!rawRows<{ allowed: boolean }>(result)[0]?.allowed) {
    throw new SocialOperationError(
      "Somente conexões ou membros da comunidade podem interagir com esta publicação.",
      403,
    );
  }
}

async function interactionForPost(
  database: Database,
  actorUserId: string,
  postId: string,
): Promise<SocialPostInteraction> {
  const state = (
    await interactionsForPosts(database, [postId], actorUserId)
  ).get(postId);
  return {
    likeCount: state?.likeCount ?? 0,
    commentCount: state?.commentCount ?? 0,
    likedByCurrentUser: state?.likedByCurrentUser ?? false,
  };
}

export async function setPostLike(
  database: Database,
  actorUserId: string,
  postId: string,
  liked: boolean,
): Promise<SocialPostInteraction> {
  await assertCanInteractWithPost(database, actorUserId, postId);
  if (liked) {
    await database
      .insert(socialPostLikes)
      .values({ postId, userId: actorUserId })
      .onDuplicateKeyUpdate({
        set: { postId: sql`${socialPostLikes.postId}` },
      });
  } else {
    await database
      .delete(socialPostLikes)
      .where(
        and(
          eq(socialPostLikes.postId, postId),
          eq(socialPostLikes.userId, actorUserId),
        ),
      );
  }
  return interactionForPost(database, actorUserId, postId);
}

export async function listPostComments(
  database: Database,
  actorUserId: string,
  postId: string,
): Promise<SocialComment[]> {
  await assertCanInteractWithPost(database, actorUserId, postId);
  return readPostComments(database, actorUserId, postId);
}

async function readPostComments(
  database: Database,
  actorUserId: string,
  postId: string,
): Promise<SocialComment[]> {
  const result = await database.execute<{
    id: string;
    body: string;
    parent_comment_id: string | null;
    depth: number;
    created_at: Date | string;
    deleted_at: Date | string | null;
    author_id: string;
    author_name: string;
    author_username: string;
    author_avatar_url: string | null;
    like_count: number | string;
    liked_by_current_user: boolean | number | string;
  }>(sql`
    select
      comment.id,
      comment.body,
      comment.parent_comment_id,
      comment.depth,
      comment.created_at,
      comment.deleted_at,
      author.id as author_id,
      author.name as author_name,
      author.username as author_username,
      author.avatar_url as author_avatar_url,
      (select count(*) from social_comment_likes comment_like
        where comment_like.comment_id = comment.id) as like_count,
      exists (
        select 1 from social_comment_likes current_like
        where current_like.comment_id = comment.id
          and current_like.user_id = ${actorUserId}
      ) as liked_by_current_user
    from social_post_comments comment
    inner join users author on author.id = comment.author_user_id
    where comment.post_id = ${postId}
    order by comment.created_at asc, comment.id asc
    limit 500
  `);
  const comments = rawRows<{
    id: string;
    body: string;
    parent_comment_id: string | null;
    depth: number;
    created_at: Date | string;
    deleted_at: Date | string | null;
    author_id: string;
    author_name: string;
    author_username: string;
    author_avatar_url: string | null;
    like_count: number | string;
    liked_by_current_user: boolean;
  }>(result).map((row) => ({
    id: row.id,
    body: row.deleted_at ? "Comentário excluído" : row.body,
    createdAt: toIso(row.created_at),
    parentCommentId: row.parent_comment_id,
    depth: row.depth,
    likeCount: Number(row.like_count),
    likedByCurrentUser: mysqlBoolean(row.liked_by_current_user),
    canDelete: !row.deleted_at && row.author_id === actorUserId,
    deleted: Boolean(row.deleted_at),
    author: {
      id: row.author_id,
      name: row.author_name,
      username: row.author_username,
      avatarUrl: row.author_avatar_url,
    },
  }));

  const keptIds = new Set(
    comments.filter((comment) => !comment.deleted).map((comment) => comment.id),
  );
  let changed = true;
  while (changed) {
    changed = false;
    for (const comment of comments) {
      if (
        comment.parentCommentId &&
        keptIds.has(comment.id) &&
        !keptIds.has(comment.parentCommentId)
      ) {
        keptIds.add(comment.parentCommentId);
        changed = true;
      }
    }
  }
  const visible = comments.filter((comment) => keptIds.has(comment.id));
  const children = new Map<string | null, SocialComment[]>();
  for (const comment of visible) {
    const parentId = keptIds.has(comment.parentCommentId ?? "")
      ? comment.parentCommentId
      : null;
    children.set(parentId, [...(children.get(parentId) ?? []), comment]);
  }
  const ordered: SocialComment[] = [];
  const appendChildren = (parentId: string | null) => {
    for (const comment of children.get(parentId) ?? []) {
      ordered.push(comment);
      appendChildren(comment.id);
    }
  };
  appendChildren(null);
  return ordered;
}

export async function createPostComment(
  database: Database,
  actorUserId: string,
  postId: string,
  body: string,
  parentCommentId?: string,
): Promise<{ comment: SocialComment; interaction: SocialPostInteraction }> {
  await assertCanInteractWithPost(database, actorUserId, postId);
  return database.transaction(async (transaction) => {
    let depth = 0;
    if (parentCommentId) {
      const [parent] = await transaction
        .select({ id: socialPostComments.id, depth: socialPostComments.depth })
        .from(socialPostComments)
        .where(
          and(
            eq(socialPostComments.id, parentCommentId),
            eq(socialPostComments.postId, postId),
            isNull(socialPostComments.deletedAt),
          ),
        );
      if (!parent) {
        throw new SocialOperationError(
          "Comentário original não encontrado.",
          404,
        );
      }
      if (parent.depth >= 10) {
        throw new SocialOperationError(
          "A conversa atingiu o limite de 10 níveis de respostas.",
          400,
        );
      }
      depth = parent.depth + 1;
    }
    const id = randomUUID();
    await transaction
      .insert(socialPostComments)
      .values({
        id,
        postId,
        parentCommentId: parentCommentId ?? null,
        authorUserId: actorUserId,
        body: body.trim(),
        depth,
      })
      ;
    if (!id) {
      throw new SocialOperationError("Não foi possível comentar.", 500);
    }
    const comments = await readPostComments(
      transaction as Database,
      actorUserId,
      postId,
    );
    return {
      comment: comments.find((comment) => comment.id === id)!,
      interaction: await interactionForPost(
        transaction as Database,
        actorUserId,
        postId,
      ),
    };
  });
}

export async function deletePostComment(
  database: Database,
  actorUserId: string,
  postId: string,
  commentId: string,
): Promise<{ comments: SocialComment[]; interaction: SocialPostInteraction }> {
  const deleted = await database
    .update(socialPostComments)
    .set({ deletedAt: new Date(), updatedAt: new Date() })
    .where(
      and(
        eq(socialPostComments.id, commentId),
        eq(socialPostComments.postId, postId),
        eq(socialPostComments.authorUserId, actorUserId),
        isNull(socialPostComments.deletedAt),
      ),
    );
  if (affectedRows(deleted) !== 1) {
    throw new SocialOperationError(
      "Você só pode excluir seus próprios comentários.",
      403,
    );
  }
  return {
    comments: await readPostComments(database, actorUserId, postId),
    interaction: await interactionForPost(database, actorUserId, postId),
  };
}

async function commentLikeState(
  database: Database,
  actorUserId: string,
  commentId: string,
): Promise<{ likeCount: number; likedByCurrentUser: boolean }> {
  const result = await database.execute<{
    like_count: number | string;
    liked_by_current_user: boolean | number | string;
  }>(sql`
    select
      count(*) as like_count,
      coalesce(max(comment_like.user_id = ${actorUserId}), false)
        as liked_by_current_user
    from social_comment_likes comment_like
    where comment_like.comment_id = ${commentId}
  `);
  return {
    likeCount: Number(
      rawRows<{ like_count: number | string; liked_by_current_user: boolean }>(result)[0]
        ?.like_count ?? 0,
    ),
    likedByCurrentUser: mysqlBoolean(
      rawRows<{
        like_count: number | string;
        liked_by_current_user: boolean | number | string;
      }>(result)[0]?.liked_by_current_user,
    ),
  };
}

export async function setCommentLike(
  database: Database,
  actorUserId: string,
  postId: string,
  commentId: string,
  liked: boolean,
): Promise<{ likeCount: number; likedByCurrentUser: boolean }> {
  const [comment] = await database
    .select({ id: socialPostComments.id })
    .from(socialPostComments)
    .innerJoin(socialPosts, eq(socialPosts.id, socialPostComments.postId))
    .where(
      and(
        eq(socialPostComments.id, commentId),
        eq(socialPostComments.postId, postId),
        isNull(socialPostComments.deletedAt),
        isNull(socialPosts.deletedAt),
      ),
    );
  if (!comment) {
    throw new SocialOperationError("Comentário não encontrado.", 404);
  }
  if (liked) {
    await database
      .insert(socialCommentLikes)
      .values({ commentId, userId: actorUserId })
      .onDuplicateKeyUpdate({
        set: { commentId: sql`${socialCommentLikes.commentId}` },
      });
  } else {
    await database
      .delete(socialCommentLikes)
      .where(
        and(
          eq(socialCommentLikes.commentId, commentId),
          eq(socialCommentLikes.userId, actorUserId),
        ),
      );
  }
  return commentLikeState(database, actorUserId, commentId);
}
