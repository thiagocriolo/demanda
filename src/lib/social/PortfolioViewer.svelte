<script lang="ts">
  import { onMount } from "svelte";
  import { ArrowUpRight, X } from "@lucide/svelte";
  import SocialAvatar from "./SocialAvatar.svelte";
  import SocialInteraction from "./SocialInteraction.svelte";
  import { relativeTime } from "./time";
  import type { SocialPost, SocialPostInteraction } from "./types";

  let { post, onclose, oninteraction } = $props<{
    post: SocialPost;
    onclose: () => void;
    oninteraction?: (interaction: SocialPostInteraction) => void;
  }>();

  let viewer = $state<HTMLDivElement>();
  let closeButton = $state<HTMLButtonElement>();

  onMount(() => {
    const previouslyFocused =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeButton?.focus();

    return () => {
      document.body.style.overflow = previousOverflow;
      previouslyFocused?.focus();
    };
  });

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === "Escape") {
      event.preventDefault();
      onclose();
      return;
    }
    if (event.key !== "Tab" || !viewer) return;

    const focusable = Array.from(
      viewer.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), video[controls], [tabindex]:not([tabindex="-1"])',
      ),
    ).filter((element) => !element.hasAttribute("hidden"));
    const first = focusable[0];
    const last = focusable.at(-1);
    if (!first || !last) {
      event.preventDefault();
      return;
    }
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }
</script>

<svelte:window onkeydown={handleKeydown} />

<div
  class="backdrop"
  role="presentation"
  onclick={(event) => {
    if (event.target === event.currentTarget) onclose();
  }}
>
  <div
    bind:this={viewer}
    class="viewer"
    role="dialog"
    aria-modal="true"
    aria-labelledby="portfolio-title"
  >
    <button
      bind:this={closeButton}
      class="close"
      type="button"
      aria-label="Fechar portfólio"
      onclick={onclose}><X size={20} /></button
    >
    <header>
      <SocialAvatar
        src={post.author.avatarUrl}
        name={post.author.name}
        size={48}
      />
      <div>
        <strong>{post.author.name}</strong><span
          >@{post.author.username} · {relativeTime(post.createdAt)}</span
        >
      </div>
    </header>
    <section class="intro">
      <h1 id="portfolio-title">{post.title}</h1>
      {#if post.body}<p>{post.body}</p>{/if}
      {#if post.linkUrl}
        <a
          class="project-link"
          href={post.linkUrl}
          target="_blank"
          rel="noreferrer"
        >
          Visitar projeto <ArrowUpRight size={17} />
        </a>
      {/if}
    </section>
    <div class="blocks">
      {#each post.blocks as block (block.id)}
        {#if block.kind === "image" && block.imageUrl}
          <figure>
            <img
              src={block.imageUrl}
              alt={block.caption ?? post.title ?? "Imagem do projeto"}
            />
            {#if block.caption}<figcaption>{block.caption}</figcaption>{/if}
          </figure>
        {:else if block.kind === "video" && block.videoUrl}
          <figure>
            <video controls preload="metadata" playsinline>
              <source src={block.videoUrl} type={block.mimeType ?? undefined} />
              Seu navegador não consegue reproduzir este vídeo.
            </video>
            {#if block.caption}<figcaption>{block.caption}</figcaption>{/if}
          </figure>
        {:else if block.kind === "text"}
          <p class="text-block">{block.text}</p>
        {/if}
      {/each}
    </div>
    <SocialInteraction {post} {oninteraction} />
    <footer>
      <SocialAvatar
        src={post.author.avatarUrl}
        name={post.author.name}
        size={56}
      />
      <strong>{post.author.name}</strong>
      <span>@{post.author.username}</span>
    </footer>
  </div>
</div>

<style>
  .backdrop {
    position: fixed;
    z-index: 100;
    inset: 0;
    overflow-y: auto;
    padding: 24px;
    background: rgba(10, 16, 30, 0.78);
    backdrop-filter: blur(4px);
  }
  .viewer {
    position: relative;
    width: min(var(--social-content-width), 100%);
    min-height: 100%;
    margin: 0 auto;
    overflow: hidden;
    border-radius: 18px;
    background: #fff;
    box-shadow: 0 30px 90px rgba(0, 0, 0, 0.28);
  }
  .close {
    position: sticky;
    z-index: 4;
    top: 14px;
    float: right;
    display: grid;
    width: 38px;
    height: 38px;
    margin: 14px 14px -52px;
    place-items: center;
    border: 0;
    border-radius: 50%;
    color: white;
    background: rgba(15, 23, 42, 0.74);
    backdrop-filter: blur(8px);
  }
  header {
    display: flex;
    align-items: center;
    gap: 11px;
    padding: 18px 24px;
    border-bottom: 1px solid var(--border);
  }
  header div {
    display: grid;
    gap: 2px;
  }
  header strong {
    color: var(--ink-800);
    font-size: 13px;
  }
  header span {
    color: var(--ink-400);
    font-size: 10px;
  }
  .intro {
    display: grid;
    justify-items: center;
    padding: 64px 28px 50px;
    background: linear-gradient(145deg, #f3f6ff, #fff 60%);
    text-align: center;
  }
  .intro h1 {
    max-width: 780px;
    color: var(--ink-950);
    font-size: clamp(30px, 5vw, 58px);
    line-height: 1.06;
    overflow-wrap: anywhere;
  }
  .intro p {
    max-width: 650px;
    margin-top: 18px;
    color: var(--ink-500);
    font-size: 14px;
    line-height: 1.6;
    white-space: pre-wrap;
  }
  .project-link {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    margin-top: 22px;
    padding: 10px 14px;
    border: 1px solid color-mix(in srgb, var(--brand-500) 28%, transparent);
    border-radius: 10px;
    color: var(--brand-700);
    background: color-mix(in srgb, var(--brand-500) 7%, white);
    font-size: 12px;
    font-weight: 700;
  }
  .blocks {
    display: grid;
    gap: 0;
  }
  figure {
    margin: 0;
    background: #f5f5f5;
  }
  figure img,
  figure video {
    display: block;
    width: 100%;
    max-height: 1100px;
    object-fit: contain;
  }
  figcaption {
    padding: 10px 18px 12px;
    color: var(--ink-500);
    background: white;
    font-size: 11px;
    line-height: 1.5;
    text-align: center;
  }
  .text-block {
    max-width: 720px;
    margin: 0 auto;
    padding: 56px 28px;
    color: var(--ink-700);
    font-size: clamp(16px, 2vw, 21px);
    line-height: 1.7;
    white-space: pre-wrap;
  }
  footer {
    display: grid;
    justify-items: center;
    padding: 52px 24px;
    border-top: 1px solid var(--border);
    background: var(--surface-soft);
  }
  footer strong {
    margin-top: 10px;
    color: var(--ink-800);
    font-size: 14px;
  }
  footer span {
    margin-top: 2px;
    color: var(--brand-600);
    font-size: 10px;
  }
  @media (max-width: 600px) {
    .backdrop {
      padding: 0;
    }
    .viewer {
      border-radius: 0;
    }
    header {
      padding-inline: 14px;
    }
    .intro {
      padding: 50px 18px 38px;
    }
  }
</style>
