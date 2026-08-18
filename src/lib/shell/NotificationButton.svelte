<script lang="ts">
  import {
    acceptWorkspaceInvitation,
    loadPendingWorkspaceInvitations,
    observeWorkspaces,
    type IncomingWorkspaceInvitation,
  } from "$lib/workspaces/workspace-storage";
  import {
    answerConnectionRequest,
    loadConnections,
  } from "$lib/connections/client";
  import type { ConnectionRequestSummary } from "$lib/server/connections/service";
  import SocialAvatar from "$lib/social/SocialAvatar.svelte";
  import { Bell, Check, Network, UsersRound, X } from "@lucide/svelte";
  import { onMount } from "svelte";

  let root: HTMLDivElement;
  let open = $state(false);
  let invitations = $state<IncomingWorkspaceInvitation[]>([]);
  let acceptingId = $state("");
  let message = $state("");
  let connectionRequests = $state<ConnectionRequestSummary[]>([]);
  let notificationCount = $derived(
    invitations.length + connectionRequests.length,
  );
  let visibleNotificationCount = $derived(
    notificationCount > 99 ? "99+" : String(notificationCount),
  );

  const NOTIFICATION_REFRESH_INTERVAL = 30_000;

  function refresh(): void {
    invitations = loadPendingWorkspaceInvitations();
  }

  async function refreshConnections(): Promise<void> {
    try {
      const snapshot = await loadConnections();
      connectionRequests = snapshot.requests.filter(
        (request) => request.direction === "incoming",
      );
    } catch {
      // Mantém a última contagem conhecida durante falhas transitórias de rede.
    }
  }

  onMount(() => {
    refresh();
    void refreshConnections();
    const stop = observeWorkspaces(refresh);
    const refreshOnFocus = () => void refreshConnections();
    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") void refreshConnections();
    };
    const refreshInterval = window.setInterval(
      () => void refreshConnections(),
      NOTIFICATION_REFRESH_INTERVAL,
    );
    const closeOutside = (event: PointerEvent) => {
      if (!root.contains(event.target as Node)) open = false;
    };
    const closeEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") open = false;
    };
    window.addEventListener("focus", refreshOnFocus);
    document.addEventListener("visibilitychange", refreshWhenVisible);
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("keydown", closeEscape);
    return () => {
      stop();
      window.clearInterval(refreshInterval);
      window.removeEventListener("focus", refreshOnFocus);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
      document.removeEventListener("pointerdown", closeOutside);
      document.removeEventListener("keydown", closeEscape);
    };
  });

  async function accept(
    invitation: IncomingWorkspaceInvitation,
  ): Promise<void> {
    acceptingId = invitation.id;
    message = "";
    try {
      await acceptWorkspaceInvitation(invitation.id);
      message = `Convite para ${invitation.workspaceName} aceito.`;
    } catch (cause) {
      message =
        cause instanceof Error
          ? cause.message
          : "Não foi possível aceitar o convite.";
    } finally {
      acceptingId = "";
    }
  }

  async function acceptConnection(
    invitation: ConnectionRequestSummary,
  ): Promise<void> {
    acceptingId = invitation.id;
    message = "";
    try {
      await answerConnectionRequest(invitation.id, "accept");
      connectionRequests = connectionRequests.filter(
        (request) => request.id !== invitation.id,
      );
      message = `Você e ${invitation.user.name} agora estão conectados.`;
    } catch (cause) {
      message =
        cause instanceof Error
          ? cause.message
          : "Não foi possível aceitar a conexão.";
    } finally {
      acceptingId = "";
    }
  }

  function toggle(): void {
    open = !open;
    if (open) void refreshConnections();
  }
</script>

