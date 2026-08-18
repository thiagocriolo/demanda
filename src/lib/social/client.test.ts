import { describe, expect, it, vi } from "vitest";
import {
  inviteCommunityMember,
  deletePost,
  deletePostComment,
  loadPostComments,
  publishPostComment,
  searchCommunityMemberCandidates,
  setCommentLiked,
  setPostLiked,
  updatePostText,
} from "./client";

describe("cliente de interações sociais", () => {
  it("edita o texto e exclui uma publicação", async () => {
    const post = { id: "post-1", body: "Texto atualizado" };
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json(post))
      .mockResolvedValueOnce(Response.json({ deleted: true }));

    await expect(
      updatePostText("post-1", "Texto atualizado", fetcher),
    ).resolves.toEqual(post);
    await expect(deletePost("post-1", fetcher)).resolves.toEqual({
      deleted: true,
    });

    expect(fetcher.mock.calls[0]?.slice(0, 2)).toEqual([
      "/api/social/posts/post-1",
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ body: "Texto atualizado" }),
      },
    ]);
    expect(fetcher.mock.calls[1]?.slice(0, 2)).toEqual([
      "/api/social/posts/post-1",
      { method: "DELETE" },
    ]);
  });

  it("curte e descurte uma publicação", async () => {
    const interaction = {
      likeCount: 1,
      commentCount: 0,
      likedByCurrentUser: true,
    };
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json(interaction))
      .mockResolvedValueOnce(
        Response.json({
          ...interaction,
          likeCount: 0,
          likedByCurrentUser: false,
        }),
      );

    await expect(setPostLiked("post-1", true, fetcher)).resolves.toEqual(
      interaction,
    );
    await setPostLiked("post-1", false, fetcher);

    expect(fetcher.mock.calls[0]?.slice(0, 2)).toEqual([
      "/api/social/posts/post-1/like",
      { method: "POST" },
    ]);
    expect(fetcher.mock.calls[1]?.slice(0, 2)).toEqual([
      "/api/social/posts/post-1/like",
      { method: "DELETE" },
    ]);
  });

  it("lista e publica comentários", async () => {
    const comment = {
      id: "comment-1",
      body: "Muito bom!",
      createdAt: "2026-08-11T12:00:00.000Z",
      author: {
        id: "user-1",
        name: "Pessoa",
        username: "pessoa",
        avatarUrl: null,
      },
    };
    const interaction = {
      likeCount: 0,
      commentCount: 1,
      likedByCurrentUser: false,
    };
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json([comment]))
      .mockResolvedValueOnce(Response.json({ comment, interaction }));

    await expect(loadPostComments("post-1", fetcher)).resolves.toEqual([
      comment,
    ]);
    await expect(
      publishPostComment("post-1", "Muito bom!", undefined, fetcher),
    ).resolves.toEqual({ comment, interaction });
    expect(fetcher.mock.calls[1]?.[1]).toMatchObject({
      method: "POST",
      body: JSON.stringify({ body: "Muito bom!" }),
    });
  });

  it("responde, curte e exclui comentários", async () => {
    const interaction = {
      likeCount: 0,
      commentCount: 1,
      likedByCurrentUser: false,
    };
    const comment = {
      id: "reply-1",
      body: "Uma resposta",
      createdAt: "2026-08-11T12:00:00.000Z",
      author: {
        id: "user-1",
        name: "Pessoa",
        username: "pessoa",
        avatarUrl: null,
      },
      parentCommentId: "comment-1",
      depth: 1,
      likeCount: 0,
      likedByCurrentUser: false,
      canDelete: true,
      deleted: false,
    };
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ comment, interaction }))
      .mockResolvedValueOnce(
        Response.json({ likeCount: 1, likedByCurrentUser: true }),
      )
      .mockResolvedValueOnce(Response.json({ comments: [], interaction }));

    await publishPostComment("post-1", "Uma resposta", "comment-1", fetcher);
    await setCommentLiked("post-1", "reply-1", true, fetcher);
    await deletePostComment("post-1", "reply-1", fetcher);

    expect(fetcher.mock.calls[0]?.[1]).toMatchObject({
      body: JSON.stringify({
        body: "Uma resposta",
        parentCommentId: "comment-1",
      }),
    });
    expect(fetcher.mock.calls[1]?.slice(0, 2)).toEqual([
      "/api/social/posts/post-1/comments/reply-1/like",
      { method: "POST" },
    ]);
    expect(fetcher.mock.calls[2]?.slice(0, 2)).toEqual([
      "/api/social/posts/post-1/comments/reply-1",
      { method: "DELETE" },
    ]);
  });

  it("busca pessoas e envia convites para uma comunidade", async () => {
    const candidate = {
      id: "815126fb-f8cc-4f55-837f-43207c520660",
      username: "fulanodetal",
      name: "Fulano de Tal",
      avatarUrl: null,
    };
    const sent = { sent: true };
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ results: [candidate] }))
      .mockResolvedValueOnce(Response.json(sent, { status: 201 }));

    await expect(
      searchCommunityMemberCandidates("design", "@fulano", fetcher),
    ).resolves.toEqual([candidate]);
    await expect(
      inviteCommunityMember("design", candidate.id, fetcher),
    ).resolves.toEqual(sent);

    expect(String(fetcher.mock.calls[0]?.[0])).toBe(
      "/api/social/communities/design/members?q=%40fulano",
    );
    expect(fetcher.mock.calls[1]?.slice(0, 2)).toEqual([
      "/api/social/communities/design/members",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ userId: candidate.id }),
      },
    ]);
  });
});
