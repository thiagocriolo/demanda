export type SocialAuthor = {
  id: string;
  name: string;
  username: string;
  avatarUrl: string | null;
  coverUrl?: string | null;
};

export type SocialPostBlock = {
  id: string;
  kind: "text" | "image" | "video";
  text: string | null;
  imageUrl: string | null;
  videoUrl: string | null;
  mimeType: string | null;
  caption: string | null;
  position: number;
};

export type SocialPost = {
  id: string;
  kind: "feed" | "portfolio";
  title: string | null;
  body: string | null;
  linkUrl: string | null;
  createdAt: string;
  author: SocialAuthor;
  blocks: SocialPostBlock[];
  likeCount: number;
  commentCount: number;
  likedByCurrentUser: boolean;
  canInteract: boolean;
  canManage: boolean;
  viewerAuthenticated: boolean;
};

export type SocialComment = {
  id: string;
  body: string;
  createdAt: string;
  author: SocialAuthor;
  parentCommentId: string | null;
  depth: number;
  likeCount: number;
  likedByCurrentUser: boolean;
  canDelete: boolean;
  deleted: boolean;
};

export type SocialCommentLike = {
  likeCount: number;
  likedByCurrentUser: boolean;
};

export type SocialPostInteraction = {
  likeCount: number;
  commentCount: number;
  likedByCurrentUser: boolean;
};

export type PublicUserProfile = {
  id: string;
  username: string;
  name: string;
  profession: string;
  bio: string;
  email: string;
  phone: string;
  photo: string;
  cover: string;
  avatarImage: string;
  avatarColor: string;
};

export type FeedPostItem = {
  id: string;
  kind: "post";
  occurredAt: string;
  post: SocialPost;
};

export type FeedActivityItem = {
  id: string;
  kind: "activity";
  occurredAt: string;
  entity: "workspace" | "project" | "task";
  title: string;
  context: string | null;
  actor: SocialAuthor | null;
};

export type FeedConnectionItem = {
  id: string;
  kind: "connection";
  occurredAt: string;
  people: [SocialAuthor, SocialAuthor];
};

export type FeedItem = FeedPostItem | FeedActivityItem | FeedConnectionItem;

export type FeedPage = {
  items: FeedItem[];
  nextCursor: string | null;
};

export type CreateSocialPostInput = {
  kind: "feed" | "portfolio";
  title?: string;
  body?: string;
  linkUrl?: string;
  blocks: Array<
    | { kind: "text"; text: string }
    | { kind: "image"; fileId: string; caption?: string }
    | { kind: "video"; fileId: string; caption?: string }
  >;
};

export type CommunityVisibility = "public" | "private";
export type CommunityMemberRole = "owner" | "admin" | "member";

export type CommunityMember = {
  role: CommunityMemberRole;
  joinedAt: string;
  user: SocialAuthor;
};

export type CommunityMemberCandidate = SocialAuthor;

export type CommunityJoinRequest = {
  id: string;
  requestedAt: string;
  user: SocialAuthor;
};

export type CommunityInvitation = {
  id: string;
  invitedAt: string;
  community: {
    linkName: string;
    name: string;
    topic: string;
    coverUrl: string | null;
  };
  invitedBy: SocialAuthor;
};

export type Community = {
  id: string;
  linkName: string;
  name: string;
  description: string;
  topic: string;
  visibility: CommunityVisibility;
  coverUrl: string | null;
  memberCount: number;
  currentUserRole: CommunityMemberRole;
  createdAt: string;
  members: CommunityMember[];
};

export type CreateCommunityInput = {
  linkName: string;
  name: string;
  description: string;
  topic: string;
  visibility: CommunityVisibility;
  coverFileId?: string;
  memberUserIds: string[];
};

export type CommunityFeedPage = {
  items: SocialPost[];
  nextCursor: string | null;
};