<div class="notification" bind:this={root}>
  <button
    class="trigger"
    type="button"
    aria-label={`Notificações${notificationCount ? `: ${notificationCount} convite(s) pendente(s)` : ""}`}
    aria-haspopup="dialog"
    aria-expanded={open}
    title="Notificações"
    onclick={toggle}
  >
    <Bell size={19} />
    {#if notificationCount > 0}
      <span class="badge" aria-hidden="true">{visibleNotificationCount}</span>
    {/if}
  </button>

  {#if open}
    <section class="menu" aria-label="Notificações">
      <header>
        <div>
          <strong>Notificações</strong><small>Convites e solicitações</small>
        </div>
        <button
          class="close"
          type="button"
          aria-label="Fechar notificações"
          onclick={() => (open = false)}><X size={16} /></button
        >
      </header>
      {#if message}<p class="message" role="status">{message}</p>{/if}
      {#if invitations.length === 0 && connectionRequests.length === 0}
        <div class="empty">
          <Bell size={20} /><span>Nenhuma notificação pendente.</span>
        </div>
      {:else}
        <div class="items">
          {#each connectionRequests as invitation (invitation.id)}
            <article>
              <SocialAvatar
                src={invitation.user.avatarUrl}
                name={invitation.user.name}
                size={36}
              />
              <div class="copy">
                <strong>{invitation.user.name}</strong>
                <p>@{invitation.user.username} quer se conectar com você.</p>
                <button
                  type="button"
                  disabled={acceptingId !== ""}
                  onclick={() => acceptConnection(invitation)}
                >
                  <Network size={14} />{acceptingId === invitation.id
                    ? "Aceitando…"
                    : "Aceitar conexão"}
                </button>
              </div>
            </article>
          {/each}
          {#each invitations as invitation (invitation.id)}
            <article>
              <span class="icon"><UsersRound size={18} /></span>
              <div class="copy">
                <strong>{invitation.workspaceName}</strong>
                <p>{invitation.invitedBy.name} convidou você para colaborar.</p>
                <button
                  type="button"
                  disabled={acceptingId !== ""}
                  onclick={() => accept(invitation)}
                >
                  <Check size={14} />{acceptingId === invitation.id
                    ? "Aceitando…"
                    : "Aceitar convite"}
                </button>
              </div>
            </article>
          {/each}
        </div>
      {/if}
    </section>
  {/if}
</div>

<style>
  .notification {
    position: relative;
  }
  button {
    font: inherit;
  }
  .trigger {
    position: relative;
    display: grid;
    width: 40px;
    height: 40px;
    place-items: center;
    border: 0;
    border-radius: 11px;
    color: var(--ink-500);
    background: transparent;
  }
  .trigger:hover,
  .trigger[aria-expanded="true"] {
    color: var(--ink-800);
    background: var(--surface-soft);
  }
  .badge {
    position: absolute;
    z-index: 1;
    top: -3px;
    right: -4px;
    display: inline-flex;
    min-width: 19px;
    height: 19px;
    align-items: center;
    justify-content: center;
    padding: 0 5px;
    border: 2px solid var(--panel);
    border-radius: 999px;
    color: white;
    background: var(--red-500);
    box-shadow: 0 1px 3px rgba(127, 29, 29, 0.3);
    font-size: 10px;
    font-weight: 800;
    line-height: 1;
    pointer-events: none;
  }
  .menu {
    position: absolute;
    z-index: 60;
    top: calc(100% + 10px);
    right: 0;
    width: min(370px, calc(100vw - 20px));
    overflow: hidden;
    border: 1px solid var(--border);
    border-radius: 14px;
    background: var(--surface);
    box-shadow: 0 18px 42px rgba(15, 23, 42, 0.2);
  }
  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 13px 14px;
    border-bottom: 1px solid var(--border);
  }
  header strong,
  header small {
    display: block;
  }
  header strong {
    color: var(--ink-800);
    font-size: var(--text-sm);
  }
  header small {
    margin-top: 2px;
    color: var(--ink-400);
    font-size: 10px;
  }
  .close {
    display: grid;
    width: 30px;
    height: 30px;
    place-items: center;
    border: 0;
    border-radius: 8px;
    color: var(--ink-500);
    background: var(--surface-soft);
  }
  .message {
    margin: 9px 10px 0;
    padding: 8px 9px;
    border-radius: 8px;
    color: var(--brand-700);
    background: var(--brand-50);
    font-size: 11px;
  }
  .items {
    display: grid;
    max-height: min(420px, 60vh);
    overflow-y: auto;
  }
  article {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    gap: 10px;
    padding: 12px 14px;
    border-bottom: 1px solid var(--border);
  }
  article:last-child {
    border-bottom: 0;
  }
  .icon {
    display: grid;
    width: 36px;
    height: 36px;
    place-items: center;
    border-radius: 10px;
    color: var(--brand-600);
    background: var(--brand-50);
  }
  .copy {
    min-width: 0;
  }
  .copy strong {
    color: var(--ink-800);
    font-size: var(--text-sm);
  }
  .copy p {
    margin-top: 2px;
    color: var(--ink-500);
    font-size: 11px;
    line-height: 1.4;
  }
  .copy button {
    display: inline-flex;
    min-height: 30px;
    align-items: center;
    gap: 5px;
    margin-top: 8px;
    padding: 0 9px;
    border: 0;
    border-radius: 8px;
    color: white;
    background: var(--brand-600);
    font-size: 11px;
    font-weight: 700;
  }
  .copy button:disabled {
    opacity: 0.62;
  }
  .empty {
    display: grid;
    min-height: 130px;
    place-content: center;
    justify-items: center;
    gap: 8px;
    color: var(--ink-400);
    font-size: var(--text-xs);
  }
</style>
