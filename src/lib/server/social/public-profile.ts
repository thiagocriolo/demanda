import { and, eq, isNull, sql } from "drizzle-orm";
import {
  DEFAULT_AVATAR_COLOR,
  DEFAULT_AVATAR_ID,
  parseAvatarProfileUrl,
} from "../../avatar/avatar-options";
import type { PublicUserProfile, SocialPost } from "$lib/social/types";
import type { PersonalSettingsState } from "$lib/settings/types";
import type { Database } from "../db/database";
import { userPreferences, users } from "../db/schema";
import { storedFileIdFromPrivateUrl } from "../files/service";
import { personalSettingsSchema } from "../settings/validation";
import { publicProfileMediaUrl } from "./profile-media";
import { hydratePosts, type PostRow } from "./service";

export type PublicProfileRelationship =
  "anonymous" | "self" | "none" | "outgoing" | "incoming" | "connected";

export type PublicUserPage = {
  profile: PublicUserProfile;
  posts: SocialPost[];
  relationship: PublicProfileRelationship;
  pendingRequestId: string | null;
  canViewPosts: boolean;
};

function publicFileUrl(url: string | null): string {
  return publicProfileMediaUrl(url) ?? "";
}

function profileFromRow(row: {
  id: string;
  username: string;
  name: string;
  email: string;
  avatarUrl: string | null;
  settings: Record<string, unknown> | null;
}): PublicUserProfile {
  const parsed = row.settings
    ? personalSettingsSchema.safeParse(row.settings)
    : null;
  const storedProfile: PersonalSettingsState["profile"] | null = parsed?.success
    ? parsed.data.profile
    : null;
  const generatedAvatar = parseAvatarProfileUrl(row.avatarUrl ?? "");
  const storedPhoto = storedProfile?.photo || row.avatarUrl || "";

  return {
    id: row.id,
    username: row.username,
    name: storedProfile?.name.trim() || row.name,
    profession: storedProfile?.profession.trim() || "",
    bio: storedProfile?.bio.trim() || "",
    email: storedProfile?.email.trim() || row.email,
    phone: storedProfile?.phone.trim() || "",
    photo: storedFileIdFromPrivateUrl(storedPhoto)
      ? publicFileUrl(storedPhoto)
      : "",
    cover: publicFileUrl(storedProfile?.cover ?? ""),
    avatarImage:
      storedProfile?.avatarImage ||
      generatedAvatar?.avatarImage ||
      DEFAULT_AVATAR_ID,
    avatarColor:
      storedProfile?.avatarColor ||
      generatedAvatar?.avatarColor ||
      DEFAULT_AVATAR_COLOR,
  };
}

export async function getPublicUserProfile(
  database: Database,
  username: string,
): Promise<PublicUserProfile | null> {
  const [row] = await database
    .select({
      id: users.id,
      username: users.username,
      name: users.name,
      email: users.email,
      avatarUrl: users.avatarUrl,
      settings: userPreferences.settings,
    })
    .from(users)
    .leftJoin(userPreferences, eq(userPreferences.userId, users.id))
    .where(
      and(eq(users.username, username.toLowerCase()), isNull(users.deletedAt)),
    )
    .limit(1);

  return row ? profileFromRow(row) : null;
}

