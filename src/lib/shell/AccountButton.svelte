<script lang="ts">
  import { onMount } from "svelte";
  import { LogOut, UserRound } from "@lucide/svelte";
  import Avatar from "$lib/avatar/Avatar.svelte";
  import { currentSettings } from "$lib/settings/client";
  import type { SettingsState } from "$lib/settings/types";
  import { SETTINGS_CHANGED_EVENT } from "$lib/settings/storage";

  let { initialProfile } = $props<{
    initialProfile: SettingsState["profile"];
  }>();
  let root: HTMLDivElement;
  let open = $state(false);
  let name = $state("");
  let username = $state("");
  let photo = $state("");
  let avatarImage = $state("");
  let avatarColor = $state("");

  function applyProfile(profile: SettingsState["profile"]): void {
    name = profile.name.trim() || profile.username.trim() || "Usuário";
    username = profile.username.trim().replace(/^@+/, "") || "usuario";
    photo = profile.photo;
    avatarImage = profile.avatarImage;
    avatarColor = profile.avatarColor;
  }

  function initializeProfile(): void {
    applyProfile(initialProfile);
  }

  initializeProfile();

  function syncProfile(): void {
    applyProfile(currentSettings().profile);
  }

  onMount(() => {
    window.addEventListener(SETTINGS_CHANGED_EVENT, syncProfile);
    window.addEventListener("storage", syncProfile);

    const closeOnOutsideClick = (event: PointerEvent) => {
      if (!root.contains(event.target as Node)) open = false;
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") open = false;
    };

    document.addEventListener("pointerdown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);

    return () => {
      window.removeEventListener(SETTINGS_CHANGED_EVENT, syncProfile);
      window.removeEventListener("storage", syncProfile);
      document.removeEventListener("pointerdown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  });
</script>

<div class="account" class:expanded={open} bind:this={root}>
  <button
    class="account-button"
    type="button"
    title={`Perfil de ${name}`}
    aria-label={`Abrir menu do perfil de ${name}`}
    aria-haspopup="menu"
    aria-expanded={open}
    onclick={() => (open = !open)}
  >
    <span class="identity" aria-hidden="true">
      <span class="identity-content">
        <strong>{name}</strong>
        <small>@{username}</small>
      </span>
    </span>
    <span class="avatar"
      ><Avatar {photo} image={avatarImage} color={avatarColor} alt="" /></span
    >
  </button>

  {#if open}
    <div class="profile-menu" role="menu" aria-label="Opções do perfil">
      <a href="/social/usuario" role="menuitem" onclick={() => (open = false)}>
        <UserRound size={17} aria-hidden="true" />
        <span>Ver perfil</span>
      </a>
      <form method="POST" action="/logout">
        <button class="logout" type="submit" role="menuitem">
          <LogOut size={17} aria-hidden="true" />
          <span>Sair</span>
        </button>
      </form>
    </div>
  {/if}
</div>

<style>
  .account {
    position: relative;
    display: flex;
    align-items: center;
  }
  .account-button {
    display: flex;
    min-width: 42px;
    height: 42px;
    align-items: center;
    justify-content: flex-end;
    padding: 3px;
    border: 0;
    border-radius: var(--radius-pill);
    background: transparent;
    cursor: pointer;
  }
  .account-button:hover {
    background: var(--surface-soft);
  }
  .account-button[aria-expanded="true"] {
    background: var(--surface-soft);
  }
  .identity {
    display: block;
    max-width: 0;
    overflow: hidden;
    opacity: 0;
    transform: translateX(12px);
    transition:
      max-width var(--motion-base) ease,
      opacity var(--motion-fast) ease,
      transform var(--motion-base) ease;
  }
  .expanded .identity {
    max-width: 180px;
    opacity: 1;
    transform: translateX(0);
  }
  .identity-content {
    display: flex;
    min-width: 0;
    flex-direction: column;
    align-items: flex-end;
    margin: 0 9px 0 8px;
    line-height: 1.15;
    text-align: right;
    white-space: nowrap;
  }
  .identity strong,
  .identity small {
    display: block;
    max-width: 160px;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .identity strong {
    color: var(--ink-800);
    font-size: var(--text-sm);
    font-weight: 600;
  }
  .identity small {
    margin-top: 2px;
    color: var(--ink-500);
    font-size: var(--text-xs);
  }
  .avatar {
    flex: 0 0 auto;
    display: block;
    width: 36px;
    height: 36px;
    border: 2px solid var(--panel);
    border-radius: 50%;
    box-shadow: 0 0 0 1px var(--border);
    overflow: hidden;
  }
  .profile-menu {
    position: absolute;
    z-index: 40;
    top: calc(100% + 9px);
    right: 0;
    display: grid;
    width: 174px;
    padding: 6px;
    border: 1px solid var(--border);
    border-radius: 12px;
    background: var(--surface);
    box-shadow: 0 16px 38px rgba(15, 23, 42, 0.18);
    animation: menu-in var(--motion-fast) ease-out;
  }
  .profile-menu::before,
  .profile-menu::after {
    position: absolute;
    right: 13px;
    width: 0;
    height: 0;
    border-style: solid;
    content: "";
  }
  .profile-menu::before {
    top: -8px;
    border-width: 0 8px 8px;
    border-color: transparent transparent var(--border);
  }
  .profile-menu::after {
    top: -7px;
    right: 14px;
    border-width: 0 7px 7px;
    border-color: transparent transparent var(--surface);
  }
  .profile-menu button,
  .profile-menu a {
    display: flex;
    width: 100%;
    min-height: 40px;
    align-items: center;
    gap: 10px;
    padding: 0 10px;
    border: 0;
    border-radius: 8px;
    color: var(--ink-700);
    background: transparent;
    font: inherit;
    font-size: var(--text-sm);
    text-decoration: none;
    text-align: left;
  }
  .profile-menu form {
    width: 100%;
  }
  .profile-menu button:hover,
  .profile-menu button:focus-visible,
  .profile-menu a:hover,
  .profile-menu a:focus-visible {
    color: var(--brand-600);
    background: var(--brand-50);
    outline: 0;
  }
  .profile-menu button.logout {
    color: var(--red-500);
  }
  .profile-menu button.logout:hover,
  .profile-menu button.logout:focus-visible {
    background: color-mix(in srgb, var(--red-500) 7%, transparent);
  }
  @keyframes menu-in {
    from {
      opacity: 0;
      transform: translateY(-4px) scale(0.98);
    }
  }
  @media (max-width: 560px) {
    .expanded .identity {
      max-width: 126px;
    }
    .identity strong,
    .identity small {
      max-width: 106px;
    }
  }
</style>
