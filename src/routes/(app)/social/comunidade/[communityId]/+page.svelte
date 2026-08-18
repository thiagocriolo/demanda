<script lang="ts">
  import { onMount } from "svelte";
  import { page } from "$app/state";
  import {
    ChevronRight,
    Globe2,
    Home,
    LoaderCircle,
    LockKeyhole,
    Newspaper,
    ShieldCheck,
    UserCheck,
    UserPlus,
    UsersRound,
  } from "@lucide/svelte";
  import {
    acceptCommunityJoinRequest,
    inviteCommunityMember,
    loadCommunity,
    loadCommunityFeed,
    loadCommunityJoinRequests,
    promoteCommunityMember,
    publishCommunityPost,
    searchCommunityMemberCandidates,
  } from "$lib/social/client";
  import PostCard from "$lib/social/PostCard.svelte";
  import ConnectionCard from "$lib/social/ConnectionCard.svelte";
  import PublishComposer from "$lib/social/PublishComposer.svelte";
  import SocialAvatar from "$lib/social/SocialAvatar.svelte";
  import type {
    Community,
    CommunityJoinRequest,
    SocialPost,
  } from "$lib/social/types";
  import UserSearch, {
    type UserSearchResult,
    type UserSearchUser,
  } from "$lib/ui/UserSearch.svelte";

  type CommunityView = "feed" | "home" | "members";

  let community = $state<Community | null>(null);
  let posts = $state<SocialPost[]>([]);
  let requests = $state<CommunityJoinRequest[]>([]);
  let nextCursor = $state<string | null>(null);
  let view = $state<CommunityView>("feed");
  let loading = $state(true);
  let actingId = $state("");
  let error = $state("");
  let memberSearchError = $state("");
  let memberNotice = $state("");

  let communityId = $derived(page.params.communityId ?? "");
  let canManage = $derived(
    community?.currentUserRole === "owner" ||
      community?.currentUserRole === "admin",
  );

  onMount(() => void initialize());

  async function initialize(): Promise<void> {
    loading = true;
    error = "";
    try {
      const [communityData, feed] = await Promise.all([
        loadCommunity(communityId),
        loadCommunityFeed(communityId),
      ]);
      community = communityData;
      posts = feed.items;
      nextCursor = feed.nextCursor;
      if (
        communityData.currentUserRole === "owner" ||
        communityData.currentUserRole === "admin"
      ) {
        try {
          requests = await loadCommunityJoinRequests(communityId);
        } catch (cause) {
          error =
            cause instanceof Error
              ? cause.message
              : "Não foi possível carregar as solicitações.";
        }
      }
    } catch (cause) {
      error =
        cause instanceof Error
          ? cause.message
          : "Não foi possível abrir a comunidade.";
    } finally {
      loading = false;
    }
  }

  function togglePrimaryView(): void {
    view = view === "feed" ? "home" : "feed";
  }

  async function loadMore(): Promise<void> {
    if (!nextCursor || loading) return;
    loading = true;
    try {
      const feed = await loadCommunityFeed(communityId, nextCursor);
      posts = [...posts, ...feed.items];
      nextCursor = feed.nextCursor;
    } catch (cause) {
      error =
        cause instanceof Error
          ? cause.message
          : "Não foi possível carregar mais.";
    } finally {
      loading = false;
    }
  }

  async function promote(userId: string): Promise<void> {
    if (actingId) return;
    actingId = userId;
    error = "";
    try {
      community = await promoteCommunityMember(communityId, userId);
    } catch (cause) {
      error =
        cause instanceof Error
          ? cause.message
          : "Não foi possível promover o membro.";
    } finally {
      actingId = "";
    }
  }

  async function addMember(candidate: UserSearchUser): Promise<void> {
    if (actingId) return;
    actingId = candidate.id;
    memberSearchError = "";
    memberNotice = "";
    try {
      await inviteCommunityMember(communityId, candidate.id);
      memberNotice = `Convite enviado para ${candidate.name}.`;
    } catch (cause) {
      memberSearchError =
        cause instanceof Error
          ? cause.message
          : "Não foi possível convidar a pessoa.";
    } finally {
      actingId = "";
    }
  }

  function memberAction(user: UserSearchUser) {
    return {
      label: actingId === user.id ? "Convidando…" : "Convidar",
      icon: UserPlus,
      disabled: Boolean(actingId),
      busy: actingId === user.id,
    };
  }

  async function searchMemberUsers(
    query: string,
    signal: AbortSignal,
  ): Promise<UserSearchResult[]> {
    const candidates = await searchCommunityMemberCandidates(
      communityId,
      query,
      fetch,
      signal,
    );
    return candidates.map((candidate) => ({
      ...candidate,
      kind: "user" as const,
      email: "",
      exact: false,
    }));
  }

  async function acceptRequest(requestId: string): Promise<void> {
    if (actingId) return;
    actingId = requestId;
    error = "";
    try {
      community = await acceptCommunityJoinRequest(communityId, requestId);
      requests = requests.filter((request) => request.id !== requestId);
    } catch (cause) {
      error =
        cause instanceof Error
          ? cause.message
          : "Não foi possível aceitar a solicitação.";
    } finally {
      actingId = "";
    }
  }
