<script lang="ts">
  import { onMount } from "svelte";
  import {
    Globe2,
    LoaderCircle,
    LockKeyhole,
    Mail,
    Plus,
    UserCheck,
    UsersRound,
  } from "@lucide/svelte";
  import { deleteStoredFile, uploadStoredFile } from "$lib/files/client";
  import CommunityCreateModal, {
    type CommunityDraft,
  } from "$lib/social/CommunityCreateModal.svelte";
  import {
    acceptCommunityInvitation,
    createCommunity as persistCommunity,
    loadCommunities,
    loadCommunityInvitations,
  } from "$lib/social/client";
  import type { Community, CommunityInvitation } from "$lib/social/types";

  let modalOpen = $state(false);
  let communities = $state<Community[]>([]);
  let invitations = $state<CommunityInvitation[]>([]);
  let loading = $state(true);
  let error = $state("");
  let acceptingInvitationId = $state("");

  onMount(() => void initialize());

  async function initialize(): Promise<void> {
    loading = true;
    error = "";
    try {
      [communities, invitations] = await Promise.all([
        loadCommunities(),
        loadCommunityInvitations(),
      ]);
    } catch (cause) {
      error =
        cause instanceof Error
          ? cause.message
          : "Não foi possível carregar as comunidades.";
    } finally {
      loading = false;
    }
  }

  async function acceptInvitation(invitationId: string): Promise<void> {
    if (acceptingInvitationId) return;
    acceptingInvitationId = invitationId;
    error = "";
    try {
      const community = await acceptCommunityInvitation(invitationId);
      invitations = invitations.filter(({ id }) => id !== invitationId);
      communities = [community, ...communities];
    } catch (cause) {
      error =
        cause instanceof Error
          ? cause.message
          : "Não foi possível aceitar o convite.";
    } finally {
      acceptingInvitationId = "";
    }
  }

  async function createCommunity(draft: CommunityDraft): Promise<void> {
    let coverFileId: string | undefined;
    try {
      if (draft.cover) {
        const uploaded = await uploadStoredFile(draft.cover, "attachment");
        coverFileId = uploaded.file.id;
      }
      const community = await persistCommunity({
        linkName: draft.linkName,
        name: draft.name,
        description: draft.description,
        topic: draft.topic,
        visibility: draft.visibility,
        coverFileId,
        memberUserIds: draft.memberUserIds,
      });
      communities = [community, ...communities];
      modalOpen = false;
    } catch (cause) {
      if (coverFileId)
        await deleteStoredFile(coverFileId).catch(() => undefined);
      throw cause;
    }
  }
</script>

<svelte:head><title>Comunidades · Social · Demanda</title></svelte:head>