async function profileRelationship(
  database: Database,
  profileUserId: string,
  actorUserId?: string,
): Promise<{
  relationship: PublicProfileRelationship;
  pendingRequestId: string | null;
}> {
  if (!actorUserId) {
    return { relationship: "anonymous", pendingRequestId: null };
  }
  if (actorUserId === profileUserId) {
    return { relationship: "self", pendingRequestId: null };
  }

  const result = await database.execute<{
    connected: boolean;
    request_id: string | null;
    requested_by_user_id: string | null;
  }>(sql`
    select
      exists (
        select 1
        from app.user_connections connection
        where (connection.user_a_id = ${actorUserId}::uuid
          and connection.user_b_id = ${profileUserId}::uuid)
           or (connection.user_b_id = ${actorUserId}::uuid
          and connection.user_a_id = ${profileUserId}::uuid)
      ) as connected,
      pending.id as request_id,
      pending.requested_by_user_id
    from (values (1)) as singleton(value)
    left join lateral (
      select request.id, request.requested_by_user_id
      from app.connection_requests request
      where request.status = 'pending'
        and ((request.user_a_id = ${actorUserId}::uuid
          and request.user_b_id = ${profileUserId}::uuid)
          or (request.user_b_id = ${actorUserId}::uuid
          and request.user_a_id = ${profileUserId}::uuid))
      limit 1
    ) pending on true
  `);
  const state = result.rows[0];
  if (state?.connected) {
    return { relationship: "connected", pendingRequestId: null };
  }
  if (state?.request_id) {
    return {
      relationship:
        state.requested_by_user_id === actorUserId ? "outgoing" : "incoming",
      pendingRequestId: state.request_id,
    };
  }
  return { relationship: "none", pendingRequestId: null };
}

async function latestProfileFeedPosts(
  database: Database,
  profile: PublicUserProfile,
  actorUserId: string,
  limit = 10,
): Promise<SocialPost[]> {
  const rows = await database.execute<PostRow>(sql`
    select
      post.id, post.kind, post.title, post.body, post.link_url, post.created_at,
      author.id as author_id, author.name as author_name,
      author.username as author_username, author.avatar_url as author_avatar_url
    from app.social_posts post
    inner join app.users author on author.id = post.author_user_id
    where post.author_user_id = ${profile.id}::uuid
      and post.kind = 'feed'
      and post.community_id is null
      and post.deleted_at is null
    order by post.created_at desc, post.id desc
    limit ${limit}
  `);

  return (await hydratePosts(database, rows.rows, actorUserId)).map((post) => ({
    ...post,
    author: {
      ...post.author,
      name: profile.name,
      username: profile.username,
      avatarUrl: profile.photo || post.author.avatarUrl,
    },
  }));
}

export async function getPublicUserPage(
  database: Database,
  username: string,
  actorUserId?: string,
): Promise<PublicUserPage | null> {
  const profile = await getPublicUserProfile(database, username);
  if (!profile) return null;

  const relation = await profileRelationship(database, profile.id, actorUserId);
  const canViewPosts =
    relation.relationship === "self" || relation.relationship === "connected";
  const posts =
    canViewPosts && actorUserId
      ? await latestProfileFeedPosts(database, profile, actorUserId)
      : [];

  return { profile, posts, canViewPosts, ...relation };
}

export async function getPublicUserPortfolio(
  database: Database,
  username: string,
  actorUserId?: string,
): Promise<{ profile: PublicUserProfile; posts: SocialPost[] } | null> {
  const profile = await getPublicUserProfile(database, username);
  if (!profile) return null;

  const rows = await database.execute<PostRow>(sql`
    select
      post.id, post.kind, post.title, post.body, post.link_url, post.created_at,
      author.id as author_id, author.name as author_name,
      author.username as author_username, author.avatar_url as author_avatar_url
    from app.social_posts post
    inner join app.users author on author.id = post.author_user_id
    where post.author_user_id = ${profile.id}::uuid
      and post.kind = 'portfolio'
      and post.community_id is null
      and post.deleted_at is null
    order by post.created_at desc, post.id desc
    limit 100
  `);
  const posts = (await hydratePosts(database, rows.rows, actorUserId)).map(
    (post) => ({
      ...post,
      author: {
        ...post.author,
        name: profile.name,
        username: profile.username,
        avatarUrl: profile.photo || post.author.avatarUrl,
      },
      blocks: post.blocks.map((block) => ({
        ...block,
        imageUrl: publicFileUrl(block.imageUrl),
        videoUrl: publicFileUrl(block.videoUrl),
      })),
    }),
  );

  return { profile, posts };
}
