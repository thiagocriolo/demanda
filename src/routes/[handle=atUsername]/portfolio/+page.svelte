<script lang="ts">
  import { pushState, replaceState } from "$app/navigation";
  import { page } from "$app/state";
  import { BriefcaseBusiness } from "@lucide/svelte";
  import Avatar from "$lib/avatar/Avatar.svelte";
  import PortfolioCard from "$lib/social/PortfolioCard.svelte";
  import PortfolioViewer from "$lib/social/PortfolioViewer.svelte";
  import type { SocialPost, SocialPostInteraction } from "$lib/social/types";

  let { data } = $props();
  let interactionOverrides = $state<Record<string, SocialPostInteraction>>({});
  let posts: SocialPost[] = $derived(
    data.posts.map((post: SocialPost) => ({
      ...post,
      ...(interactionOverrides[post.id] ?? {}),
    })),
  );
  let selected: SocialPost | null = $derived.by(() => {
    const requestedId = page.url.searchParams.get("projeto");
    return requestedId
      ? (posts.find((post) => post.id === requestedId) ?? null)
      : null;
  });
  let openedFromGrid = false;
  let profileHref = $derived(`/@${data.profile.username}`);
  let description = $derived(
    data.profile.profession
      ? `Projetos de ${data.profile.name}, ${data.profile.profession}.`
      : `Conheça os projetos publicados por ${data.profile.name}.`,
  );
  let previewImage = $derived(
    posts
      .flatMap((post) => post.blocks)
      .find((block) => block.kind === "image" && block.imageUrl)?.imageUrl ??
      data.profile.photo,
  );

  function openPortfolio(post: SocialPost) {
    const url = new URL(page.url);
    url.searchParams.set("projeto", post.id);
    openedFromGrid = true;
    pushState(url, page.state);
  }

  function closePortfolio() {
    if (openedFromGrid) {
      openedFromGrid = false;
      history.back();
      return;
    }
    const url = new URL(page.url);
    url.searchParams.delete("projeto");
    replaceState(url, page.state);
  }

  function updatePostInteraction(interaction: SocialPostInteraction) {
    if (!selected) return;
    interactionOverrides = {
      ...interactionOverrides,
      [selected.id]: interaction,
    };
  }
</script>

