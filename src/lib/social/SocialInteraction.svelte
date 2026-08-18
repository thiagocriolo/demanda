<script lang="ts">
  import {
    Heart,
    LoaderCircle,
    MessageCircle,
    Send,
    Trash2,
    X,
  } from "@lucide/svelte";
  import {
    deletePostComment,
    loadPostComments,
    publishPostComment,
    setCommentLiked,
    setPostLiked,
  } from "./client";
  import SocialAvatar from "./SocialAvatar.svelte";
  import { relativeTime } from "./time";
  import type {
    SocialComment,
    SocialPost,
    SocialPostInteraction,
  } from "./types";

  let { post, oninteraction } = $props<{
    post: SocialPost;
    oninteraction?: (interaction: SocialPostInteraction) => void;
  }>();

  let activePostId = $state("");
  let likeCount = $state(0);
  let commentCount = $state(0);
  let liked = $state(false);
  let liking = $state(false);
  let commentsOpen = $state(false);
  let commentsLoaded = $state(false);
  let commentsLoading = $state(false);
  let comments = $state<SocialComment[]>([]);
  let replyingTo = $state<SocialComment | null>(null);
  let deletingCommentId = $state<string | null>(null);
  let likingCommentIds = $state<Set<string>>(new Set());
  let draft = $state("");
  let submitting = $state(false);
  let interactionError = $state("");

  $effect(() => {
    if (activePostId === post.id) return;
    activePostId = post.id;
    likeCount = post.likeCount;
    commentCount = post.commentCount;
    liked = post.likedByCurrentUser;
    commentsOpen = false;
    commentsLoaded = false;
    comments = [];
    replyingTo = null;
    draft = "";
    interactionError = "";
  });

  function applyInteraction(interaction: SocialPostInteraction, notify = true) {
    likeCount = interaction.likeCount;
    commentCount = interaction.commentCount;
    liked = interaction.likedByCurrentUser;
    if (notify) oninteraction?.(interaction);
  }

  async function toggleLike() {
    if (!post.canInteract || liking) return;
    const previous = { likeCount, commentCount, likedByCurrentUser: liked };
    liked = !liked;
    likeCount = Math.max(0, likeCount + (liked ? 1 : -1));
    liking = true;
    interactionError = "";
    try {
      applyInteraction(await setPostLiked(post.id, liked));
    } catch (cause) {
      applyInteraction(previous, false);
      interactionError =
        cause instanceof Error ? cause.message : "Não foi possível curtir.";
    } finally {
      liking = false;
    }
  }

  async function toggleComments() {
    if (!post.canInteract) return;
    commentsOpen = !commentsOpen;
    if (!commentsOpen || commentsLoaded || commentsLoading) return;
    commentsLoading = true;
    interactionError = "";
    try {
      comments = await loadPostComments(post.id);
      commentsLoaded = true;
    } catch (cause) {
      interactionError =
        cause instanceof Error
          ? cause.message
          : "Não foi possível carregar os comentários.";
    } finally {
      commentsLoading = false;
    }
  }

  async function submitComment(event: SubmitEvent) {
    event.preventDefault();
    const body = draft.trim();
    if (!body || submitting || !post.canInteract) return;
    submitting = true;
    interactionError = "";
    try {
      const result = await publishPostComment(post.id, body, replyingTo?.id);
      comments = orderComments([...comments, result.comment]);
      commentsLoaded = true;
      applyInteraction(result.interaction);
      draft = "";
      replyingTo = null;
    } catch (cause) {
      interactionError =
        cause instanceof Error ? cause.message : "Não foi possível comentar.";
    } finally {
      submitting = false;
    }
  }

  function orderComments(source: SocialComment[]) {
    const children = new Map<string | null, SocialComment[]>();
    const ids = new Set(source.map((comment) => comment.id));
    for (const comment of source) {
      const parentId =
        comment.parentCommentId && ids.has(comment.parentCommentId)
          ? comment.parentCommentId
          : null;
      children.set(parentId, [...(children.get(parentId) ?? []), comment]);
    }
    const ordered: SocialComment[] = [];
    const append = (parentId: string | null) => {
      for (const comment of children.get(parentId) ?? []) {
        ordered.push(comment);
        append(comment.id);
      }
    };
    append(null);
    return ordered;
  }

  function startReply(comment: SocialComment) {
    if (comment.deleted || comment.depth >= 10) return;
    replyingTo = comment;
    draft = "";
  }

  async function toggleCommentLike(comment: SocialComment) {
    if (comment.deleted || likingCommentIds.has(comment.id)) return;
    const previousLiked = comment.likedByCurrentUser;
    const previousCount = comment.likeCount;
    const likedNow = !previousLiked;
    comments = comments.map((item) =>
      item.id === comment.id
        ? {
            ...item,
            likedByCurrentUser: likedNow,
            likeCount: Math.max(0, previousCount + (likedNow ? 1 : -1)),
          }
        : item,
    );
    likingCommentIds = new Set([...likingCommentIds, comment.id]);
    interactionError = "";
    try {
      const result = await setCommentLiked(post.id, comment.id, likedNow);
      comments = comments.map((item) =>
        item.id === comment.id
          ? {
              ...item,
              likedByCurrentUser: result.likedByCurrentUser,
              likeCount: result.likeCount,
            }
          : item,
      );
    } catch (cause) {
      comments = comments.map((item) =>
        item.id === comment.id
          ? {
              ...item,
              likedByCurrentUser: previousLiked,
              likeCount: previousCount,
            }
          : item,
      );
      interactionError =
        cause instanceof Error
          ? cause.message
          : "Não foi possível curtir o comentário.";
    } finally {
      likingCommentIds = new Set(
        [...likingCommentIds].filter((id) => id !== comment.id),
      );
    }
  }

  async function removeComment(comment: SocialComment) {
    if (
      !comment.canDelete ||
      deletingCommentId ||
      !confirm("Excluir este comentário?")
    )
      return;
    deletingCommentId = comment.id;
    interactionError = "";
    try {
      const result = await deletePostComment(post.id, comment.id);
      comments = result.comments;
      applyInteraction(result.interaction);
      if (replyingTo?.id === comment.id) replyingTo = null;
    } catch (cause) {
      interactionError =
        cause instanceof Error
          ? cause.message
          : "Não foi possível excluir o comentário.";
    } finally {
      deletingCommentId = null;
    }
  }
