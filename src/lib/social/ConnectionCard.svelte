<script lang="ts">
  import type { Snippet } from "svelte";
  import { parseAvatarProfileUrl } from "$lib/avatar/avatar-options";
  import SocialAvatar from "$lib/social/SocialAvatar.svelte";

  export type ConnectionCardUser = {
    name: string;
    username: string;
    avatarUrl?: string | null;
    coverUrl?: string | null;
  };

  let { user, children } = $props<{
    user: ConnectionCardUser;
    children?: Snippet;
  }>();

  let avatarBackground = $derived(
    parseAvatarProfileUrl(user.avatarUrl ?? "")?.avatarColor ?? "#dbe4ff",
  );
</script>

<article class="connection-card">
  <div class="connection-card__cover" style:background-color={avatarBackground}>
    {#if user.coverUrl}<img src={user.coverUrl} alt="" />{/if}
  </div>
  <SocialAvatar src={user.avatarUrl} name={user.name} size={68} />
  <a class="connection-card__profile" href={`/@${user.username}`}>
    <strong>{user.name}</strong>
    <span>@{user.username}</span>
  </a>
  {#if children}
    <div class="connection-card__extras">{@render children()}</div>
  {/if}
</article>

<style>
  .connection-card {
    position: relative;
    display: grid;
    align-content: start;
    justify-items: center;
    overflow: hidden;
    padding: 0 15px 15px;
    border: 1px solid var(--border);
    border-radius: 15px;
    background: var(--panel);
    text-align: center;
  }
  .connection-card__cover {
    width: calc(100% + 30px);
    height: 62px;
    overflow: hidden;
  }
  .connection-card__cover img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
  .connection-card > :global(.social-avatar) {
    margin-top: -34px;
    box-shadow: 0 0 0 4px white;
  }
  .connection-card__profile {
    display: grid;
    justify-items: center;
    gap: 2px;
    margin-top: 10px;
  }
  .connection-card__profile strong {
    color: var(--ink-800);
    font-size: 13px;
  }
  .connection-card__profile span {
    color: var(--brand-600);
    font-size: 10px;
  }
  .connection-card__profile:hover strong {
    color: var(--brand-700);
  }
  .connection-card__extras {
    display: grid;
    justify-items: center;
    gap: 10px;
    margin-top: 10px;
  }
  .connection-card__extras :global(.connection-card__badge) {
    padding: 4px 7px;
    border-radius: 999px;
    color: var(--ink-400);
    background: var(--surface-soft);
    font-size: 9px;
    font-style: normal;
    font-weight: 700;
  }
  .connection-card__extras :global(.connection-card__badge--highlight) {
    color: var(--brand-700);
    background: var(--brand-50);
  }
  .connection-card__extras :global(.connection-card__action) {
    display: inline-flex;
    min-height: 32px;
    align-items: center;
    gap: 5px;
    padding: 0 10px;
    border: 1px solid var(--border);
    border-radius: 8px;
    color: var(--ink-500);
    background: transparent;
    font-size: 10px;
    font-weight: 600;
  }
  .connection-card__extras :global(.connection-card__action--primary) {
    color: var(--brand-700);
    font-size: 9px;
    font-weight: 700;
  }
  .connection-card__extras :global(.connection-card__action:disabled) {
    cursor: not-allowed;
    opacity: 0.55;
  }
</style>