<svelte:head>
  <title>Portfólio de {data.profile.name} · Demanda</title>
  <meta name="description" content={description} />
  <meta property="og:type" content="profile" />
  <meta property="og:title" content={`Portfólio de ${data.profile.name}`} />
  <meta property="og:description" content={description} />
  <meta name="twitter:card" content="summary_large_image" />
  {#if previewImage}<meta property="og:image" content={previewImage} />{/if}
</svelte:head>

<div class:shelled={Boolean(data.shellData)} class="portfolio-page">
  <header class="portfolio-hero">
    <a
      class="owner"
      href={profileHref}
      aria-label={`Ver perfil de ${data.profile.name}`}
    >
      <span class="avatar-wrap">
        <Avatar
          photo={data.profile.photo}
          image={data.profile.avatarImage}
          color={data.profile.avatarColor}
          alt={`Avatar de ${data.profile.name}`}
        />
      </span>
      <span class="owner-copy">
        <span>@{data.profile.username}</span>
        <h1>Portfólio de {data.profile.name}</h1>
        <p>
          {data.profile.profession ||
            "Projetos e trabalhos publicados no Demanda."}
        </p>
      </span>
    </a>
    <div class="count">
      <strong>{posts.length}</strong>
      <span>{posts.length === 1 ? "projeto" : "projetos"}</span>
    </div>
  </header>

  {#if posts.length === 0}
    <section class="empty">
      <BriefcaseBusiness size={34} />
      <h2>Portfólio em construção</h2>
      <p>{data.profile.name} ainda não publicou projetos por aqui.</p>
      <a href={profileHref}>Ver perfil</a>
    </section>
  {:else}
    <section class="portfolio-grid" aria-label="Projetos publicados">
      {#each posts as post (post.id)}
        <PortfolioCard {post} onselect={openPortfolio} />
      {/each}
    </section>
  {/if}
</div>

{#if selected}
  <PortfolioViewer
    post={selected}
    onclose={closePortfolio}
    oninteraction={updatePostInteraction}
  />
{/if}

<style>
  .portfolio-page {
    min-height: 100dvh;
    padding: 28px clamp(16px, 4vw, 52px) 52px;
    background: #f5f7fb;
  }
  .portfolio-page.shelled {
    min-height: 100%;
    padding: 0 0 30px;
    background: transparent;
  }
  .portfolio-hero {
    position: relative;
    display: flex;
    width: min(var(--social-content-width), 100%);
    min-height: 250px;
    align-items: flex-end;
    justify-content: space-between;
    gap: 30px;
    margin: 0 auto 28px;
    overflow: hidden;
    padding: 42px;
    border-radius: 26px;
    color: white;
    background: linear-gradient(125deg, #131f46, #2e56ff 66%, #778fff);
    box-shadow: 0 24px 60px rgba(35, 65, 190, 0.18);
  }
  .portfolio-hero::after {
    position: absolute;
    width: 360px;
    height: 360px;
    right: -100px;
    top: -180px;
    border: 1px solid rgba(255, 255, 255, 0.2);
    border-radius: 50%;
    box-shadow: 0 0 0 70px rgba(255, 255, 255, 0.035);
    content: "";
  }
  .owner {
    position: relative;
    z-index: 1;
    display: flex;
    min-width: 0;
    align-items: center;
    gap: 20px;
  }
  .avatar-wrap {
    width: 78px;
    height: 78px;
    flex: 0 0 auto;
    overflow: hidden;
    border: 4px solid rgba(255, 255, 255, 0.85);
    border-radius: 50%;
  }
  .owner-copy {
    display: block;
    min-width: 0;
  }
  .owner-copy > span {
    color: rgba(255, 255, 255, 0.7);
    font-size: 11px;
    font-weight: 600;
  }
  h1 {
    max-width: 760px;
    margin-top: 5px;
    font-size: clamp(28px, 4.5vw, 50px);
    line-height: 1.05;
    overflow-wrap: anywhere;
  }
  .owner p {
    margin-top: 10px;
    color: rgba(255, 255, 255, 0.74);
    font-size: 13px;
  }
  .count {
    position: relative;
    z-index: 1;
    display: grid;
    min-width: 96px;
    justify-items: end;
  }
  .count strong {
    font-size: 36px;
    line-height: 1;
  }
  .count span {
    margin-top: 5px;
    color: rgba(255, 255, 255, 0.7);
    font-size: 10px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }
  .portfolio-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
    width: min(var(--social-content-width), 100%);
    gap: 16px;
    margin: 0 auto;
  }
  .empty {
    display: grid;
    width: min(var(--social-content-width), 100%);
    min-height: 340px;
    place-content: center;
    justify-items: center;
    gap: 9px;
    margin: 0 auto;
    border: 1px dashed var(--border-strong);
    border-radius: 22px;
    color: var(--ink-400);
    background: rgba(255, 255, 255, 0.7);
    text-align: center;
  }
  .empty h2 {
    color: var(--ink-800);
    font-size: 20px;
  }
  .empty p {
    font-size: 12px;
  }
  .empty a {
    margin-top: 8px;
    color: var(--brand-700);
    font-size: 12px;
    font-weight: 600;
  }
  @media (max-width: 680px) {
    .portfolio-page {
      padding: 18px 10px 40px;
    }
    .portfolio-page.shelled {
      padding: 0 0 20px;
    }
    .portfolio-hero {
      min-height: 300px;
      align-items: start;
      flex-direction: column;
      padding: 30px 24px;
    }
    .owner {
      align-items: flex-start;
      flex-direction: column;
    }
    .avatar-wrap {
      width: 68px;
      height: 68px;
    }
    .count {
      justify-items: start;
    }
    .portfolio-grid {
      grid-template-columns: 1fr;
    }
  }
</style>
