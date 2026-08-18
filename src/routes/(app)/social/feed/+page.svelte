<script lang="ts">
  import { onMount } from "svelte";
  import { LoaderCircle, Network, Sparkles, UsersRound } from "@lucide/svelte";
  import { loadConnections } from "$lib/connections/client";
  import { loadCommunities, loadFeed, publishPost } from "$lib/social/client";
  import PostCard from "$lib/social/PostCard.svelte";
  import PublishComposer from "$lib/social/PublishComposer.svelte";
  import SocialAvatar from "$lib/social/SocialAvatar.svelte";
  import { relativeTime } from "$lib/social/time";
  import type { ConnectionSummary } from "$lib/server/connections/service";
  import type { Community, FeedItem } from "$lib/social/types";

  let { data } = $props();
  let items = $state<FeedItem[]>([]);
  let nextCursor = $state<string | null>(null);
  let loading = $state(true);
  let loadingMore = $state(false);
  let error = $state("");
  let sentinel = $state<HTMLDivElement>();
  let communities = $state<Community[]>([]);
  let connections = $state<ConnectionSummary[]>([]);
  let railLoading = $state(true);

  onMount(() => {
    void refresh();
    void loadRail();
  });

  async function loadRail() {
    railLoading = true;
    try {
      const [communityResult, connectionResult] = await Promise.allSettled([
        loadCommunities(),
        loadConnections(),
      ]);
      communities =
        communityResult.status === "fulfilled" ? communityResult.value : [];
      connections =
        connectionResult.status === "fulfilled"
          ? connectionResult.value.connections
          : [];
    } finally {
      railLoading = false;
    }
  }

  $effect(() => {
    if (!sentinel || !nextCursor) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) void loadMore();
      },
      { rootMargin: "300px" },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  });

  async function refresh() {
    loading = true;
    error = "";
    try {
      const page = await loadFeed();
      items = page.items;
      nextCursor = page.nextCursor;
    } catch (cause) {
      error =
        cause instanceof Error
          ? cause.message
          : "Não foi possível carregar o feed.";
    } finally {
      loading = false;
    }
  }

  async function loadMore() {
    if (!nextCursor || loadingMore) return;
    loadingMore = true;
    try {
      const page = await loadFeed(nextCursor);
      const existing = new Set(items.map((item) => item.id));
      items = [
        ...items,
        ...page.items.filter((item) => !existing.has(item.id)),
      ];
      nextCursor = page.nextCursor;
    } catch (cause) {
      error =
        cause instanceof Error
          ? cause.message
          : "Não foi possível carregar mais atualizações.";
    } finally {
      loadingMore = false;
    }
  }

  function activityLabel(item: Extract<FeedItem, { kind: "activity" }>) {
    if (item.entity === "workspace") return "atualizou o workspace";
    if (item.entity === "project") return "atualizou o projeto";
    return "atualizou a tarefa";
  }
</script>

<svelte:head><title>Feed · Social · Demanda</title></svelte:head>

