<script lang="ts">
  import { goto } from "$app/navigation";
  import PostCard from "$lib/social/PostCard.svelte";

  let { data } = $props();
</script>

<svelte:head>
  <title>Publicação de {data.post.author.name} · Demanda</title>
</svelte:head>

<main class="single-post" aria-label="Publicação">
  <PostCard post={data.post} ondeleted={() => goto("/social/feed")} />
</main>

<style>
  .single-post {
    width: min(100%, 690px);
    margin-inline: auto;
    padding-bottom: 32px;
  }
</style>
