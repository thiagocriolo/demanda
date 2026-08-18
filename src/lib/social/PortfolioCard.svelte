<script lang="ts">
  import { Image as ImageIcon } from "@lucide/svelte";
  import SocialAvatar from "./SocialAvatar.svelte";
  import type { SocialPost, SocialPostBlock } from "./types";

  let { post, onselect } = $props<{
    post: SocialPost;
    onselect: (post: SocialPost) => void;
  }>();

  let cover = $derived(
    post.blocks.find((block: SocialPostBlock) => block.kind === "image")
      ?.imageUrl ?? null,
  );
  let imageCount = $derived(
    post.blocks.filter((block: SocialPostBlock) => block.kind === "image")
      .length,
  );
</script>

<button class="project-card" type="button" onclick={() => onselect(post)}>
  <span class="cover">
    {#if cover}
      <img src={cover} alt={post.title ?? "Capa do portfólio"} loading="lazy" />
    {:else}
      <ImageIcon size={28} />
    {/if}
    <span>{imageCount} {imageCount === 1 ? "imagem" : "imagens"}</span>
  </span>
  <span class="card-copy">
    <strong>{post.title}</strong>
    {#if post.body}<small>{post.body}</small>{/if}
    <span>
      <SocialAvatar
        src={post.author.avatarUrl}
        name={post.author.name}
        size={26}
      />
      {post.author.name}
    </span>
  </span>
</button>

<style>
  .project-card {
    width: 100%;
    overflow: hidden;
    padding: 0;
    border: 1px solid var(--border);
    border-radius: 14px;
    color: inherit;
    background: var(--panel);
    text-align: left;
    transition:
      transform var(--motion-fast),
      box-shadow var(--motion-fast);
  }
  .project-card:hover {
    transform: translateY(-3px);
    box-shadow: var(--shadow-md);
  }
  .cover {
    position: relative;
    display: grid;
    height: 220px;
    place-items: center;
    overflow: hidden;
    color: var(--ink-400);
    background: var(--surface-soft);
  }
  .cover img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    transition: transform 0.35s ease;
  }
  .project-card:hover .cover img {
    transform: scale(1.025);
  }
  .cover > span {
    position: absolute;
    right: 9px;
    bottom: 9px;
    padding: 5px 7px;
    border-radius: 7px;
    color: white;
    background: rgba(15, 23, 42, 0.72);
    font-size: 9px;
  }
  .card-copy {
    display: grid;
    gap: 5px;
    padding: 14px;
  }
  .card-copy > strong {
    color: var(--ink-900, var(--ink-950));
    font-size: 15px;
    overflow-wrap: anywhere;
  }
  .card-copy > small {
    display: -webkit-box;
    overflow: hidden;
    color: var(--ink-500);
    font-size: 10px;
    line-height: 1.45;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    line-clamp: 2;
  }
  .card-copy > span {
    display: flex;
    align-items: center;
    gap: 7px;
    margin-top: 7px;
    color: var(--ink-500);
    font-size: 10px;
  }
</style>