</script>

<svelte:head>
  <title>{community?.name ?? "Comunidade"} · Social · Demanda</title>
</svelte:head>

<section class="community-page">
  {#if error}<p class="alert" role="alert">{error}</p>{/if}

  {#if loading && !community}
    <div class="loading-state">
      <LoaderCircle class="spin" size={22} />Abrindo comunidade…
    </div>
  {:else if community}
    <button
      class="community-hero"
      type="button"
      onclick={togglePrimaryView}
      aria-label={view === "feed"
        ? "Abrir homepage da comunidade"
        : "Abrir feed da comunidade"}
    >
      {#if community.coverUrl}
        <img src={community.coverUrl} alt="" />
      {:else}
        <span class="hero-placeholder"><UsersRound size={38} /></span>
      {/if}
      <span class="hero-copy">
        <span class="topic">{community.topic}</span>
        <strong>{community.name}</strong>
        <span class="linkname">@{community.linkName}</span>
        <span class="hero-description">{community.description}</span>
        <span class="meta">
          {#if community.visibility === "public"}<Globe2 size={14} />Comunidade
            pública{:else}<LockKeyhole size={14} />Comunidade privada{/if}
          <span>·</span>{community.memberCount}
          {community.memberCount === 1 ? "membro" : "membros"}
        </span>
      </span>
      <span class="switch-hint">
        {#if view === "feed"}<Home size={16} />Ver homepage{:else}<Newspaper
            size={16}
          />Ver feed{/if}
        <ChevronRight size={16} />
      </span>
    </button>

    {#if view === "members"}
      <section class="members-page" aria-label="Membros da comunidade">
        {#if canManage}
          <header class="member-search">
            <div class="member-search-content">
              <h1>Convide novos membros</h1>
              <div class="member-search-control">
                <UserSearch
                  selection="action"
                  display="social"
                  label="Convidar membro por usuário ou e-mail"
                  placeholder="Digite @usuário, usuário ou e-mail"
                  emptyMessage="Nenhuma pessoa disponível para essa busca."
                  icon={UserPlus}
                  searcher={searchMemberUsers}
                  actionFor={memberAction}
                  onaction={(user) => void addMember(user)}
                  onerror={(message) => (memberSearchError = message)}
                />
              </div>
            </div>
            <strong class="member-count">
              {community.memberCount}
              <small>{community.memberCount === 1 ? "membro" : "membros"}</small
              >
            </strong>
          </header>
          {#if memberSearchError}<p class="request-warning" role="alert">
              {memberSearchError}
            </p>{/if}
          {#if memberNotice}<p class="member-notice" role="status">
              {memberNotice}
            </p>{/if}
        {/if}

        {#if canManage && requests.length > 0}
          <section class="request-card" aria-labelledby="requests-title">
            <div class="card-title">
              <div>
                <UserCheck size={18} />
                <div>
                  <h2 id="requests-title">Solicitações de participação</h2>
                  <p>
                    {requests.length}
                    {requests.length === 1
                      ? "solicitação pendente"
                      : "solicitações pendentes"}
                  </p>
                </div>
              </div>
            </div>
            <div class="management-list">
              {#each requests as request (request.id)}
                <div class="person-row">
                  <SocialAvatar
                    src={request.user.avatarUrl}
                    name={request.user.name}
                    size={40}
                  />
                  <span
                    ><strong>{request.user.name}</strong><small
                      >@{request.user.username}</small
                    ></span
                  >
                  <button
                    type="button"
                    disabled={Boolean(actingId)}
                    onclick={() => acceptRequest(request.id)}
                  >
                    {#if actingId === request.id}<LoaderCircle
                        class="spin"
                        size={14}
                      />{:else}<UserCheck size={14} />{/if}Aceitar
                  </button>
                </div>
              {/each}
            </div>
          </section>
        {/if}

        <section class="member-directory" aria-label="Membros da comunidade">
          <div class="member-grid">
            {#each community.members as member (member.user.id)}
              <ConnectionCard user={member.user}>
                <em
                  class="connection-card__badge"
                  class:connection-card__badge--highlight={member.role !==
                    "member"}
                  >{member.role === "owner"
                    ? "Administrador"
                    : member.role === "admin"
                      ? "Gestor"
                      : "Membro"}</em
                >
                {#if community.currentUserRole === "owner" && member.role === "member"}
                  <button
                    class="connection-card__action connection-card__action--primary"
                    type="button"
                    disabled={Boolean(actingId)}
                    onclick={() => promote(member.user.id)}
                  >
                    {#if actingId === member.user.id}<LoaderCircle
                        class="spin"
                        size={14}
                      />{:else}<ShieldCheck size={14} />{/if}Promover a gestor
                  </button>
                {/if}
              </ConnectionCard>
            {/each}
          </div>
        </section>
      </section>
    {:else}
      <div class="layout">
        <main>
          {#if view === "feed"}
            <PublishComposer
              publish={(input) => publishCommunityPost(communityId, input)}
              onpublished={(post) => (posts = [post, ...posts])}
            />
            {#if posts.length === 0}
              <div class="empty-feed">
                <Newspaper size={27} />
                <h2>Comece a conversa</h2>
                <p>A primeira publicação desta comunidade pode ser sua.</p>
              </div>
            {:else}
              <div class="feed">
                {#each posts as post (post.id)}<PostCard {post} />{/each}
              </div>
              {#if nextCursor}<button
                  class="load-more"
                  type="button"
                  disabled={loading}
                  onclick={loadMore}
                  >{loading ? "Carregando…" : "Carregar mais"}</button
                >{/if}
            {/if}
          {:else}
            <section class="homepage" aria-labelledby="about-title">
              <span class="eyebrow">Homepage</span>
              <h1 id="about-title">Sobre a comunidade</h1>
              <p class="about-copy">{community.description}</p>
              <div class="info-grid">
                <article>
                  <span>Tema</span><strong>{community.topic}</strong>
                </article>
                <article>
                  <span>Visibilidade</span><strong
                    >{community.visibility === "public"
                      ? "Comunidade pública"
                      : "Comunidade privada"}</strong
                  >
                </article>
                <article>
                  <span>Endereço</span><strong>@{community.linkName}</strong>
                </article>
                <article>
                  <span>Participantes</span><strong
                    >{community.memberCount}
                    {community.memberCount === 1 ? "membro" : "membros"}</strong
                  >
                </article>
              </div>
            </section>
          {/if}
        </main>

        <aside>
          <div class="aside-title">
            <span><UsersRound size={17} />Membros</span><strong
              >{community.memberCount}</strong
            >
          </div>
          <p>Conheça os participantes e veja quem ajuda a gerir este espaço.</p>
          <div class="avatar-stack" aria-hidden="true">
            {#each community.members.slice(0, 5) as member (member.user.id)}<SocialAvatar
                src={member.user.avatarUrl}
                name={member.user.name}
                size={34}
              />{/each}
          </div>
          <button
            type="button"
            class="members-button"
            onclick={() => (view = "members")}
            >Ver todos os membros<ChevronRight size={16} /></button
          >
        </aside>
      </div>
    {/if}
  {/if}
</section>

<style>
  .community-page {
    display: grid;
    width: min(100%, var(--social-content-width));
    gap: 16px;
    margin-inline: auto;
    padding-bottom: 30px;
  }
  button {
    font: inherit;
    cursor: pointer;
  }
  .alert {
    padding: 10px 13px;
    border: 1px solid rgba(220, 38, 38, 0.22);
    border-radius: 10px;
    color: #991b1b;
    background: rgba(220, 38, 38, 0.07);
    font-size: 11px;
  }
  .loading-state {
    display: flex;
    min-height: 330px;
    align-items: center;
    justify-content: center;
    gap: 8px;
    color: var(--ink-400);
    font-size: 11px;
  }
  .community-hero {
    position: relative;
    display: block;
    width: 100%;
    height: var(--social-header-height);
    overflow: hidden;
    padding: 0;
    border: 0;
    border-radius: 18px;
    color: white;
    background: #17244f;
    text-align: left;
  }
  .community-hero > img,
  .hero-placeholder {
    position: absolute;
    width: 100%;
    height: 100%;
    inset: 0;
    object-fit: cover;
  }
  .community-hero::after {
    position: absolute;
    background: linear-gradient(
      90deg,
      rgba(15, 23, 42, 0.94),
      rgba(15, 23, 42, 0.5) 65%,
      rgba(15, 23, 42, 0.24)
    );
    content: "";
    inset: 0;
  }
  .community-hero:focus-visible {
    outline: 3px solid var(--brand-400, #6683ff);
    outline-offset: 3px;
  }
  .hero-placeholder {
    display: grid;
    place-items: center;
    color: rgba(255, 255, 255, 0.55);
    background: linear-gradient(135deg, #17244f, #2e56ff);
  }
  .hero-copy {
    position: relative;
    z-index: 1;
    display: grid;
    max-width: 670px;
    align-content: end;
    height: var(--social-header-height);
    padding: 18px 26px;
  }
  .topic,
  .eyebrow {
    width: fit-content;
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }
  .topic {
    padding: 5px 8px;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.14);
  }
  .hero-copy > strong {
    margin-top: 6px;
    font-size: 28px;
    line-height: 1.15;
  }
  .linkname {
    margin-top: 2px;
    color: rgba(255, 255, 255, 0.78);
    font-size: 11px;
    font-weight: 600;
  }
  .hero-description {
    margin-top: 4px;
    color: rgba(255, 255, 255, 0.78);
    font-size: 12px;
    line-height: 1.5;
  }
  .meta {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-top: 7px;
    color: rgba(255, 255, 255, 0.72);
    font-size: 10px;
  }
  .switch-hint {
    position: absolute;
    z-index: 2;
    right: 22px;
    bottom: 22px;
    display: flex;
    align-items: center;
    gap: 7px;
    padding: 10px 12px;
    border: 1px solid rgba(255, 255, 255, 0.18);
    border-radius: 10px;
    background: rgba(15, 23, 42, 0.55);
    backdrop-filter: blur(8px);
    font-size: 10px;
    font-weight: 700;
  }
  .layout {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 270px;
    align-items: start;
    gap: 16px;
  }
  main {
    display: grid;
    gap: 14px;
  }
  aside,
  .empty-feed,
  .homepage,
  .request-card,
  .member-search {
    border: 1px solid var(--border);
    border-radius: 16px;
    background: var(--panel);
  }
  .person-row button {
    color: white;
    background: var(--brand-600);
  }
  button:disabled {
    cursor: not-allowed;
    opacity: 0.55;
  }
  .feed {
    display: grid;
    gap: 14px;
  }
  .empty-feed {
    display: grid;
    min-height: 230px;
    place-content: center;
    justify-items: center;
    gap: 7px;
    color: var(--ink-400);
    text-align: center;
  }
  .empty-feed h2 {
    color: var(--ink-800);
    font-size: 16px;
  }
  .empty-feed p {
    font-size: 11px;
  }
  .load-more {
    min-height: 38px;
    border: 1px solid var(--border);
    border-radius: 10px;
    color: var(--brand-700);
    background: var(--panel);
    font-size: 11px;
    font-weight: 600;
  }
  aside {
    padding: 17px;
  }
  .aside-title {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .aside-title span {
    display: flex;
    align-items: center;
    gap: 7px;
    color: var(--ink-800);
    font-size: 14px;
    font-weight: 700;
  }
  .aside-title strong {
    display: grid;
    min-width: 26px;
    height: 24px;
    place-items: center;
    border-radius: 999px;
    color: var(--brand-700);
    background: var(--brand-50);
    font-size: 10px;
  }
  aside > p {
    margin-top: 10px;
    color: var(--ink-400);
    font-size: 10px;
    line-height: 1.5;
  }
  .avatar-stack {
    display: flex;
    margin: 16px 0;
    padding-left: 7px;
  }
  .avatar-stack :global(*) {
    margin-left: -7px;
    box-shadow: 0 0 0 2px var(--panel);
  }
  .members-button {
    display: flex;
    width: 100%;
    min-height: 38px;
    align-items: center;
    justify-content: space-between;
    padding: 0 12px;
    border: 1px solid var(--border);
    border-radius: 10px;
    color: var(--brand-700);
    background: var(--surface-soft);
    font-size: 10px;
    font-weight: 700;
  }
  .homepage {
    min-height: 360px;
    padding: 28px;
  }
  .eyebrow {
    color: var(--brand-600);
  }
  .homepage h1 {
    margin-top: 6px;
    color: var(--ink-900, var(--text));
    font-size: 24px;
  }
  .about-copy {
    max-width: 690px;
    margin-top: 13px;
    color: var(--ink-500);
    font-size: 13px;
    line-height: 1.65;
  }
  .info-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 12px;
    margin-top: 28px;
  }
  .info-grid article {
    display: grid;
    gap: 5px;
    padding: 16px;
    border-radius: 12px;
    background: var(--surface-soft);
  }
  .info-grid span {
    color: var(--ink-400);
    font-size: 9px;
    font-weight: 700;
    text-transform: uppercase;
  }
  .info-grid strong {
    color: var(--ink-800);
    font-size: 12px;
  }
  .members-page {
    display: grid;
    gap: 14px;
  }
  .member-search {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    gap: 16px;
    padding: 14px;
    border-color: rgba(46, 86, 255, 0.18);
    border-radius: 18px;
    background: linear-gradient(
      130deg,
      rgba(255, 255, 255, 0.96),
      rgba(235, 240, 255, 0.96)
    );
  }
  .member-search-content {
    display: grid;
    min-width: 0;
    align-content: center;
    gap: 9px;
  }
  .member-search h1 {
    color: var(--ink-800);
    font-size: 18px;
  }
  .member-search-control {
    position: relative;
    width: min(100%, 520px);
    min-width: 0;
  }
  .member-count {
    display: grid;
    width: 72px;
    height: 72px;
    place-content: center;
    justify-items: center;
    gap: 4px;
    border: 1px solid rgba(46, 86, 255, 0.06);
    border-radius: 12px;
    color: var(--brand-700);
    background: rgba(255, 255, 255, 0.9);
    font-size: 34px;
    line-height: 0.9;
    box-shadow: 0 4px 14px rgba(46, 86, 255, 0.06);
  }
  .member-count small {
    color: var(--ink-400);
    font-size: 10px;
    font-weight: 500;
    line-height: 1;
  }
  .member-search-control :global(.selector-control) {
    min-height: 38px;
    align-items: center;
    gap: 10px;
    padding: 0 14px;
    border: 1px solid var(--border);
    border-radius: 12px;
    color: var(--brand-600);
    background: var(--surface);
    transition:
      border-color 0.15s ease,
      box-shadow 0.15s ease;
  }
  .member-search-control :global(.selector-control:focus-within) {
    border-color: var(--brand-500);
    box-shadow: var(--focus-ring);
  }
  .member-search-control :global(.selector-control input) {
    font-size: 12px;
  }
  .member-search-control :global(.selector-control input::placeholder) {
    color: var(--ink-400);
  }
  .member-search-control :global(.dropdown) {
    z-index: 30;
    top: calc(100% + 8px);
    border-radius: 12px;
    background: var(--panel);
    box-shadow: 0 14px 34px rgba(15, 23, 42, 0.14);
  }
  .member-search-control :global(.dropdown ul) {
    padding: 0;
  }
  .member-search-control :global(.dropdown li > button) {
    min-height: 58px;
    gap: 10px;
    padding: 11px 12px;
    border-radius: 0;
    border-bottom: 1px solid var(--border);
  }
  .member-search-control :global(.dropdown li:last-child > button) {
    border-bottom: 0;
  }
  .member-search-control :global(.option-copy strong) {
    overflow: hidden;
    color: var(--ink-800);
    font-size: 12px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .member-search-control :global(.option-copy small) {
    color: var(--ink-400);
    font-size: 10px;
  }
  .member-search-control :global(.item-action) {
    min-height: 34px;
    padding: 0 12px;
    border-radius: 8px;
    color: white;
    background: var(--brand-600);
    font-size: 10px;
    font-weight: 700;
  }
  .member-search-control :global(.empty-state) {
    min-height: 58px;
    padding: 14px;
    color: var(--ink-400);
    font-size: 10px;
    line-height: 1.4;
  }
  .member-notice {
    padding: 10px 13px;
    border: 1px solid rgba(93, 172, 131, 0.25);
    border-radius: 10px;
    color: #276749;
    background: rgba(93, 172, 131, 0.1);
    font-size: 10px;
  }
  .request-card {
    overflow: hidden;
  }
  .card-title {
    padding: 16px 18px;
    border-bottom: 1px solid var(--border);
  }
  .card-title > div {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .card-title h2 {
    color: var(--ink-800);
    font-size: 14px;
  }
  .card-title p {
    margin-top: 2px;
    color: var(--ink-400);
    font-size: 9px;
  }
  .management-list {
    display: grid;
  }
  .person-row {
    display: flex;
    min-width: 0;
    align-items: center;
    gap: 10px;
    padding: 12px 18px;
    border-bottom: 1px solid var(--border);
  }
  .person-row:last-child {
    border-bottom: 0;
  }
  .person-row > span {
    display: grid;
    min-width: 0;
    gap: 2px;
  }
  .person-row strong {
    overflow: hidden;
    color: var(--ink-800);
    font-size: 11px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .person-row small {
    color: var(--ink-400);
    font-size: 9px;
  }
  .person-row button {
    display: inline-flex;
    min-height: 32px;
    align-items: center;
    gap: 6px;
    margin-left: 8px;
    padding: 0 10px;
    border: 0;
    border-radius: 8px;
    font-size: 9px;
    font-weight: 700;
  }
  .request-warning {
    margin: 14px 18px;
    padding: 10px 12px;
    border-radius: 9px;
    color: #92400e;
    background: #fffbeb;
    font-size: 10px;
  }
  .member-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(230px, 1fr));
    gap: 12px;
  }
  :global(.spin) {
    animation: spin 0.8s linear infinite;
  }
  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }
  @media (max-width: 800px) {
    .layout {
      grid-template-columns: minmax(0, 1fr);
    }
    aside {
      order: -1;
    }
    .switch-hint {
      right: 14px;
      bottom: 14px;
    }
  }
  @media (max-width: 560px) {
    .hero-copy {
      height: var(--social-header-height);
      padding: 24px 20px 66px;
    }
    .community-hero {
      height: var(--social-header-height);
    }
    .info-grid {
      grid-template-columns: 1fr;
    }
    .member-search {
      gap: 12px;
      padding: 12px;
    }
    .member-count {
      width: 68px;
      height: 68px;
      font-size: 32px;
    }
    .person-row {
      flex-wrap: wrap;
    }
    .person-row button {
      width: 100%;
      justify-content: center;
      margin-left: 50px;
    }
  }
</style>
