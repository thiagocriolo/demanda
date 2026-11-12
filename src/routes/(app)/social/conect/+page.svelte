<script lang="ts">
  import { onMount } from "svelte";
  import {
    Check,
    Clock3,
    LoaderCircle,
    Network,
    UserMinus,
    UserPlus,
    X,
  } from "@lucide/svelte";
  import {
    answerConnectionRequest,
    disconnect,
    loadConnections,
    sendConnectionRequest,
  } from "$lib/connections/client";
  import type {
    ConnectionDashboard,
    ConnectionUserSearchResult,
  } from "$lib/server/connections/service";
  import ConnectionCard from "$lib/social/ConnectionCard.svelte";
  import SocialAvatar from "$lib/social/SocialAvatar.svelte";
  import { relativeTime } from "$lib/social/time";
  import UserSearch from "$lib/ui/UserSearch.svelte";

  let snapshot = $state<ConnectionDashboard>({ connections: [], requests: [] });
  let loading = $state(true);
  let busyId = $state("");
  let error = $state("");
  let notice = $state("");
  let disconnecting = $state<string | null>(null);
  let incoming = $derived(
    snapshot.requests.filter((request) => request.direction === "incoming"),
  );
  let outgoing = $derived(
    snapshot.requests.filter((request) => request.direction === "outgoing"),
  );
  let connectedIds = $derived(
    new Set(snapshot.connections.map((connection) => connection.id)),
  );
  let pendingIds = $derived(
    new Set(snapshot.requests.map((request) => request.user.id)),
  );

  onMount(() => void refresh());

  async function refresh() {
    loading = true;
    try {
      snapshot = await loadConnections();
    } catch (cause) {
      error =
        cause instanceof Error
          ? cause.message
          : "Não foi possível carregar suas conexões.";
    } finally {
      loading = false;
    }
  }

  async function request(userId: string) {
    busyId = userId;
    try {
      const created = await sendConnectionRequest(userId);
      snapshot.requests = [created, ...snapshot.requests];
      notice = "Solicitação enviada. A pessoa receberá uma notificação.";
    } catch (cause) {
      error =
        cause instanceof Error
          ? cause.message
          : "Não foi possível enviar a solicitação.";
    } finally {
      busyId = "";
    }
  }

  function connectionAction(user: ConnectionUserSearchResult) {
    if (connectedIds.has(user.id)) {
      return { label: "Conectado", icon: Check, disabled: true };
    }
    if (pendingIds.has(user.id)) {
      return { label: "Pendente", icon: Clock3, disabled: true };
    }
    return {
      label: busyId === user.id ? "Enviando…" : "Conectar",
      icon: UserPlus,
      disabled: busyId !== "",
      busy: busyId === user.id,
    };
  }

  async function answer(
    requestId: string,
    action: "accept" | "decline" | "cancel",
  ) {
    busyId = requestId;
    error = "";
    try {
      await answerConnectionRequest(requestId, action);
      await refresh();
      notice =
        action === "accept"
          ? "Conexão aceita."
          : action === "decline"
            ? "Solicitação recusada."
            : "Solicitação cancelada.";
    } catch (cause) {
      error =
        cause instanceof Error
          ? cause.message
          : "Não foi possível atualizar a solicitação.";
    } finally {
      busyId = "";
    }
  }

  async function confirmDisconnect() {
    if (!disconnecting) return;
    busyId = disconnecting;
    try {
      await disconnect(disconnecting);
      snapshot.connections = snapshot.connections.filter(
        (connection) => connection.id !== disconnecting,
      );
      notice = "Conexão desfeita.";
      disconnecting = null;
    } catch (cause) {
      error =
        cause instanceof Error
          ? cause.message
          : "Não foi possível desfazer a conexão.";
    } finally {
      busyId = "";
    }
  }
</script>

<svelte:head><title>Conexões · Social · Demanda</title></svelte:head>

