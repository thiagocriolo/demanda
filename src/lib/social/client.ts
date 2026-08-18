import type {
  Community,
  CommunityFeedPage,
  CommunityInvitation,
  CommunityJoinRequest,
  CommunityMemberCandidate,
  CreateCommunityInput,
  CreateSocialPostInput,
  FeedPage,
  SocialComment,
  SocialCommentLike,
  SocialPost,
  SocialPostInteraction,
} from "./types";

async function parse<T>(response: Response): Promise<T> {
  if (response.ok) return (await response.json()) as T;
  const payload = (await response.json().catch(() => ({}))) as {
    message?: string;
  };
  throw new Error(payload.message ?? "Não foi possível concluir a operação.");
}

export function loadFeed(cursor?: string, fetcher: typeof fetch = fetch) {
  const query = cursor ? `?cursor=${encodeURIComponent(cursor)}` : "";
  return fetcher(`/api/social/feed${query}`).then(parse<FeedPage>);
}

export function loadPortfolios(cursor?: string, fetcher: typeof fetch = fetch) {
  const query = cursor ? `?cursor=${encodeURIComponent(cursor)}` : "";
  return fetcher(`/api/social/portfolio${query}`).then(
    parse<{ items: SocialPost[]; nextCursor: string | null }>,
  );
}

export function loadPortfolio(postId: string, fetcher: typeof fetch = fetch) {
  return fetcher(`/api/social/portfolio/${postId}`).then(parse<SocialPost>);
}

export function publishPost(
  input: CreateSocialPostInput,
  fetcher: typeof fetch = fetch,
) {
  const endpoint = input.kind === "feed" ? "feed" : "portfolio";
  return fetcher(`/api/social/${endpoint}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  }).then(parse<SocialPost>);
}

export function loadPost(postId: string, fetcher: typeof fetch = fetch) {
  return fetcher(`/api/social/posts/${postId}`).then(parse<SocialPost>);
}

export function updatePostText(
  postId: string,
  body: string,
  fetcher: typeof fetch = fetch,
) {
  return fetcher(`/api/social/posts/${postId}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ body }),
  }).then(parse<SocialPost>);
}

export function deletePost(postId: string, fetcher: typeof fetch = fetch) {
  return fetcher(`/api/social/posts/${postId}`, { method: "DELETE" }).then(
    parse<{ deleted: true }>,
  );
}

export function setPostLiked(
  postId: string,
  liked: boolean,
  fetcher: typeof fetch = fetch,
) {
  return fetcher(`/api/social/posts/${postId}/like`, {
    method: liked ? "POST" : "DELETE",
  }).then(parse<SocialPostInteraction>);
}

export function loadPostComments(
  postId: string,
  fetcher: typeof fetch = fetch,
) {
  return fetcher(`/api/social/posts/${postId}/comments`).then(
    parse<SocialComment[]>,
  );
}

export function publishPostComment(
  postId: string,
  body: string,
  parentCommentId?: string,
  fetcher: typeof fetch = fetch,
) {
  return fetcher(`/api/social/posts/${postId}/comments`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ body, parentCommentId }),
  }).then(
    parse<{ comment: SocialComment; interaction: SocialPostInteraction }>,
  );
}

export function deletePostComment(
  postId: string,
  commentId: string,
  fetcher: typeof fetch = fetch,
) {
  return fetcher(`/api/social/posts/${postId}/comments/${commentId}`, {
    method: "DELETE",
  }).then(
    parse<{ comments: SocialComment[]; interaction: SocialPostInteraction }>,
  );
}

export function setCommentLiked(
  postId: string,
  commentId: string,
  liked: boolean,
  fetcher: typeof fetch = fetch,
) {
  return fetcher(`/api/social/posts/${postId}/comments/${commentId}/like`, {
    method: liked ? "POST" : "DELETE",
  }).then(parse<SocialCommentLike>);
}

export function loadCommunities(fetcher: typeof fetch = fetch) {
  return fetcher("/api/social/communities").then(parse<Community[]>);
}

export function loadCommunity(
  communityId: string,
  fetcher: typeof fetch = fetch,
) {
  return fetcher(`/api/social/communities/${communityId}`).then(
    parse<Community>,
  );
}

export function createCommunity(
  input: CreateCommunityInput,
  fetcher: typeof fetch = fetch,
) {
  return fetcher("/api/social/communities", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  }).then(parse<Community>);
}

export function loadCommunityFeed(
  communityId: string,
  cursor?: string,
  fetcher: typeof fetch = fetch,
) {
  const query = cursor ? `?cursor=${encodeURIComponent(cursor)}` : "";
  return fetcher(`/api/social/communities/${communityId}/feed${query}`).then(
    parse<CommunityFeedPage>,
  );
}

export function publishCommunityPost(
  communityId: string,
  input: CreateSocialPostInput,
  fetcher: typeof fetch = fetch,
) {
  return fetcher(`/api/social/communities/${communityId}/feed`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  }).then(parse<SocialPost>);
}

export function promoteCommunityMember(
  communityId: string,
  userId: string,
  fetcher: typeof fetch = fetch,
) {
  return fetcher(`/api/social/communities/${communityId}/members/${userId}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ role: "admin" }),
  }).then(parse<Community>);
}

export function searchCommunityMemberCandidates(
  communityId: string,
  query: string,
  fetcher: typeof fetch = fetch,
  signal?: AbortSignal,
) {
  return fetcher(
    `/api/social/communities/${communityId}/members?q=${encodeURIComponent(query)}`,
    { signal },
  )
    .then(parse<{ results: CommunityMemberCandidate[] }>)
    .then((payload) => payload.results);
}

export function inviteCommunityMember(
  communityId: string,
  userId: string,
  fetcher: typeof fetch = fetch,
) {
  return fetcher(`/api/social/communities/${communityId}/members`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ userId }),
  }).then(parse<{ sent: true }>);
}

export function loadCommunityInvitations(fetcher: typeof fetch = fetch) {
  return fetcher("/api/social/community-invitations").then(
    parse<CommunityInvitation[]>,
  );
}

export function acceptCommunityInvitation(
  invitationId: string,
  fetcher: typeof fetch = fetch,
) {
  return fetcher(`/api/social/community-invitations/${invitationId}/accept`, {
    method: "POST",
  }).then(parse<Community>);
}

export function loadCommunityJoinRequests(
  communityId: string,
  fetcher: typeof fetch = fetch,
) {
  return fetcher(`/api/social/communities/${communityId}/requests`).then(
    parse<CommunityJoinRequest[]>,
  );
}

export function acceptCommunityJoinRequest(
  communityId: string,
  requestId: string,
  fetcher: typeof fetch = fetch,
) {
  return fetcher(
    `/api/social/communities/${communityId}/requests/${requestId}/accept`,
    { method: "POST" },
  ).then(parse<Community>);
}