<section class="feed-page" aria-label="Feed social">
  <div class="feed-column">
    <PublishComposer
      placeholder={`No que você está trabalhando, ${data.authenticatedUser.name.split(" ")[0]}?`}
      publish={publishPost}
      onpublished={(post) =>
        (items = [
          {
            id: `post:${post.id}`,
            kind: "post",
            occurredAt: post.createdAt,
            post,
          },
          ...items,
        ])}
    />

    {#if error}<p class="alert" role="alert">{error}</p>{/if}

    {#if loading}
      <div class="loading">
        <LoaderCircle class="spin" size={22} />Carregando atualizações…
      </div>
    {:else if items.length === 0}
      <div class="empty">
        <Sparkles size={28} />
        <h2>Seu feed começa aqui</h2>
        <p>
          Publique uma atualização ou crie conexões para acompanhar trabalhos e
          projetos.
        </p>
        <a href="/social/conect">Encontrar conexões</a>
      </div>
    {:else}
      <div class="stream">
        {#each items as item (item.id)}
          {#if item.kind === "post"}
            <PostCard
              post={item.post}
              onopen={item.post.kind === "portfolio"
                ? () =>
                    (location.href = `/@${item.post.author.username}/portfolio#projeto-${item.post.id}`)
                : undefined}
            />
          {:else if item.kind === "connection"}
            <article class="story connection-story">
              <div class="avatars">
                <SocialAvatar
                  src={item.people[0].avatarUrl}
                  name={item.people[0].name}
                  size={42}
                />
                <SocialAvatar
                  src={item.people[1].avatarUrl}
                  name={item.people[1].name}
                  size={42}
                />
              </div>
              <div>
                <p>
                  <strong>{item.people[0].name}</strong> e
                  <strong>{item.people[1].name}</strong> agora estão conectados.
                </p>
                <span>{relativeTime(item.occurredAt)}</span>
              </div>
              <Network size={19} />
            </article>
          {:else}
            <article class="story activity-story">
              <SocialAvatar
                src={item.actor?.avatarUrl}
                name={item.actor?.name ?? "Equipe"}
                size={42}
              />
              <div>
                <p>
                  <strong>{item.actor?.name ?? "Sua equipe"}</strong>
                  {activityLabel(item)} <strong>{item.title}</strong>.
                </p>
                <span
                  >{item.context ? `${item.context} · ` : ""}{relativeTime(
                    item.occurredAt,
                  )}</span
                >
              </div>
            </article>
          {/if}
        {/each}
      </div>
      <div class="sentinel" bind:this={sentinel}>
        {#if loadingMore}<LoaderCircle class="spin" size={18} /> Carregando mais…{/if}
      </div>
    {/if}
  </div>

  <aside class="rail">
    <div class="rail-card">
      <div class="rail-card-header">
        <strong><UsersRound size={17} />Comunidades</strong>
        <a class="rail-action" href="/social/comunidade">Ver todas</a>
      </div>
      {#if railLoading}
        <div class="rail-loading"><LoaderCircle class="spin" size={17} /></div>
      {:else if communities.length === 0}
        <p class="rail-empty">Você ainda não participa de comunidades.</p>
      {:else}
        <div class="rail-list">
          {#each communities.slice(0, 5) as community (community.id)}
            <a
              class="rail-item community-item"
              href={`/social/comunidade/${community.linkName}`}
            >
              {#if community.coverUrl}
                <img src={community.coverUrl} alt="" />
              {:else}
                <span class="community-placeholder"
                  ><UsersRound size={17} /></span
                >
              {/if}
              <span class="rail-item-copy">
                <strong>{community.name}</strong>
                <small>
                  {community.memberCount}
                  {community.memberCount === 1 ? "membro" : "membros"}
                </small>
              </span>
            </a>
          {/each}
        </div>
      {/if}
    </div>
    <div class="rail-card">
      <div class="rail-card-header">
        <strong><Network size={17} />Conexões</strong>
        <a class="rail-action" href="/social/conect">Ver todas</a>
      </div>
      {#if railLoading}
        <div class="rail-loading"><LoaderCircle class="spin" size={17} /></div>
      {:else if connections.length === 0}
        <p class="rail-empty">Você ainda não possui conexões.</p>
      {:else}
        <div class="rail-list">
          {#each connections.slice(0, 5) as connection (connection.id)}
            <a class="rail-item" href={`/@${connection.username}`}>
              <SocialAvatar
                src={connection.avatarUrl}
                name={connection.name}
                size={38}
              />
              <span class="rail-item-copy">
                <strong>{connection.name}</strong>
                <small>@{connection.username}</small>
              </span>
            </a>
          {/each}
        </div>
      {/if}
    </div>
  </aside>
</section>

<style>
  .feed-page {
    display: grid;
    grid-template-columns: minmax(0, 690px) minmax(230px, 300px);
    width: min(100%, var(--social-content-width));
    justify-content: center;
    align-items: start;
    gap: 20px;
    margin-inline: auto;
    padding-bottom: 30px;
  }
  .feed-column,
  .stream {
    display: grid;
    min-width: 0;
    gap: 14px;
  }
  .story {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 14px 16px;
    border: 1px solid var(--border);
    border-radius: 14px;
    background: var(--panel);
  }
  .story > div:not(.avatars) {
    min-width: 0;
  }
  .story p {
    color: var(--ink-700);
    font-size: 12px;
    line-height: 1.45;
  }
  .story span {
    display: block;
    margin-top: 3px;
    color: var(--ink-400);
    font-size: 10px;
  }
  .story > :global(svg) {
    margin-left: auto;
    color: var(--brand-600);
  }
  .avatars {
    display: flex;
    padding-left: 12px;
  }
  .avatars > :global(*) {
    margin-left: -12px;
    box-shadow: 0 0 0 3px white;
  }
  .rail {
    position: sticky;
    top: 0;
    display: grid;
    gap: 13px;
  }
  .rail-card {
    padding: 17px;
    border: 1px solid var(--border);
    border-radius: 15px;
    background: rgba(255, 255, 255, 0.92);
  }
  .rail-card-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
  }
  .rail-card-header strong {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    color: var(--ink-800);
    font-size: 13px;
  }
  .rail-card-header strong :global(svg) {
    color: var(--brand-700);
  }
  .rail-action {
    display: inline-flex;
    min-height: 26px;
    align-items: center;
    justify-content: center;
    padding: 4px 9px;
    border: 1px solid color-mix(in srgb, var(--brand-500) 28%, transparent);
    border-radius: 8px;
    color: var(--brand-700);
    background: rgba(255, 255, 255, 0.58);
    font-size: 11px;
    font-weight: 600;
    line-height: 1;
    transition:
      border-color 160ms ease,
      background-color 160ms ease,
      color 160ms ease;
  }
  .rail-action:hover {
    border-color: color-mix(in srgb, var(--brand-500) 48%, transparent);
    color: var(--brand-600);
    background: var(--brand-50);
  }
  .rail-list {
    display: grid;
    gap: 4px;
    margin-top: 12px;
  }
  .rail-item {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    align-items: center;
    gap: 10px;
    margin-inline: -7px;
    padding: 7px;
    border-radius: 10px;
  }
  .rail-item:hover {
    background: var(--brand-50);
  }
  .rail-item-copy {
    min-width: 0;
  }
  .rail-item-copy strong,
  .rail-item-copy small {
    display: block;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .rail-item-copy strong {
    color: var(--ink-700);
    font-size: 11px;
  }
  .rail-item-copy small {
    margin-top: 2px;
    color: var(--ink-400);
    font-size: 10px;
  }
  .community-item img,
  .community-placeholder {
    display: grid;
    width: 38px;
    height: 38px;
    flex: 0 0 auto;
    place-items: center;
    border-radius: 10px;
    color: var(--brand-600);
    background: var(--brand-50);
    object-fit: cover;
  }
  .rail-empty {
    margin-top: 12px;
    color: var(--ink-400);
    font-size: 11px;
    line-height: 1.45;
  }
  .rail-loading {
    display: grid;
    min-height: 58px;
    place-items: center;
    color: var(--ink-400);
  }
  .empty a {
    display: inline-flex;
    margin-top: 13px;
    color: var(--brand-700);
    font-size: 11px;
    font-weight: 600;
  }
  .alert {
    padding: 10px 13px;
    border: 1px solid rgba(220, 38, 38, 0.24);
    border-radius: 10px;
    color: #991b1b;
    background: rgba(220, 38, 38, 0.07);
    font-size: 12px;
  }
  .loading,
  .sentinel {
    display: flex;
    min-height: 70px;
    align-items: center;
    justify-content: center;
    gap: 8px;
    color: var(--ink-400);
    font-size: 11px;
  }
  .empty {
    display: grid;
    min-height: 300px;
    place-content: center;
    justify-items: center;
    gap: 8px;
    padding: 30px;
    border: 1px dashed var(--border-strong);
    border-radius: 16px;
    color: var(--ink-400);
    background: rgba(255, 255, 255, 0.58);
    text-align: center;
  }
  .empty h2 {
    color: var(--ink-800);
    font-size: 18px;
  }
  .empty p {
    max-width: 390px;
    font-size: 12px;
    line-height: 1.5;
  }
  :global(.spin) {
    animation: spin 0.8s linear infinite;
  }
  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }
  @media (max-width: 1040px) {
    .feed-page {
      grid-template-columns: minmax(0, 680px);
    }
    .rail {
      display: none;
    }
  }
  @media (max-width: 600px) {
    .feed-page {
      display: block;
    }
  }
</style>