<section class="connections-page">
  {#if error}<p class="alert" role="alert">{error}</p>{/if}
  {#if notice}<p class="notice" role="status">{notice}</p>{/if}

  <header class="search-header">
    <div class="header-content">
      <div class="header-copy">
        <h1>Crie novas conexões</h1>
      </div>
      <div class="search-control">
        <UserSearch
          selection="action"
          display="social"
          label="Encontrar pessoas por usuário ou e-mail"
          placeholder="Digite @usuário, usuário ou e-mail"
          emptyMessage="Nenhuma conta encontrada para esse usuário ou e-mail."
          icon={UserPlus}
          actionFor={connectionAction}
          onaction={(user) => void request(user.id)}
          onerror={(message) => (error = message)}
        />
      </div>
    </div>
    <strong class="connection-count">
      {snapshot.connections.length}
      <small>{snapshot.connections.length === 1 ? "conexão" : "conexões"}</small
      >
    </strong>
  </header>

  {#if incoming.length > 0 || outgoing.length > 0}
    <section class="requests-section">
      <div class="section-title">
        <div>
          <h2>Solicitações</h2>
          <p>Convites aguardando uma resposta.</p>
        </div>
        <span>{snapshot.requests.length}</span>
      </div>
      <div class="request-grid">
        {#each incoming as request (request.id)}
          <article class="request-card">
            <SocialAvatar
              src={request.user.avatarUrl}
              name={request.user.name}
              size={50}
            />
            <div>
              <strong>{request.user.name}</strong><span
                >@{request.user.username} · {relativeTime(
                  request.createdAt,
                )}</span
              >
            </div>
            <div class="request-actions">
              <button
                class="accept"
                disabled={busyId !== ""}
                type="button"
                onclick={() => answer(request.id, "accept")}
                ><Check size={15} />Aceitar</button
              >
              <button
                disabled={busyId !== ""}
                type="button"
                onclick={() => answer(request.id, "decline")}
                ><X size={15} />Recusar</button
              >
            </div>
          </article>
        {/each}
        {#each outgoing as request (request.id)}
          <article class="request-card outgoing">
            <SocialAvatar
              src={request.user.avatarUrl}
              name={request.user.name}
              size={50}
            />
            <div>
              <strong>{request.user.name}</strong><span
                >Solicitação enviada {relativeTime(request.createdAt)}</span
              >
            </div>
            <div class="request-actions">
              <button
                disabled={busyId !== ""}
                type="button"
                onclick={() => answer(request.id, "cancel")}
                ><X size={15} />Cancelar</button
              >
            </div>
          </article>
        {/each}
      </div>
    </section>
  {/if}

  <section class="network-section">
    {#if loading}
      <div class="state">
        <LoaderCircle class="spin" size={21} />Carregando conexões…
      </div>
    {:else if snapshot.connections.length === 0}
      <div class="state">
        <Network size={25} /><strong>Sua rede ainda está vazia</strong><span
          >Encontre alguém acima ou compartilhe um workspace.</span
        >
      </div>
    {:else}
      <div class="connection-grid">
        {#each snapshot.connections as connection (connection.id)}
          <ConnectionCard user={connection}>
            <button
              class="connection-card__action"
              type="button"
              onclick={() => (disconnecting = connection.id)}
              ><UserMinus size={15} />Desconectar</button
            >
          </ConnectionCard>
        {/each}
      </div>
    {/if}
  </section>
</section>

{#if disconnecting}
  <div
    class="modal-backdrop"
    role="presentation"
    onclick={(event) => {
      if (event.target === event.currentTarget) disconnecting = null;
    }}
  >
    <div
      class="confirm-modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="disconnect-title"
    >
      <span><UserMinus size={22} /></span>
      <h2 id="disconnect-title">Desconectar?</h2>
      <p>
        Esse processo é manual. A pessoa deixará de aparecer na sua rede e no
        seu feed.
      </p>
      <div>
        <button type="button" onclick={() => (disconnecting = null)}
          >Cancelar</button
        ><button
          class="danger"
          type="button"
          disabled={busyId !== ""}
          onclick={confirmDisconnect}>Desfazer</button
        >
      </div>
    </div>
  </div>
{/if}

<style>
  .connections-page {
    display: grid;
    width: min(100%, var(--social-content-width));
    gap: 18px;
    margin-inline: auto;
  }
  .search-header {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    gap: 16px;
    padding: 14px;
    border: 1px solid rgba(46, 86, 255, 0.18);
    border-radius: 18px;
    background: linear-gradient(
      130deg,
      rgba(255, 255, 255, 0.96),
      rgba(235, 240, 255, 0.96)
    );
  }
  .header-content {
    display: grid;
    min-width: 0;
    align-content: center;
    gap: 9px;
  }
  .header-copy {
    min-width: 0;
  }
  .search-header h1 {
    color: var(--ink-800);
    font-size: 18px;
  }
  h2 {
    color: var(--ink-800);
    font-size: 15px;
  }
  .section-title p {
    margin-top: 3px;
    color: var(--ink-400);
    font-size: 10px;
  }
  .search-control {
    position: relative;
    width: min(100%, 520px);
    min-width: 0;
  }
  .connection-count {
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
  .connection-count small {
    color: var(--ink-400);
    font-size: 10px;
    font-weight: 500;
    line-height: 1;
  }
  .search-control :global(.selector-control) {
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
  .search-control :global(.selector-control:focus-within) {
    border-color: var(--brand-500);
    box-shadow: var(--focus-ring);
  }
  .search-control :global(.selector-control input) {
    font-size: 12px;
  }
  .search-control :global(.selector-control input::placeholder) {
    color: var(--ink-400);
  }
  .search-control :global(.dropdown) {
    z-index: 30;
    top: calc(100% + 8px);
    border-radius: 12px;
    background: var(--panel);
    box-shadow: 0 14px 34px rgba(15, 23, 42, 0.14);
  }
  .search-control :global(.dropdown ul) {
    padding: 0;
  }
  .search-control :global(.dropdown li > button) {
    min-height: 58px;
    gap: 10px;
    padding: 11px 12px;
    border-radius: 0;
    border-bottom: 1px solid var(--border);
    transition: background 0.15s ease;
  }
  .search-control :global(.dropdown li > button:hover),
  .search-control :global(.dropdown li > button.active) {
    background: var(--surface);
  }
  .search-control :global(.dropdown li:last-child > button) {
    border-bottom: 0;
  }
  .search-control :global(.option-copy strong),
  .request-card strong {
    color: var(--ink-800);
    font-size: 12px;
  }
  .search-control :global(.option-copy small),
  .request-card span {
    color: var(--ink-400);
    font-size: 10px;
  }
  .search-control :global(.item-action) {
    min-height: 34px;
    padding: 0 12px;
    border-radius: 8px;
    color: white;
    background: var(--brand-600);
    font-size: 11px;
  }
  .search-control :global(button[aria-disabled="true"] .item-action) {
    color: var(--ink-500);
    background: var(--surface-soft);
  }
  .search-control :global(.empty-state) {
    min-height: 58px;
    padding: 14px;
    line-height: 1.4;
  }
  .section-title {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 10px;
  }
  .section-title > span {
    display: grid;
    min-width: 27px;
    height: 27px;
    place-items: center;
    border-radius: 8px;
    color: var(--brand-700);
    background: var(--brand-50);
    font-size: 11px;
    font-weight: 600;
  }
  .request-grid,
  .connection-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(230px, 1fr));
    gap: 12px;
  }
  .request-card {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    align-items: center;
    gap: 11px;
    padding: 14px;
    border: 1px solid var(--border);
    border-radius: 14px;
    background: var(--panel);
  }
  .request-card > div:nth-child(2) {
    display: grid;
    gap: 3px;
  }
  .request-actions {
    display: flex;
    grid-column: 1/-1;
    gap: 7px;
  }
  .request-actions button {
    display: inline-flex;
    min-height: 33px;
    flex: 1;
    align-items: center;
    justify-content: center;
    gap: 5px;
    border: 1px solid var(--border);
    border-radius: 8px;
    color: var(--ink-600);
    background: var(--surface);
    font-size: 10px;
    font-weight: 600;
  }
  .request-actions .accept {
    border-color: var(--brand-600);
    color: white;
    background: var(--brand-600);
  }
  .state {
    display: grid;
    min-height: 180px;
    place-content: center;
    justify-items: center;
    gap: 7px;
    border: 1px dashed var(--border-strong);
    border-radius: 14px;
    color: var(--ink-400);
    font-size: 11px;
  }
  .state strong {
    color: var(--ink-700);
    font-size: 13px;
  }
  .alert,
  .notice {
    padding: 10px 13px;
    border-radius: 10px;
    font-size: 11px;
  }
  .alert {
    border: 1px solid rgba(220, 38, 38, 0.22);
    color: #991b1b;
    background: rgba(220, 38, 38, 0.07);
  }
  .notice {
    border: 1px solid rgba(93, 172, 131, 0.25);
    color: #276749;
    background: rgba(93, 172, 131, 0.1);
  }
  .modal-backdrop {
    position: fixed;
    z-index: 100;
    inset: 0;
    display: grid;
    place-items: center;
    padding: 20px;
    background: rgba(15, 23, 42, 0.5);
    backdrop-filter: blur(3px);
  }
  .confirm-modal {
    display: grid;
    width: min(390px, 100%);
    justify-items: center;
    padding: 24px;
    border-radius: 16px;
    background: white;
    text-align: center;
    box-shadow: var(--shadow-md);
  }
  .confirm-modal > span {
    display: grid;
    width: 46px;
    height: 46px;
    place-items: center;
    border-radius: 50%;
    color: var(--red-500);
    background: rgba(220, 38, 38, 0.08);
  }
  .confirm-modal h2 {
    margin-top: 12px;
    font-size: 18px;
  }
  .confirm-modal p {
    margin-top: 7px;
    color: var(--ink-500);
    font-size: 11px;
    line-height: 1.5;
  }
  .confirm-modal > div {
    display: flex;
    width: 100%;
    gap: 8px;
    margin-top: 18px;
  }
  .confirm-modal button {
    min-height: 37px;
    flex: 1;
    border: 1px solid var(--border);
    border-radius: 9px;
    background: white;
    font-weight: 600;
  }
  .confirm-modal .danger {
    border-color: var(--red-500);
    color: white;
    background: var(--red-500);
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
    .search-header {
      gap: 12px;
      padding: 12px;
    }
    .connection-count {
      width: 68px;
      height: 68px;
      font-size: 32px;
    }
  }
</style>