<section class="communities-page">
  <header class="hero">
    <div>
      <span><UsersRound size={15} />Espaços para trocar e colaborar</span>
      <h1>Comunidades</h1>
      <p>
        Encontre pessoas com os mesmos interesses, compartilhe experiências e
        construa novas conexões.
      </p>
    </div>
    <button type="button" onclick={() => (modalOpen = true)}>
      <Plus size={17} />Criar comunidade
    </button>
  </header>

  {#if error}<p class="alert" role="alert">{error}</p>{/if}

  {#if !loading && invitations.length > 0}
    <section class="invitations" aria-labelledby="community-invitations-title">
      <header>
        <span><Mail size={18} /></span>
        <div>
          <h2 id="community-invitations-title">Convites para comunidades</h2>
          <p>Você só participará depois de aceitar o convite.</p>
        </div>
      </header>
      <div class="invitation-list">
        {#each invitations as invitation (invitation.id)}
          <article>
            {#if invitation.community.coverUrl}
              <img src={invitation.community.coverUrl} alt="" />
            {:else}
              <span class="invitation-cover"><UsersRound size={22} /></span>
            {/if}
            <div>
              <strong>{invitation.community.name}</strong>
              <span>@{invitation.community.linkName}</span>
              <small>Convite de {invitation.invitedBy.name}</small>
            </div>
            <button
              type="button"
              disabled={Boolean(acceptingInvitationId)}
              onclick={() => acceptInvitation(invitation.id)}
            >
              {#if acceptingInvitationId === invitation.id}
                <LoaderCircle class="spin" size={15} />Aceitando…
              {:else}
                <UserCheck size={15} />Aceitar convite
              {/if}
            </button>
          </article>
        {/each}
      </div>
    </section>
  {/if}

  {#if loading}
    <div class="loading-state">
      <LoaderCircle class="spin" size={22} />Carregando comunidades…
    </div>
  {:else if communities.length === 0}
    <div class="empty-state">
      <span><UsersRound size={29} /></span>
      <h2>Crie um espaço para a sua comunidade</h2>
      <p>
        Reúna pessoas em torno de um tema, uma área de atuação ou um interesse
        em comum.
      </p>
      <button type="button" onclick={() => (modalOpen = true)}>
        <Plus size={16} />Criar comunidade
      </button>
    </div>
  {:else}
    <div class="community-grid" aria-live="polite">
      {#each communities as community (community.id)}
        <a
          class="community-card"
          href={`/social/comunidade/${community.linkName}`}
          aria-label={`Abrir comunidade ${community.name}`}
        >
          <span class="card-media">
            {#if community.coverUrl}
              <img
                class="community-cover"
                src={community.coverUrl}
                alt={`Capa de ${community.name}`}
              />
            {:else}
              <span class="community-cover cover-placeholder">
                <UsersRound size={30} />
              </span>
            {/if}
            <span
              class="visibility-badge"
              aria-label={community.visibility === "public"
                ? "Comunidade pública"
                : "Comunidade privada"}
              title={community.visibility === "public"
                ? "Comunidade pública"
                : "Comunidade privada"}
            >
              {#if community.visibility === "public"}
                <Globe2 size={14} />
              {:else}
                <LockKeyhole size={14} />
              {/if}
            </span>
            <span class="community-topic">{community.topic}</span>
          </span>
          <span class="card-content">
            <span class="community-identity">
              <strong class="community-name">{community.name}</strong>
              <span class="community-linkname">@{community.linkName}</span>
            </span>
            <span class="community-description">{community.description}</span>
            <span class="card-footer">
              <span
                class="avatar-stack"
                aria-label={`${community.memberCount} ${community.memberCount === 1 ? "membro" : "membros"}`}
              >
                {#each community.members.slice(0, 4) as member (member.user.id)}
                  <span class="member-avatar" title={member.user.name}>
                    {#if member.user.avatarUrl}
                      <img src={member.user.avatarUrl} alt="" />
                    {:else}
                      <span aria-hidden="true">
                        {member.user.name
                          .split(/\s+/)
                          .slice(0, 2)
                          .map((part) => part[0])
                          .join("")
                          .toUpperCase()}
                      </span>
                    {/if}
                  </span>
                {/each}
                {#if community.memberCount > 4}
                  <span
                    class="member-avatar avatar-overflow"
                    title={`${community.memberCount - 4} membros adicionais`}
                    >+{community.memberCount - 4}</span
                  >
                {/if}
              </span>
              <span class="member-copy">
                <strong>{community.memberCount}</strong>
                <small
                  >{community.memberCount === 1 ? "membro" : "membros"}</small
                >
              </span>
            </span>
          </span>
        </a>
      {/each}
    </div>
  {/if}
</section>

{#if modalOpen}
  <CommunityCreateModal
    oncancel={() => (modalOpen = false)}
    oncreate={createCommunity}
  />
{/if}

<style>
  .communities-page {
    display: grid;
    width: min(100%, var(--social-content-width));
    gap: 18px;
    margin-inline: auto;
  }

  .hero {
    display: flex;
    height: var(--social-header-height);
    align-items: flex-end;
    justify-content: space-between;
    gap: 20px;
    padding: 24px 26px;
    border-radius: 18px;
    color: white;
    background: linear-gradient(125deg, #17244f, #2e56ff 66%, #6f8cff);
  }

  .hero span {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    color: rgba(255, 255, 255, 0.76);
    font-size: 10px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .hero h1 {
    margin-top: 7px;
    font-size: 28px;
  }

  .hero p {
    max-width: 620px;
    margin-top: 5px;
    color: rgba(255, 255, 255, 0.76);
    font-size: 12px;
    line-height: 1.45;
  }

  .hero > button,
  .empty-state button {
    display: inline-flex;
    min-height: 39px;
    flex: 0 0 auto;
    align-items: center;
    gap: 7px;
    padding: 0 14px;
    border: 0;
    border-radius: 10px;
    color: var(--brand-700);
    background: white;
    font-size: 11px;
    font-weight: 600;
  }

  .alert {
    padding: 10px 13px;
    border: 1px solid rgba(220, 38, 38, 0.22);
    border-radius: 10px;
    color: #991b1b;
    background: rgba(220, 38, 38, 0.07);
    font-size: 11px;
  }

  .invitations {
    display: grid;
    gap: 12px;
    padding: 16px;
    border: 1px solid color-mix(in srgb, var(--brand-500) 28%, var(--border));
    border-radius: 16px;
    background: var(--panel);
  }

  .invitations > header,
  .invitation-list article {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .invitations > header > span,
  .invitation-cover {
    display: grid;
    flex: 0 0 auto;
    place-items: center;
    color: var(--brand-600);
    background: var(--brand-50);
  }

  .invitations > header > span {
    width: 38px;
    height: 38px;
    border-radius: 11px;
  }

  .invitations h2 {
    color: var(--ink-900);
    font-size: 14px;
  }

  .invitations p {
    margin-top: 2px;
    color: var(--ink-500);
    font-size: 10px;
  }

  .invitation-list {
    display: grid;
    gap: 8px;
  }

  .invitation-list article {
    padding: 10px;
    border: 1px solid var(--border);
    border-radius: 12px;
    background: var(--surface-soft);
  }

  .invitation-list img,
  .invitation-cover {
    width: 50px;
    height: 50px;
    border-radius: 10px;
    object-fit: cover;
  }

  .invitation-list article > div {
    display: grid;
    min-width: 0;
    flex: 1;
  }

  .invitation-list strong {
    color: var(--ink-900);
    font-size: 12px;
  }

  .invitation-list span,
  .invitation-list small {
    color: var(--ink-500);
    font-size: 10px;
  }

  .invitation-list button {
    display: inline-flex;
    min-height: 34px;
    flex: 0 0 auto;
    align-items: center;
    gap: 6px;
    padding: 0 11px;
    border: 0;
    border-radius: 9px;
    color: white;
    background: var(--brand-600);
    font-size: 10px;
    font-weight: 600;
  }

  .invitation-list button:disabled {
    opacity: 0.65;
  }

  .loading-state,
  .empty-state {
    display: grid;
    min-height: 340px;
    place-content: center;
    justify-items: center;
    gap: 8px;
    color: var(--ink-400);
    font-size: 11px;
  }

  .empty-state {
    padding: 24px;
    border: 1px dashed var(--border-strong);
    border-radius: 16px;
    background: rgba(255, 255, 255, 0.55);
    text-align: center;
  }

  .empty-state > span {
    display: grid;
    width: 54px;
    height: 54px;
    place-items: center;
    border-radius: 16px;
    color: var(--brand-600);
    background: var(--brand-50);
  }

  .empty-state h2 {
    color: var(--ink-800);
    font-size: 17px;
  }

  .empty-state p {
    max-width: 430px;
    color: var(--ink-500);
    font-size: 11px;
    line-height: 1.5;
  }

  .empty-state button {
    margin-top: 8px;
    color: white;
    background: var(--brand-600);
  }

  .community-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
    align-items: start;
    gap: 18px;
  }

  .community-card {
    display: grid;
    grid-template-rows: 148px auto;
    overflow: hidden;
    border: 1px solid var(--border);
    border-radius: 20px;
    background: var(--panel);
    box-shadow: 0 8px 24px rgba(15, 23, 42, 0.05);
    transition:
      transform var(--motion-fast),
      border-color var(--motion-fast),
      box-shadow var(--motion-fast);
  }

  .community-card:hover {
    transform: translateY(-3px);
    border-color: color-mix(in srgb, var(--brand-500) 25%, var(--border));
    box-shadow: 0 18px 38px rgba(15, 23, 42, 0.11);
  }

  .card-media {
    position: relative;
    display: block;
    overflow: hidden;
  }

  .community-cover {
    display: grid;
    width: 100%;
    height: 148px;
    place-items: center;
    object-fit: cover;
    transition: transform var(--motion-base) ease;
  }

  .community-card:hover .community-cover {
    transform: scale(1.025);
  }

  .cover-placeholder {
    color: var(--brand-600);
    background:
      radial-gradient(
        circle at 20% 15%,
        rgba(255, 255, 255, 0.86),
        transparent 26%
      ),
      linear-gradient(135deg, var(--brand-50), var(--brand-100));
  }

  .visibility-badge {
    position: absolute;
    top: 12px;
    right: 12px;
    display: inline-flex;
    width: 30px;
    height: 30px;
    align-items: center;
    justify-content: center;
    padding: 0;
    border: 1px solid rgba(255, 255, 255, 0.55);
    border-radius: 999px;
    color: #172033;
    background: rgba(255, 255, 255, 0.86);
    box-shadow: 0 5px 14px rgba(15, 23, 42, 0.12);
    backdrop-filter: blur(8px);
  }

  .card-content {
    display: flex;
    min-width: 0;
    flex-direction: column;
    padding: 17px 18px 16px;
  }

  .card-footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
  }

  .community-topic {
    position: absolute;
    bottom: 12px;
    left: 14px;
    width: fit-content;
    padding: 4px 8px;
    border-radius: 999px;
    color: var(--brand-700);
    background: rgba(255, 255, 255, 0.9);
    box-shadow: 0 4px 12px rgba(15, 23, 42, 0.1);
    font-size: 10px;
    font-weight: 600;
    line-height: 1.2;
    backdrop-filter: blur(8px);
  }

  .community-name {
    display: block;
    overflow: hidden;
    color: var(--ink-950);
    font-size: 18px;
    line-height: 1.2;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .community-linkname {
    display: block;
    color: var(--brand-600);
    font-size: 10px;
    font-weight: 600;
  }

  .community-identity {
    display: grid;
    gap: 2px;
  }

  .community-description {
    display: -webkit-box;
    overflow: hidden;
    margin-top: 12px;
    padding-top: 11px;
    border-top: 1px solid color-mix(in srgb, var(--border) 55%, transparent);
    color: var(--ink-500);
    font-size: 11px;
    line-height: 1.5;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 3;
    line-clamp: 3;
  }

  .card-footer {
    margin-top: 15px;
    padding-top: 14px;
    border-top: 1px solid color-mix(in srgb, var(--border) 72%, transparent);
    color: var(--ink-500);
    font-size: 10px;
  }

  .member-copy {
    display: flex;
    align-items: center;
  }

  .avatar-stack {
    display: flex;
    min-width: 0;
    align-items: center;
    padding-left: 1px;
  }

  .member-avatar {
    display: grid;
    width: 30px;
    height: 30px;
    flex: 0 0 30px;
    place-items: center;
    overflow: hidden;
    margin-left: -8px;
    border: 2px solid var(--panel);
    border-radius: 50%;
    color: var(--brand-700);
    background: linear-gradient(145deg, #eef2ff, #dce5ff);
    box-shadow: 0 2px 6px rgba(15, 23, 42, 0.14);
    font-size: 9px;
    font-weight: 700;
    letter-spacing: -0.02em;
  }

  .member-avatar:first-child {
    margin-left: 0;
  }

  .member-avatar img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .avatar-overflow {
    color: var(--brand-700);
    background: #eef2ff;
  }

  .member-copy {
    align-items: baseline;
    gap: 4px;
    line-height: 1;
    text-align: right;
    white-space: nowrap;
  }

  .member-copy strong {
    color: var(--ink-800);
    font-size: 11px;
  }

  .member-copy small {
    color: var(--ink-400);
    font-size: 9px;
  }

  :global(.spin) {
    animation: spin 0.8s linear infinite;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  @media (max-width: 700px) {
    .hero {
      align-items: stretch;
      flex-direction: column;
      padding: 20px;
    }

    .hero > button {
      justify-content: center;
    }

    .invitation-list article {
      align-items: flex-start;
      flex-wrap: wrap;
    }

    .invitation-list button {
      width: 100%;
      justify-content: center;
    }
  }
</style>
