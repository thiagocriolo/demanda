<script lang="ts">
  import {
    ArrowUpRight,
    BriefcaseBusiness,
    ChevronLeft,
    ChevronRight,
    ExternalLink,
    Image as ImageIcon,
    LoaderCircle,
    MoreHorizontal,
    Pencil,
    Trash2,
    X,
  } from "@lucide/svelte";
  import { deletePost, updatePostText } from "./client";
  import SocialAvatar from "./SocialAvatar.svelte";
  import SocialInteraction from "./SocialInteraction.svelte";
  import { relativeTime } from "./time";
  import type {
    SocialPost,
    SocialPostBlock,
    SocialPostInteraction,
  } from "./types";

  let { post, onopen, oninteraction, onupdated, ondeleted } = $props<{
    post: SocialPost;
    onopen?: () => void;
    oninteraction?: (interaction: SocialPostInteraction) => void;
    onupdated?: (post: SocialPost) => void;
    ondeleted?: (postId: string) => void;
  }>();

  let updatedPost = $state<SocialPost | null>(null);
  let currentPost = $derived(updatedPost?.id === post.id ? updatedPost : post);
  let visible = $state(true);
  let menuOpen = $state(false);
  let editOpen = $state(false);
  let editBody = $state("");
  let actionBusy = $state(false);
  let actionError = $state("");

  let images = $derived(
    currentPost.blocks.filter(
      (block: SocialPost["blocks"][number]) => block.kind === "image",
    ),
  );
  let feedMedia = $derived(
    currentPost.blocks.filter(
      (block: SocialPost["blocks"][number]) =>
        block.kind === "image" || block.kind === "video",
    ),
  );
  let bodySegments = $derived(linkify(currentPost.body ?? ""));
  let activeMedia = $state(0);
  let carouselElement = $state<HTMLDivElement>();
  let dragOffset = $state(0);
  let isDragging = $state(false);
  let pointerId: number | null = null;
  let pointerStartX = 0;
  let pointerStartY = 0;
  let pointerStartedAt = 0;
  let horizontalDrag = false;

  function beginEdit(): void {
    if (!currentPost.canManage) return;
    editBody = currentPost.body ?? "";
    actionError = "";
    menuOpen = false;
    editOpen = true;
  }

  async function saveText(): Promise<void> {
    if (actionBusy) return;
    actionBusy = true;
    actionError = "";
    try {
      updatedPost = await updatePostText(currentPost.id, editBody);
      editOpen = false;
      onupdated?.(updatedPost);
    } catch (cause) {
      actionError =
        cause instanceof Error ? cause.message : "Não foi possível editar.";
    } finally {
      actionBusy = false;
    }
  }

  async function removePost(): Promise<void> {
    menuOpen = false;
    if (
      !currentPost.canManage ||
      actionBusy ||
      !confirm("Excluir esta publicação? Esta ação não pode ser desfeita.")
    ) {
      return;
    }
    actionBusy = true;
    actionError = "";
    try {
      await deletePost(currentPost.id);
      visible = false;
      ondeleted?.(currentPost.id);
    } catch (cause) {
      actionError =
        cause instanceof Error ? cause.message : "Não foi possível excluir.";
    } finally {
      actionBusy = false;
    }
  }

  function previousMedia(): void {
    activeMedia = Math.max(0, activeMedia - 1);
  }

  function nextMedia(): void {
    activeMedia = Math.min(feedMedia.length - 1, activeMedia + 1);
  }

  function selectMedia(index: number): void {
    activeMedia = index;
  }

  function startDrag(event: PointerEvent): void {
    if (
      !event.isPrimary ||
      (event.pointerType === "mouse" && event.button !== 0)
    ) {
      return;
    }
    if ((event.target as HTMLElement).closest("button")) return;

    pointerId = event.pointerId;
    pointerStartX = event.clientX;
    pointerStartY = event.clientY;
    pointerStartedAt = performance.now();
    horizontalDrag = false;
    dragOffset = 0;
  }

  function drag(event: PointerEvent): void {
    if (event.pointerId !== pointerId) return;

    const offsetX = event.clientX - pointerStartX;
    const offsetY = event.clientY - pointerStartY;
    if (!horizontalDrag && Math.abs(offsetX) < 8) return;
    if (!horizontalDrag && Math.abs(offsetY) > Math.abs(offsetX)) {
      pointerId = null;
      return;
    }

    horizontalDrag = true;
    isDragging = true;
    carouselElement?.setPointerCapture(event.pointerId);

    const isPastStart = activeMedia === 0 && offsetX > 0;
    const isPastEnd = activeMedia === feedMedia.length - 1 && offsetX < 0;
    dragOffset = isPastStart || isPastEnd ? offsetX * 0.22 : offsetX;
  }

  function finishDrag(event: PointerEvent): void {
    if (event.pointerId !== pointerId) return;

    const elapsed = Math.max(performance.now() - pointerStartedAt, 1);
    const velocity = dragOffset / elapsed;
    const threshold = Math.min(
      (carouselElement?.clientWidth ?? 400) * 0.18,
      90,
    );

    if (horizontalDrag) {
      if (
        (dragOffset < -threshold || velocity < -0.5) &&
        activeMedia < feedMedia.length - 1
      ) {
        nextMedia();
      } else if (
        (dragOffset > threshold || velocity > 0.5) &&
        activeMedia > 0
      ) {
        previousMedia();
      }
    }

    if (carouselElement?.hasPointerCapture(event.pointerId)) {
      carouselElement.releasePointerCapture(event.pointerId);
    }
    pointerId = null;
    horizontalDrag = false;
    isDragging = false;
    dragOffset = 0;
  }

  function mediaUrl(block: SocialPostBlock): string | null {
    return block.kind === "image" ? block.imageUrl : block.videoUrl;
  }

  function linkify(value: string): Array<{ text: string; href?: string }> {
    const segments: Array<{ text: string; href?: string }> = [];
    const expression = /\b(?:https?:\/\/|www\.)[^\s<]+/giu;
    let start = 0;
    for (const match of value.matchAll(expression)) {
      const index = match.index ?? 0;
      if (index > start) segments.push({ text: value.slice(start, index) });
      const raw = match[0];
      const url = raw.replace(/[),.!?;:]+$/gu, "");
      const trailing = raw.slice(url.length);
      segments.push({
        text: url,
        href: url.startsWith("www.") ? `https://${url}` : url,
      });
      if (trailing) segments.push({ text: trailing });
      start = index + raw.length;
    }
    if (start < value.length) segments.push({ text: value.slice(start) });
    return segments;
  }
