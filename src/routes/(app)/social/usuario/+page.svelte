<script lang="ts">
  import { onMount } from "svelte";
  import { Check } from "@lucide/svelte";
  import AvatarPickerModal from "$lib/avatar/AvatarPickerModal.svelte";
  import {
    deleteStoredFile,
    storedFileIdFromUrl,
    uploadStoredFile,
  } from "$lib/files/client";
  import {
    currentSettings,
    loadSettingsFromServer,
    savePersonalSettings,
  } from "$lib/settings/client";
  import ConfigSaveController from "$lib/settings/ConfigSaveController.svelte";
  import { defaultSettings } from "$lib/settings/defaults";
  import type { SettingsState } from "$lib/settings/types";
  import UserProfileView from "$lib/social/UserProfileView.svelte";

  type UserProfile = SettingsState["profile"];
  type TextField =
    "name" | "username" | "profession" | "bio" | "email" | "phone";

  let { data } = $props();

  let profile = $state<UserProfile>(structuredClone(defaultSettings.profile));
  let message = $state("");
  let formError = $state("");
  let saving = $state(false);
  let avatarModalOpen = $state(false);
  let editField = $state<"cover" | null>(null);
  let pendingPhotoFile = $state<File | undefined>();
  let pendingCoverFile = $state<File | undefined>();
  let persistedPhoto = $state("");
  let persistedCover = $state("");
  let coverObjectUrl = $state("");
  let savedProfile = $state("");
  let messageTimer: ReturnType<typeof setTimeout> | undefined;

  let hasUnsavedChanges = $derived(
    savedProfile !== "" &&
      (JSON.stringify(profile) !== savedProfile ||
        pendingPhotoFile !== undefined ||
        pendingCoverFile !== undefined),
  );
  let portfolioHref = $derived(`/@${profile.username || "usuario"}/portfolio`);

  onMount(() => {
    profile = structuredClone(currentSettings().profile);
    persistedPhoto = profile.photo;
    persistedCover = profile.cover;
    savedProfile = JSON.stringify(profile);
    void loadSettingsFromServer()
      .then((settings) => {
        profile = structuredClone(settings.profile);
        persistedPhoto = settings.profile.photo;
        persistedCover = settings.profile.cover;
        savedProfile = JSON.stringify(profile);
      })
      .catch((error) => {
        formError =
          error instanceof Error
            ? error.message
            : "Não foi possível carregar o perfil.";
      });
    return () => {
      if (messageTimer) clearTimeout(messageTimer);
      if (coverObjectUrl) URL.revokeObjectURL(coverObjectUrl);
    };
  });

  function showMessage(value: string): void {
    message = value;
    if (messageTimer) clearTimeout(messageTimer);
    messageTimer = setTimeout(() => (message = ""), 2800);
  }

  function handleEdit(field: string): void {
    formError = "";
    if (field === "avatar") {
      avatarModalOpen = true;
      return;
    }
    if (field === "cover") editField = "cover";
  }

  function cancelEditing(): void {
    editField = null;
    formError = "";
  }

  function updateTextField(field: TextField, value: string): void {
    profile[field] = value;
    formError = "";
  }

  function selectCover(event: Event): void {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = "";
    if (!file) return;
    if (coverObjectUrl) URL.revokeObjectURL(coverObjectUrl);
    coverObjectUrl = URL.createObjectURL(file);
    pendingCoverFile = file;
    profile.cover = coverObjectUrl;
    cancelEditing();
  }

  function removeCover(): void {
    if (coverObjectUrl) URL.revokeObjectURL(coverObjectUrl);
    coverObjectUrl = "";
    pendingCoverFile = undefined;
    profile.cover = "";
    cancelEditing();
  }

  function updateAvatar(value: {
    avatarImage: string;
    avatarColor: string;
    photo: string;
    photoFile?: File;
  }): void {
    profile.avatarImage = value.avatarImage;
    profile.avatarColor = value.avatarColor;
    profile.photo = value.photo;
    pendingPhotoFile = value.photoFile;
    avatarModalOpen = false;
  }

  async function save(): Promise<void> {
    if (saving) return;
    message = "";
    formError = "";

    const name = profile.name.trim();
    const username = profile.username.trim().replace(/^@+/, "");
    if (!name || !username) {
      formError = "Preencha o nome e o nome de usuário para salvar o perfil.";
      throw new Error(formError);
    }

    saving = true;
    let settings = currentSettings();
    const uploadedFileIds: string[] = [];
    let photo = profile.photo;
    let cover = profile.cover;
    try {
      if (pendingPhotoFile) {
        const uploaded = await uploadStoredFile(
          pendingPhotoFile,
          "profile_avatar",
        );
        photo = uploaded.file.url;
        uploadedFileIds.push(uploaded.file.id);
      }
      if (pendingCoverFile) {
        const uploaded = await uploadStoredFile(
          pendingCoverFile,
          "profile_avatar",
        );
        cover = uploaded.file.url;
        uploadedFileIds.push(uploaded.file.id);
      }

      settings.profile = {
        photo,
        cover,
        avatarImage: profile.avatarImage,
        avatarColor: profile.avatarColor,
        username,
        name,
        profession: profile.profession.trim(),
        email: profile.email.trim(),
        phone: profile.phone.trim(),
        bio: profile.bio.trim(),
      };
      settings = await savePersonalSettings(settings);

      const previousFileId = storedFileIdFromUrl(persistedPhoto);
      const previousCoverFileId = storedFileIdFromUrl(persistedCover);
      profile = structuredClone(settings.profile);
      pendingPhotoFile = undefined;
      pendingCoverFile = undefined;
      const currentFileId = storedFileIdFromUrl(profile.photo);
      const currentCoverFileId = storedFileIdFromUrl(profile.cover);
      persistedPhoto = profile.photo;
      persistedCover = profile.cover;
      if (coverObjectUrl) URL.revokeObjectURL(coverObjectUrl);
      coverObjectUrl = "";
      savedProfile = JSON.stringify(profile);

      const currentFileIds = new Set(
        [currentFileId, currentCoverFileId].filter(
          (id): id is string => id !== null,
        ),
      );
      if (previousFileId && !currentFileIds.has(previousFileId)) {
        await deleteStoredFile(previousFileId).catch(() => undefined);
      }
      if (
        previousCoverFileId &&
        previousCoverFileId !== previousFileId &&
        !currentFileIds.has(previousCoverFileId)
      ) {
        await deleteStoredFile(previousCoverFileId).catch(() => undefined);
      }
      showMessage("Perfil atualizado com sucesso");
    } catch (error) {
      await Promise.all(
        uploadedFileIds.map((fileId) =>
          deleteStoredFile(fileId).catch(() => undefined),
        ),
      );
      formError =
        error instanceof Error
          ? error.message
          : "Não foi possível salvar o perfil.";
      throw error;
    } finally {
      saving = false;
    }
  }
