<script lang="ts">
  import { avatarSource, DEFAULT_AVATAR_COLOR } from "./avatar-options";

  let {
    photo = "",
    image = "",
    color = DEFAULT_AVATAR_COLOR,
    alt = "",
  } = $props<{
    photo?: string;
    image?: string;
    color?: string;
    alt?: string;
  }>();
</script>

<span class="avatar" style={`--avatar-background: ${color}`}>
  {#if photo}
    <img class="avatar__photo" src={photo} {alt} />
  {:else}
    <img class="avatar__character" src={avatarSource(image)} {alt} />
  {/if}
</span>

<style>
  .avatar {
    position: relative;
    display: block;
    width: 100%;
    height: 100%;
    overflow: hidden;
    border-radius: inherit;
    background: var(--avatar-background);
  }
  img {
    display: block;
    width: 100%;
    height: 100%;
  }
  .avatar__photo {
    object-fit: cover;
  }
  .avatar__character {
    object-fit: contain;
  }
</style>