</script>

<svelte:window
  onclick={() => (menuOpen = false)}
  onkeydown={(event) => {
    if (event.key === "Escape") {
      menuOpen = false;
      if (!actionBusy) editOpen = false;
    }
  }}
/>

{#if visible}
  <article class:portfolio={currentPost.kind === "portfolio"} class="post-card">
    <header>
      <SocialAvatar
        src={currentPost.author.avatarUrl}
        name={currentPost.author.name}
      />
      <div class="post-identity">
        <strong>{currentPost.author.name}</strong>
        <span
          >@{currentPost.author.username} · {relativeTime(
            currentPost.createdAt,
          )}</span
        >
      </div>
      {#if currentPost.kind === "portfolio"}
        <span class="post-type"><BriefcaseBusiness size={14} />Portfólio</span>
      {/if}
      {#if currentPost.viewerAuthenticated}
        <div class="post-menu">
          <button
            class="menu-trigger"
            type="button"
            aria-label="Ações da publicação"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            onclick={(event) => {
              event.stopPropagation();
              menuOpen = !menuOpen;
            }}><MoreHorizontal size={20} /></button
          >
          {#if menuOpen}
            <div class="menu-popover" role="menu" tabindex="-1">
              <button
                class="danger"
                type="button"
                role="menuitem"
                disabled={!currentPost.canManage || actionBusy}
                title={!currentPost.canManage
                  ? "Somente o autor pode excluir"
                  : undefined}
                onclick={removePost}><Trash2 size={16} />Excluir</button
              >
              <button
                type="button"
                role="menuitem"
                disabled={!currentPost.canManage || actionBusy}
                title={!currentPost.canManage
                  ? "Somente o autor pode editar"
                  : undefined}
                onclick={beginEdit}><Pencil size={16} />Editar</button
              >
              <a
                role="menuitem"
                href={`/social/publicacoes/${currentPost.id}`}
                target="_blank"
                rel="noopener noreferrer"><ExternalLink size={16} />Ver</a
              >
            </div>
          {/if}
        </div>
      {/if}
    </header>

    {#if currentPost.kind === "portfolio"}
      <button
        class="portfolio-open"
        type="button"
        onclick={onopen}
        aria-label={`Abrir portfólio ${currentPost.title}`}
      >
        {#if images[0]?.imageUrl}
          <img
            src={images[0].imageUrl}
            alt={images[0].caption ?? currentPost.title ?? "Capa do portfólio"}
          />
        {:else}
          <span class="image-placeholder"><ImageIcon size={28} /></span>
        {/if}
        <span class="portfolio-copy">
          <strong>{currentPost.title}</strong>
          {#if currentPost.body}<span>{currentPost.body}</span>{/if}
          <small>Ver projeto completo <ArrowUpRight size={14} /></small>
        </span>
      </button>
    {:else}
      {#if currentPost.body}
        <p class="body">
          {#each bodySegments as segment}
            {#if segment.href}
              <a href={segment.href} target="_blank" rel="noreferrer"
                >{segment.text}</a
              >
            {:else}{segment.text}{/if}
          {/each}
        </p>
      {/if}
      {#if feedMedia[0] && mediaUrl(feedMedia[0])}
        {#if feedMedia.length === 1}
          {#if feedMedia[0].kind === "image"}
            <img
              class="feed-image"
              src={feedMedia[0].imageUrl}
              alt={feedMedia[0].caption ?? "Imagem da publicação"}
            />
          {:else}
            <video class="feed-video" controls preload="metadata">
              <source
                src={feedMedia[0].videoUrl}
                type={feedMedia[0].mimeType ?? undefined}
              />
              Seu navegador não consegue reproduzir este vídeo.
            </video>
          {/if}
        {:else}
          <div
            bind:this={carouselElement}
            class="carousel"
            class:dragging={isDragging}
            role="region"
            aria-label={`Carrossel com ${feedMedia.length} arquivos de mídia`}
            onpointerdown={startDrag}
            onpointermove={drag}
            onpointerup={finishDrag}
            onpointercancel={finishDrag}
          >
            <div
              class="carousel-track"
              style:transform={`translate3d(calc(${-activeMedia * 100}% + ${dragOffset}px), 0, 0)`}
            >
              {#each feedMedia as item, index}
                <div
                  class="carousel-slide"
                  aria-hidden={index === activeMedia ? undefined : "true"}
                >
                  {#if item.kind === "image"}
                    <img
                      class="feed-image"
                      src={item.imageUrl}
                      alt={item.caption ??
                        `Mídia ${index + 1} de ${feedMedia.length}`}
                      draggable="false"
                    />
                  {:else}
                    <video
                      class="feed-video"
                      controls
                      preload="metadata"
                      tabindex={index === activeMedia ? 0 : -1}
                    >
                      <source
                        src={item.videoUrl}
                        type={item.mimeType ?? undefined}
                      />
                      Seu navegador não consegue reproduzir este vídeo.
                    </video>
                  {/if}
                </div>
              {/each}
            </div>
            {#if activeMedia > 0}
              <button
                class="carousel-control previous"
                type="button"
                aria-label="Mídia anterior"
                onclick={previousMedia}><ChevronLeft size={20} /></button
              >
            {/if}
            {#if activeMedia < feedMedia.length - 1}
              <button
                class="carousel-control next"
                type="button"
                aria-label="Próxima mídia"
                onclick={nextMedia}><ChevronRight size={20} /></button
              >
            {/if}
            <span class="counter">{activeMedia + 1}/{feedMedia.length}</span>
            <div class="dots" aria-label="Escolher mídia">
              {#each feedMedia as _, index}
                <button
                  class:active={index === activeMedia}
                  type="button"
                  aria-label={`Mostrar mídia ${index + 1}`}
                  aria-current={index === activeMedia ? "true" : undefined}
                  onclick={() => selectMedia(index)}
                ></button>
              {/each}
            </div>
          </div>
        {/if}
      {/if}
      {#if currentPost.linkUrl}
        <a
          class="link"
          href={currentPost.linkUrl}
          target="_blank"
          rel="noreferrer"
        >
          <span>{currentPost.linkUrl}</span><ArrowUpRight size={16} />
        </a>
      {/if}
    {/if}

    <SocialInteraction post={currentPost} {oninteraction} />
    {#if actionError && !editOpen}<p class="action-error" role="alert">
        {actionError}
      </p>{/if}
  </article>

  {#if editOpen}
    <div class="edit-backdrop" role="presentation">
      <div
        class="edit-dialog"
        role="dialog"
        tabindex="-1"
        aria-modal="true"
        aria-labelledby={`edit-title-${currentPost.id}`}
      >
        <header>
          <div>
            <h2 id={`edit-title-${currentPost.id}`}>Editar publicação</h2>
            <p>Apenas o texto será alterado. A mídia continuará igual.</p>
          </div>
          <button
            class="dialog-close"
            type="button"
            aria-label="Fechar"
            disabled={actionBusy}
            onclick={() => (editOpen = false)}><X size={18} /></button
          >
        </header>
        <textarea
          bind:value={editBody}
          maxlength="5000"
          rows="7"
          aria-label="Texto da publicação"
          placeholder="Escreva o texto da publicação"></textarea>
        <small>{editBody.length}/5000</small>
        {#if actionError}<p class="dialog-error" role="alert">
            {actionError}
          </p>{/if}
        <footer>
          <button
            type="button"
            disabled={actionBusy}
            onclick={() => (editOpen = false)}>Cancelar</button
          >
          <button
            class="save-button"
            type="button"
            disabled={actionBusy}
            onclick={saveText}
          >
            {#if actionBusy}<LoaderCircle class="spin" size={16} />{/if}
            Salvar
          </button>
        </footer>
      </div>
    </div>
  {/if}
{/if}

<style>
  .post-card {
    overflow: hidden;
    border: 1px solid var(--border);
    border-radius: 16px;
    background: var(--panel);
  }
  header {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 15px 17px 12px;
  }
  .post-identity {
    display: grid;
    min-width: 0;
    gap: 2px;
  }
  header strong {
    color: var(--ink-900, var(--ink-950));
    font-size: 13px;
  }
  header span {
    color: var(--ink-400);
    font-size: 11px;
  }
  .post-type {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    margin-left: auto;
    padding: 6px 8px;
    border-radius: 999px;
    color: var(--brand-700);
    background: var(--brand-50);
    font-weight: 600;
  }
  .post-menu {
    position: relative;
    margin-left: auto;
  }
  .post-type + .post-menu {
    margin-left: 0;
  }
  .menu-trigger,
  .dialog-close {
    display: grid;
    width: 34px;
    height: 34px;
    padding: 0;
    place-items: center;
    border: 0;
    border-radius: 50%;
    color: var(--ink-500);
    background: transparent;
  }
  .menu-trigger:hover,
  .menu-trigger:focus-visible,
  .dialog-close:hover {
    color: var(--ink-800);
    background: var(--surface-soft);
  }
  .menu-popover {
    position: absolute;
    z-index: 20;
    top: calc(100% + 5px);
    right: 0;
    display: grid;
    width: 154px;
    padding: 6px;
    border: 1px solid var(--border);
    border-radius: 12px;
    background: var(--panel);
    box-shadow: 0 14px 34px rgba(15, 23, 42, 0.16);
  }
  .menu-popover button,
  .menu-popover a {
    display: flex;
    min-height: 38px;
    align-items: center;
    gap: 9px;
    padding: 8px 10px;
    border: 0;
    border-radius: 8px;
    color: var(--ink-700);
    background: transparent;
    font: inherit;
    font-size: 12px;
    text-align: left;
  }
  .menu-popover button:hover:not(:disabled),
  .menu-popover a:hover {
    background: var(--surface-soft);
  }
  .menu-popover .danger {
    color: #b91c1c;
  }
  .menu-popover button:disabled {
    cursor: not-allowed;
    opacity: 0.42;
  }
  .action-error,
  .dialog-error {
    color: #b91c1c;
    font-size: 12px;
  }
  .action-error {
    padding: 10px 17px;
    border-top: 1px solid rgba(185, 28, 28, 0.15);
    background: rgba(185, 28, 28, 0.05);
  }
  .edit-backdrop {
    position: fixed;
    z-index: 1000;
    inset: 0;
    display: grid;
    place-items: center;
    padding: 20px;
    background: rgba(15, 23, 42, 0.48);
  }
  .edit-dialog {
    width: min(100%, 540px);
    padding: 20px;
    border: 1px solid var(--border);
    border-radius: 16px;
    background: var(--panel);
    box-shadow: 0 24px 70px rgba(15, 23, 42, 0.24);
  }
  .edit-dialog > header {
    align-items: flex-start;
    padding: 0 0 16px;
  }
  .edit-dialog h2 {
    color: var(--ink-900);
    font-size: 17px;
  }
  .edit-dialog header p {
    margin-top: 4px;
    color: var(--ink-500);
    font-size: 12px;
  }
  .edit-dialog textarea {
    width: 100%;
    resize: vertical;
    padding: 12px;
    border: 1px solid var(--border-strong);
    border-radius: 10px;
    color: var(--ink-900);
    background: var(--panel);
    font: inherit;
    font-size: 14px;
    line-height: 1.5;
  }
  .edit-dialog > small {
    display: block;
    margin-top: 5px;
    color: var(--ink-400);
    font-size: 10px;
    text-align: right;
  }
  .edit-dialog footer {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    margin-top: 18px;
  }
  .edit-dialog footer button {
    display: inline-flex;
    min-height: 38px;
    align-items: center;
    justify-content: center;
    gap: 7px;
    padding: 8px 14px;
    border: 1px solid var(--border);
    border-radius: 9px;
    color: var(--ink-700);
    background: var(--panel);
    font-weight: 600;
  }
  .edit-dialog footer .save-button {
    border-color: var(--brand-700);
    color: white;
    background: var(--brand-700);
  }
  :global(.spin) {
    animation: spin 0.8s linear infinite;
  }
  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }
  .body {
    padding: 2px 17px 14px;
    color: var(--ink-800);
    font-size: 14px;
    line-height: 1.55;
    white-space: pre-wrap;
  }
  .body a {
    color: var(--brand-700);
    text-decoration: underline;
    text-decoration-thickness: 1px;
    text-underline-offset: 2px;
  }
  .feed-image {
    display: block;
    width: 100%;
    max-height: 640px;
    object-fit: cover;
    border-top: 1px solid var(--border);
  }
  .feed-video {
    display: block;
    width: 100%;
    max-height: 640px;
    border-top: 1px solid var(--border);
    background: #0f172a;
  }
  .carousel {
    position: relative;
    overflow: hidden;
    border-top: 1px solid var(--border);
    background: #0f172a;
    touch-action: pan-y;
    user-select: none;
  }
  .carousel-track {
    display: flex;
    align-items: center;
    transition: transform 320ms cubic-bezier(0.22, 0.61, 0.36, 1);
    will-change: transform;
  }
  .carousel.dragging .carousel-track {
    transition: none;
  }
  .carousel-slide {
    flex: 0 0 100%;
    min-width: 0;
  }
  .carousel .feed-image,
  .carousel .feed-video {
    border-top: 0;
  }
  .carousel-control {
    position: absolute;
    top: 50%;
    display: grid;
    width: 38px;
    height: 38px;
    place-items: center;
    border: 0;
    border-radius: 50%;
    color: white;
    background: rgba(15, 23, 42, 0.7);
    transform: translateY(-50%);
  }
  .carousel-control:hover,
  .carousel-control:focus-visible {
    background: rgba(15, 23, 42, 0.9);
  }
  .previous {
    left: 12px;
  }
  .next {
    right: 12px;
  }
  .counter {
    position: absolute;
    top: 12px;
    right: 12px;
    padding: 5px 8px;
    border-radius: 999px;
    color: white;
    background: rgba(15, 23, 42, 0.72);
    font-size: 10px;
    font-weight: 700;
  }
  .dots {
    position: absolute;
    right: 0;
    bottom: 12px;
    left: 0;
    display: flex;
    justify-content: center;
    gap: 5px;
  }
  .dots button {
    width: 7px;
    height: 7px;
    padding: 0;
    border: 0;
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.55);
    box-shadow: 0 1px 3px rgba(15, 23, 42, 0.35);
  }
  .dots button.active {
    background: white;
    transform: scale(1.2);
  }
  .link {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 13px 17px;
    border-top: 1px solid var(--border);
    color: var(--brand-700);
    background: var(--surface-soft);
    font-size: 12px;
  }
  .link span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .portfolio-open {
    display: grid;
    width: 100%;
    padding: 0;
    border: 0;
    color: inherit;
    background: transparent;
    text-align: left;
  }
  .portfolio-open > img,
  .image-placeholder {
    width: 100%;
    height: 300px;
    object-fit: cover;
  }
  .image-placeholder {
    display: grid;
    place-items: center;
    color: var(--ink-400);
    background: var(--surface-soft);
  }
  .portfolio-copy {
    display: grid;
    gap: 5px;
    padding: 16px 17px 18px;
  }
  .portfolio-copy > strong {
    color: var(--ink-950);
    font-size: 18px;
  }
  .portfolio-copy > span {
    color: var(--ink-500);
    font-size: 12px;
    line-height: 1.45;
  }
  .portfolio-copy small {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    margin-top: 5px;
    color: var(--brand-700);
    font-weight: 600;
  }
  @media (max-width: 520px) {
    .portfolio-open > img,
    .image-placeholder {
      height: 220px;
    }
  }
</style>