</script>

<svelte:head><title>Perfil do usuário · Demanda</title></svelte:head>

<ConfigSaveController dirty={hasUnsavedChanges} onsave={save} />

<section class="profile-page" aria-label="Perfil do usuário">
  {#if formError}
    <div class="profile-alert" role="alert">{formError}</div>
  {/if}
  {#if message}
    <div class="profile-toast" role="status">
      <Check size={16} />{message}
    </div>
  {/if}

  <UserProfileView
    {profile}
    {portfolioHref}
    shelled
    editable
    editingField={editField}
    onedit={handleEdit}
    onfieldchange={updateTextField}
    oncancel={cancelEditing}
    oncoverchange={selectCover}
    oncoverremove={removeCover}
    posts={data.posts}
    canViewPosts
  />
</section>

<AvatarPickerModal
  open={avatarModalOpen}
  avatarImage={profile.avatarImage}
  avatarColor={profile.avatarColor}
  photo={profile.photo}
  oncancel={() => (avatarModalOpen = false)}
  onconfirm={updateAvatar}
/>

<style>
  .profile-page {
    position: relative;
    width: min(100%, var(--social-content-width));
    margin-inline: auto;
  }
  .profile-alert,
  .profile-toast {
    position: fixed;
    z-index: 900;
    top: 78px;
    right: 24px;
    max-width: min(380px, calc(100vw - 32px));
    padding: 11px 14px;
    border-radius: 12px;
    box-shadow: 0 12px 30px rgba(15, 23, 42, 0.16);
    font-size: var(--text-sm);
  }
  .profile-alert {
    border: 1px solid rgba(220, 38, 38, 0.28);
    color: #991b1b;
    background: #fff7f7;
  }
  .profile-toast {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    border: 1px solid rgba(22, 163, 74, 0.25);
    color: #166534;
    background: #f0fdf4;
  }
</style>