</script>

<div class="social-interaction">
  <div class="actions" aria-label="Interações da publicação">
    <button
      class:liked
      type="button"
      onclick={toggleLike}
      disabled={!post.canInteract || liking}
      aria-label={liked ? "Descurtir publicação" : "Curtir publicação"}
      aria-pressed={liked}
      title={!post.canInteract ? "Disponível apenas para conexões" : undefined}
    >
      <Heart size={22} fill={liked ? "currentColor" : "none"} />
      <span>{likeCount} {likeCount === 1 ? "curtida" : "curtidas"}</span>
    </button>
    <button
      type="button"
      onclick={toggleComments}
      disabled={!post.canInteract}
      aria-expanded={commentsOpen}
      aria-label="Ver comentários"
      title={!post.canInteract ? "Disponível apenas para conexões" : undefined}
    >
      <MessageCircle size={22} />
      <span>
        {commentCount}
        {commentCount === 1 ? "comentário" : "comentários"}
      </span>
    </button>
  </div>

  {#if commentsOpen}
    <section class="comments" aria-label="Comentários">
      {#if commentsLoading}
        <p class="comments-status">
          <LoaderCircle class="spin" size={17} />Carregando comentários…
        </p>
      {:else if comments.length === 0}
        <p class="comments-status">Seja a primeira pessoa a comentar.</p>
      {:else}
        <div class="comment-list">
          {#each comments as comment (comment.id)}
            <article
              class:deleted={comment.deleted}
              class:nested={comment.depth > 0}
              class="comment"
              style={`--comment-depth:${Math.min(comment.depth, 5)}`}
            >
              {#if !comment.deleted}
                <SocialAvatar
                  src={comment.author.avatarUrl}
                  name={comment.author.name}
                  size={30}
                />
              {/if}
              <div class="comment-content">
                {#if comment.deleted}
                  <p class="deleted-copy">Comentário excluído</p>
                {:else}
                  <div class="comment-row">
                    <div class="comment-copy">
                      <p>
                        <strong>{comment.author.name}</strong>
                        {#if comment.parentCommentId}
                          <span class="reply-marker">respondeu</span>
                        {/if}
                        {comment.body}
                      </p>
                      <div class="comment-meta">
                        <small>{relativeTime(comment.createdAt)}</small>
                        {#if comment.depth < 10}
                          <button
                            type="button"
                            onclick={() => startReply(comment)}
                            >Responder</button
                          >
                        {:else}
                          <span class="depth-limit">Limite de respostas</span>
                        {/if}
                      </div>
                    </div>
                    <div class="comment-actions">
                      <button
                        class:liked={comment.likedByCurrentUser}
                        class="comment-like"
                        type="button"
                        onclick={() => toggleCommentLike(comment)}
                        disabled={likingCommentIds.has(comment.id)}
                        aria-label={comment.likedByCurrentUser
                          ? "Descurtir comentário"
                          : "Curtir comentário"}
                        aria-pressed={comment.likedByCurrentUser}
                        title={comment.likedByCurrentUser
                          ? "Descurtir comentário"
                          : "Curtir comentário"}
                      >
                        <Heart
                          size={14}
                          fill={comment.likedByCurrentUser
                            ? "currentColor"
                            : "none"}
                        />
                        {#if comment.likeCount > 0}
                          <span>{comment.likeCount}</span>
                        {/if}
                      </button>
                      {#if comment.canDelete}
                        <button
                          class="delete-comment"
                          type="button"
                          onclick={() => removeComment(comment)}
                          disabled={deletingCommentId === comment.id}
                          aria-label="Excluir comentário"
                          title="Excluir comentário"
                        >
                          {#if deletingCommentId === comment.id}
                            <LoaderCircle class="spin" size={14} />
                          {:else}
                            <Trash2 size={14} />
                          {/if}
                        </button>
                      {/if}
                    </div>
                  </div>
                {/if}
              </div>
            </article>
          {/each}
        </div>
      {/if}

      {#if replyingTo}
        <div class="replying-to">
          <span>
            Respondendo a <strong>@{replyingTo.author.username}</strong>
          </span>
          <button
            type="button"
            onclick={() => (replyingTo = null)}
            aria-label="Cancelar resposta"><X size={15} /></button
          >
        </div>
      {/if}
      <form onsubmit={submitComment}>
        <textarea
          bind:value={draft}
          maxlength="1000"
          rows="1"
          placeholder={replyingTo
            ? `Responder a @${replyingTo.author.username}…`
            : "Adicione um comentário…"}
          aria-label={replyingTo ? "Nova resposta" : "Novo comentário"}
        ></textarea>
        <button
          type="submit"
          disabled={!draft.trim() || submitting}
          aria-label="Publicar comentário"
        >
          {#if submitting}
            <LoaderCircle class="spin" size={18} />
          {:else}
            <Send size={18} />
          {/if}
        </button>
      </form>
    </section>
  {/if}

  {#if interactionError}
    <p class="interaction-error" role="alert">{interactionError}</p>
  {/if}
</div>

<style>
  .social-interaction {
    width: 100%;
  }
  .actions {
    display: flex;
    align-items: center;
    gap: 20px;
    padding: 11px 16px;
    border-top: 1px solid var(--border);
  }
  .actions button {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    padding: 3px 0;
    border: 0;
    color: var(--ink-500);
    background: transparent;
    font: inherit;
    cursor: pointer;
  }
  .actions button:hover:not(:disabled) {
    color: var(--ink-900);
  }
  .actions button.liked,
  .comment-actions button.liked {
    color: #e11d48;
  }
  .actions button:disabled,
  .comment-actions button:disabled {
    cursor: default;
    opacity: 0.5;
  }
  .actions span {
    font-size: 11px;
    font-weight: 600;
  }
  .comments {
    display: grid;
    gap: 13px;
    padding: 13px 16px 15px;
    border-top: 1px solid var(--border);
    background: var(--surface-soft);
  }
  .comments-status {
    display: flex;
    align-items: center;
    gap: 7px;
    margin: 0;
    color: var(--ink-400);
    font-size: 12px;
  }
  .comment-list {
    display: grid;
    gap: 12px;
  }
  .comment {
    display: flex;
    gap: 9px;
    margin-left: calc(var(--comment-depth) * 14px);
  }
  .comment.nested {
    padding-left: 9px;
    border-left: 2px solid color-mix(in srgb, var(--brand-500) 22%, transparent);
  }
  .comment-content {
    min-width: 0;
    flex: 1;
  }
  .comment-row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: start;
    gap: 10px;
    min-height: 32px;
  }
  .comment-copy {
    min-width: 0;
  }
  .comment p {
    margin: 0;
    color: var(--ink-700);
    font-size: 12px;
    line-height: 1.45;
    overflow-wrap: anywhere;
  }
  .comment p strong {
    margin-right: 3px;
    color: var(--ink-950);
  }
  .reply-marker {
    margin-right: 4px;
    color: var(--ink-400);
    font-size: 10px;
  }
  .comment-meta {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 9px;
    margin-top: 4px;
  }
  .comment-meta small,
  .depth-limit {
    color: var(--ink-400);
    font-size: 10px;
  }
  .comment-meta button,
  .comment-actions button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    border: 0;
    color: var(--ink-500);
    background: transparent;
    font: inherit;
    font-size: 10px;
    font-weight: 600;
    cursor: pointer;
  }
  .comment-meta button:hover:not(:disabled),
  .comment-actions button:hover:not(:disabled) {
    color: var(--ink-900);
  }
  .comment-actions {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 5px;
    min-width: 45px;
  }
  .comment-actions button {
    min-width: 20px;
    height: 22px;
    gap: 3px;
    border-radius: 6px;
  }
  .comment-actions button:hover:not(:disabled) {
    background: color-mix(in srgb, var(--ink-900) 6%, transparent);
  }
  .comment-actions .delete-comment {
    width: 0;
    min-width: 0;
    overflow: hidden;
    color: var(--danger-600, #dc2626);
    opacity: 0;
    pointer-events: none;
    transform: translateX(-3px);
    transition:
      width var(--motion-fast),
      opacity var(--motion-fast),
      transform var(--motion-fast);
  }
  .comment:hover .comment-actions .delete-comment,
  .comment:focus-within .comment-actions .delete-comment {
    width: 22px;
    min-width: 22px;
    opacity: 1;
    pointer-events: auto;
    transform: translateX(0);
  }
  .deleted-copy {
    color: var(--ink-400) !important;
    font-style: italic;
  }
  .comment.deleted {
    min-height: 24px;
    align-items: center;
  }
  .replying-to {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding: 7px 9px;
    border-radius: 9px;
    color: var(--ink-500);
    background: color-mix(in srgb, var(--brand-500) 7%, var(--panel));
    font-size: 10px;
  }
  .replying-to strong {
    color: var(--brand-700);
  }
  .replying-to button {
    display: grid;
    padding: 2px;
    border: 0;
    color: var(--ink-500);
    background: transparent;
    cursor: pointer;
  }
  form {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  textarea {
    width: 100%;
    min-height: 38px;
    max-height: 100px;
    resize: vertical;
    padding: 9px 11px;
    border: 1px solid var(--border);
    border-radius: 12px;
    color: var(--ink-900);
    background: var(--panel);
    font: inherit;
    font-size: 12px;
    line-height: 1.4;
  }
  textarea:focus {
    border-color: var(--brand-500);
    outline: 2px solid color-mix(in srgb, var(--brand-500) 24%, transparent);
  }
  form > button {
    display: grid;
    width: 38px;
    height: 38px;
    flex: 0 0 38px;
    place-items: center;
    border: 0;
    border-radius: 50%;
    color: white;
    background: var(--brand-600, var(--brand-700));
    cursor: pointer;
  }
  form > button:disabled {
    cursor: default;
    opacity: 0.45;
  }
  .interaction-error {
    margin: 0;
    padding: 0 16px 13px;
    color: var(--danger-600, #dc2626);
    font-size: 11px;
  }
  :global(.spin) {
    animation: spin 0.8s linear infinite;
  }
  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }
  @media (hover: none) {
    .comment-actions .delete-comment {
      width: 22px;
      min-width: 22px;
      opacity: 1;
      pointer-events: auto;
      transform: none;
    }
  }
  @media (max-width: 520px) {
    .actions {
      gap: 16px;
    }
    .comment {
      margin-left: calc(var(--comment-depth) * 9px);
    }
  }
</style>
