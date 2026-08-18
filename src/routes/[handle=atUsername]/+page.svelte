<script lang="ts">
  import { invalidateAll } from "$app/navigation";
  import {
    answerConnectionRequest,
    disconnect,
    sendConnectionRequest,
  } from "$lib/connections/client";
  import UserProfileView from "$lib/social/UserProfileView.svelte";
  import type { PublicProfileRelationship } from "$lib/server/social/public-profile";

  let { data } = $props();
  let portfolioHref = $derived(`/@${data.profile.username}/portfolio`);
  let relationship = $state<PublicProfileRelationship>("anonymous");
  let connectionBusy = $state(false);
  let connectionError = $state("");

  $effect(() => {
    relationship = data.relationship;
  });

  async function refreshRelationship(): Promise<void> {
    await invalidateAll();
    relationship = data.relationship;
  }

  async function connectProfile(): Promise<void> {
    if (connectionBusy) return;
    connectionBusy = true;
    connectionError = "";
    try {
      if (relationship === "incoming" && data.pendingRequestId) {
        await answerConnectionRequest(data.pendingRequestId, "accept");
        await refreshRelationship();
        return;
      }
      await sendConnectionRequest(data.profile.id);
      relationship = "outgoing";
    } catch (cause) {
      connectionError =
        cause instanceof Error
          ? cause.message
          : "Não foi possível enviar a solicitação.";
    } finally {
      connectionBusy = false;
    }
  }

  async function disconnectProfile(): Promise<void> {
    if (connectionBusy || !confirm(`Desconectar de ${data.profile.name}?`)) {
      return;
    }
    connectionBusy = true;
    connectionError = "";
    try {
      await disconnect(data.profile.id);
      relationship = "none";
      await refreshRelationship();
    } catch (cause) {
      connectionError =
        cause instanceof Error
          ? cause.message
          : "Não foi possível desfazer a conexão.";
    } finally {
      connectionBusy = false;
    }
  }
</script>

<svelte:head>
  <title>{data.profile.name} (@{data.profile.username}) · Demanda</title>
  <meta
    name="description"
    content={data.profile.bio ||
      `Conheça o perfil profissional de ${data.profile.name}.`}
  />
</svelte:head>

<UserProfileView
  profile={data.profile}
  {portfolioHref}
  shelled={Boolean(data.shellData)}
  posts={data.posts}
  canViewPosts={data.canViewPosts}
  {relationship}
  {connectionBusy}
  {connectionError}
  onconnect={connectProfile}
  ondisconnect={disconnectProfile}
/>
