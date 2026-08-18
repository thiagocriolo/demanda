<script lang="ts">
  import { Camera, Check, Dices, Image, Upload, X } from "@lucide/svelte";
  import Avatar from "./Avatar.svelte";
  import ImageCropper from "./ImageCropper.svelte";
  import {
    AVATAR_COLORS,
    AVATAR_OPTIONS,
    randomAvatar,
  } from "./avatar-options";

  let { open, avatarImage, avatarColor, photo, oncancel, onconfirm } = $props<{
    open: boolean;
    avatarImage: string;
    avatarColor: string;
    photo: string;
    oncancel: () => void;
    onconfirm: (value: {
      avatarImage: string;
      avatarColor: string;
      photo: string;
      photoFile?: File;
    }) => void;
  }>();

  let mode = $state<"avatar" | "photo">("avatar");
  let draftImage = $state("");
  let draftColor = $state("");
  let draftPhoto = $state("");
  let draftPhotoFile = $state<File | undefined>();
  let cropSource = $state("");
  let cropSourceUrl = "";
  let draftPhotoUrl = "";
  let uploadError = $state("");
  let wasOpen = false;

  $effect(() => {
    if (open && !wasOpen) {
      draftImage = avatarImage;
      draftColor = avatarColor;
      draftPhoto = photo;
      draftPhotoFile = undefined;
      mode = photo ? "photo" : "avatar";
      cropSource = "";
      uploadError = "";
    }
    wasOpen = open;
  });

  function selectAvatar(id: string): void {
    draftImage = id;
    draftPhoto = "";
    draftPhotoFile = undefined;
    mode = "avatar";
  }

  function surpriseMe(): void {
    const generated = randomAvatar();
    draftImage = generated.avatarImage;
    draftColor = generated.avatarColor;
    draftPhoto = "";
    draftPhotoFile = undefined;
    mode = "avatar";
  }

  function chooseFile(event: Event): void {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    uploadError = "";
    input.value = "";
    if (!file) return;
    if (!new Set(["image/jpeg", "image/png"]).has(file.type)) {
      uploadError = "Escolha uma imagem JPEG/JPG ou PNG.";
      return;
    }
    if (file.size > 15 * 1024 * 1024) {
      uploadError = "A imagem deve ter no máximo 15 MB.";
      return;
    }

    if (cropSourceUrl) URL.revokeObjectURL(cropSourceUrl);
    cropSourceUrl = URL.createObjectURL(file);
    cropSource = cropSourceUrl;
  }

  function useCrop(croppedPhoto: Blob): void {
    if (draftPhotoUrl) URL.revokeObjectURL(draftPhotoUrl);
    draftPhotoFile = new File([croppedPhoto], "foto-perfil.jpg", {
      type: "image/jpeg",
    });
    draftPhotoUrl = URL.createObjectURL(draftPhotoFile);
    draftPhoto = draftPhotoUrl;
    if (cropSourceUrl) URL.revokeObjectURL(cropSourceUrl);
    cropSourceUrl = "";
    cropSource = "";
    mode = "photo";
  }

  function confirm(): void {
    onconfirm({
      avatarImage: draftImage,
      avatarColor: draftColor,
      photo: mode === "photo" ? draftPhoto : "",
      photoFile: mode === "photo" ? draftPhotoFile : undefined,
    });
  }
</script>

{#if open}
  <div
    class="picker"
    role="dialog"
    aria-modal="true"
    aria-labelledby="avatar-picker-title"
  >
    <button
      class="picker__backdrop"
      type="button"
      aria-label="Fechar"
      onclick={oncancel}
    ></button>
    <section class="picker__panel">
      <header class="picker__header">
        <div>
          <span>Personalização</span>
          <h2 id="avatar-picker-title">Escolha seu avatar</h2>
          <p>Combine uma ilustração e uma cor, ou envie sua própria foto.</p>
        </div>
        <button
          class="icon-button"
          type="button"
          aria-label="Fechar"
          onclick={oncancel}><X size={20} /></button
        >
      </header>

      <div class="picker__body">
        <aside class="preview-area">
          <div class="preview-frame">
            <Avatar
              photo={mode === "photo" ? draftPhoto : ""}
              image={draftImage}
              color={draftColor}
              alt="Prévia do avatar"
            />
          </div>
          <strong>Sua prévia</strong>
          <small>Você poderá mudar novamente quando quiser.</small>
          <button class="surprise-button" type="button" onclick={surpriseMe}>
            <Dices size={17} />Sortear combinação
          </button>
        </aside>

        <div class="choice-area">
          <div class="mode-tabs" role="tablist" aria-label="Tipo de avatar">
            <button
              class:active={mode === "avatar"}
              type="button"
              role="tab"
              aria-selected={mode === "avatar"}
              onclick={() => (mode = "avatar")}
              ><Image size={17} />Avatares</button
            >
            <button
              class:active={mode === "photo"}
              type="button"
              role="tab"
              aria-selected={mode === "photo"}
              onclick={() => (mode = "photo")}
              ><Camera size={17} />Minha foto</button
            >
          </div>

          {#if mode === "avatar"}
            <div class="option-section">
              <div class="section-title">
                <strong>Ilustração</strong><span>16 opções</span>
              </div>
              <div class="avatar-grid">
                {#each AVATAR_OPTIONS as option}
                  <button
                    class:selected={draftImage === option.id && !draftPhoto}
                    type="button"
                    aria-label={option.label}
                    aria-pressed={draftImage === option.id && !draftPhoto}
                    onclick={() => selectAvatar(option.id)}
                  >
                    <Avatar image={option.id} color={draftColor} alt="" />
                    {#if draftImage === option.id && !draftPhoto}<span
                        class="selected-mark"><Check size={12} /></span
                      >{/if}
                  </button>
                {/each}
              </div>
            </div>

            <div class="option-section color-section">
              <div class="section-title">
                <strong>Cor de fundo</strong><span>16 opções</span>
              </div>
              <div class="color-grid">
                {#each AVATAR_COLORS as color, index}
                  <button
                    class:selected={draftColor === color}
                    type="button"
                    style={`--swatch: ${color}`}
                    aria-label={`Cor ${index + 1}`}
                    aria-pressed={draftColor === color}
                    onclick={() => (draftColor = color)}
                    >{#if draftColor === color}<Check size={14} />{/if}</button
                  >
                {/each}
              </div>
            </div>
          {:else}
            <div class="upload-area">
              {#if draftPhoto}
                <div class="uploaded-preview">
                  <div><Avatar photo={draftPhoto} alt="Foto recortada" /></div>
                  <span
                    ><strong>Foto pronta</strong><small
                      >O recorte quadrado será usado no seu perfil.</small
                    ></span
                  >
                </div>
              {/if}
              <label class="upload-box">
                <span class="upload-icon"><Upload size={22} /></span>
                <strong
                  >{draftPhoto
                    ? "Escolher outra foto"
                    : "Enviar uma foto"}</strong
                >
                <small>JPEG/JPG ou PNG de até 15 MB</small>
                <span class="file-button">Selecionar arquivo</span>
                <input
                  class="sr-only"
                  type="file"
                  accept="image/jpeg,image/png"
                  onchange={chooseFile}
                />
              </label>
              <p class="crop-hint">
                Depois de selecionar, você poderá posicionar e ampliar a imagem
                antes de confirmar.
              </p>
              {#if uploadError}<p class="upload-error" role="alert">
                  {uploadError}
                </p>{/if}
            </div>
          {/if}
        </div>
      </div>

      <footer class="picker__footer">
        <button class="cancel-button" type="button" onclick={oncancel}
          >Cancelar</button
        >
        <button
          class="confirm-button"
          type="button"
          disabled={mode === "photo" && !draftPhoto}
          onclick={confirm}
        >
          <Check size={17} />Usar este avatar
        </button>
      </footer>
    </section>
  </div>
{/if}

{#if cropSource}
  <ImageCropper
    source={cropSource}
    oncancel={() => (cropSource = "")}
    onconfirm={useCrop}
  />
{/if}

<style>
  .picker {
    position: fixed;
    z-index: 1000;
    inset: 0;
    display: grid;
    place-items: center;
    padding: 20px;
  }
  .picker__backdrop {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    border: 0;
    background: rgba(15, 23, 42, 0.58);
    backdrop-filter: blur(4px);
  }
  .picker__panel {
    position: relative;
    display: grid;
    width: min(900px, 100%);
    max-height: min(820px, calc(100dvh - 40px));
    overflow: hidden;
    border: 1px solid rgba(255, 255, 255, 0.5);
    border-radius: 22px;
    background: var(--panel);
    box-shadow: 0 28px 80px rgba(15, 23, 42, 0.28);
  }
  .picker__header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 24px;
    padding: 22px 24px 18px;
    border-bottom: 1px solid var(--border);
  }
  .picker__header > div {
    display: grid;
    gap: 4px;
  }
  .picker__header span {
    color: var(--brand-600);
    font-size: var(--text-xs);
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.08em;
  }
  .picker__header h2 {
    color: var(--ink-950);
    font-size: var(--text-xl);
  }
  .picker__header p {
    color: var(--ink-500);
    font-size: var(--text-sm);
  }
  .icon-button {
    display: grid;
    width: 40px;
    height: 40px;
    flex: 0 0 auto;
    place-items: center;
    border: 1px solid var(--border);
    border-radius: 11px;
    color: var(--ink-500);
    background: var(--surface);
  }
  .picker__body {
    display: grid;
    grid-template-columns: 230px minmax(0, 1fr);
    min-height: 0;
    overflow: auto;
  }
  .preview-area {
    display: flex;
    min-height: 100%;
    align-items: center;
    flex-direction: column;
    padding: 34px 24px;
    border-right: 1px solid var(--border);
    background: var(--surface-soft);
    text-align: center;
  }
  .preview-frame {
    width: 156px;
    height: 156px;
    overflow: hidden;
    border: 6px solid var(--panel);
    border-radius: 50%;
    box-shadow:
      0 0 0 1px var(--border),
      0 14px 28px rgba(15, 23, 42, 0.12);
  }
  .preview-area > strong {
    margin-top: 20px;
    color: var(--ink-800);
    font-size: var(--text-md);
  }
  .preview-area > small {
    max-width: 180px;
    margin-top: 5px;
    color: var(--ink-400);
    font-size: var(--text-xs);
    line-height: 1.45;
  }
  .surprise-button {
    display: inline-flex;
    min-height: 38px;
    align-items: center;
    gap: 7px;
    margin-top: 18px;
    padding: 0 12px;
    border: 1px solid var(--border);
    border-radius: 10px;
    color: var(--ink-700);
    background: var(--panel);
    font-size: var(--text-sm);
    font-weight: 600;
  }
  .choice-area {
    min-width: 0;
    padding: 22px 24px 26px;
  }
  .mode-tabs {
    display: inline-flex;
    gap: 4px;
    padding: 4px;
    border-radius: 11px;
    background: var(--surface-soft);
  }
  .mode-tabs button {
    display: inline-flex;
    min-height: 38px;
    align-items: center;
    gap: 7px;
    padding: 0 13px;
    border: 0;
    border-radius: 8px;
    color: var(--ink-500);
    background: transparent;
    font-size: var(--text-sm);
    font-weight: 600;
  }
  .mode-tabs button.active {
    color: var(--brand-600);
    background: var(--panel);
    box-shadow: 0 1px 5px rgba(15, 23, 42, 0.1);
  }
  .option-section {
    margin-top: 20px;
  }
  .section-title {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 10px;
  }
  .section-title strong {
    color: var(--ink-700);
    font-size: var(--text-sm);
  }
  .section-title span {
    color: var(--ink-400);
    font-size: var(--text-xs);
  }
  .avatar-grid {
    display: grid;
    grid-template-columns: repeat(8, minmax(44px, 1fr));
    gap: 8px;
  }
  .avatar-grid button {
    position: relative;
    aspect-ratio: 1;
    overflow: hidden;
    padding: 2px;
    border: 2px solid transparent;
    border-radius: 50%;
    background: transparent;
  }
  .avatar-grid button :global(.avatar) {
    border-radius: 50%;
  }
  .avatar-grid button.selected {
    border-color: var(--brand-600);
  }
  .selected-mark {
    position: absolute;
    right: -1px;
    bottom: -1px;
    display: grid;
    width: 19px;
    height: 19px;
    place-items: center;
    border: 2px solid var(--panel);
    border-radius: 50%;
    color: white;
    background: var(--brand-600);
  }
  .color-section {
    padding-top: 17px;
    border-top: 1px solid var(--border);
  }
  .color-grid {
    display: grid;
    grid-template-columns: repeat(16, minmax(22px, 1fr));
    gap: 8px;
  }
  .color-grid button {
    display: grid;
    aspect-ratio: 1;
    min-width: 22px;
    place-items: center;
    padding: 0;
    border: 3px solid var(--panel);
    border-radius: 50%;
    color: white;
    background: var(--swatch);
    box-shadow: 0 0 0 1px var(--border);
  }
  .color-grid button.selected {
    box-shadow: 0 0 0 2px var(--brand-600);
  }
  .upload-area {
    display: grid;
    gap: 14px;
    margin-top: 24px;
  }
  .uploaded-preview {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px;
    border: 1px solid rgba(93, 172, 131, 0.35);
    border-radius: 12px;
    background: rgba(93, 172, 131, 0.08);
  }
  .uploaded-preview > div {
    width: 52px;
    height: 52px;
    flex: 0 0 auto;
    overflow: hidden;
    border-radius: 50%;
  }
  .uploaded-preview > span {
    display: grid;
    gap: 3px;
  }
  .uploaded-preview strong {
    color: var(--ink-800);
    font-size: var(--text-sm);
  }
  .uploaded-preview small {
    color: var(--ink-500);
    font-size: var(--text-xs);
  }
  .upload-box {
    display: grid;
    min-height: 230px;
    place-items: center;
    align-content: center;
    gap: 6px;
    padding: 28px;
    border: 1.5px dashed var(--border-strong);
    border-radius: 16px;
    background: var(--surface-soft);
    text-align: center;
    cursor: pointer;
  }
  .upload-box:hover {
    border-color: var(--brand-600);
    background: var(--brand-50);
  }
  .upload-icon {
    display: grid;
    width: 46px;
    height: 46px;
    place-items: center;
    margin-bottom: 4px;
    border-radius: 13px;
    color: var(--brand-600);
    background: var(--brand-100);
  }
  .upload-box strong {
    color: var(--ink-800);
    font-size: var(--text-md);
  }
  .upload-box small,
  .crop-hint {
    color: var(--ink-400);
    font-size: var(--text-xs);
  }
  .file-button {
    margin-top: 9px;
    padding: 9px 13px;
    border-radius: 9px;
    color: white;
    background: var(--brand-600);
    font-size: var(--text-sm);
    font-weight: 600;
    text-transform: none;
    letter-spacing: 0;
  }
  .crop-hint {
    text-align: center;
    line-height: 1.45;
  }
  .upload-error {
    color: var(--danger);
    font-size: var(--text-sm);
    text-align: center;
  }
  .picker__footer {
    display: flex;
    justify-content: flex-end;
    gap: 9px;
    padding: 16px 24px;
    border-top: 1px solid var(--border);
  }
  .picker__footer button {
    display: inline-flex;
    min-height: 42px;
    align-items: center;
    justify-content: center;
    gap: 7px;
    padding: 0 16px;
    border-radius: 10px;
    font-size: var(--text-sm);
    font-weight: 600;
  }
  .cancel-button {
    border: 1px solid var(--border);
    color: var(--ink-700);
    background: var(--surface);
  }
  .confirm-button {
    border: 1px solid var(--brand-600);
    color: white;
    background: var(--brand-600);
  }
  .confirm-button:disabled {
    cursor: not-allowed;
    opacity: 0.45;
  }
  @media (max-width: 720px) {
    .picker {
      padding: 10px;
    }
    .picker__panel {
      max-height: calc(100dvh - 20px);
    }
    .picker__body {
      grid-template-columns: 1fr;
    }
    .preview-area {
      min-height: auto;
      padding: 18px;
      border-right: 0;
      border-bottom: 1px solid var(--border);
    }
    .preview-frame {
      width: 112px;
      height: 112px;
    }
    .preview-area > strong {
      margin-top: 12px;
    }
    .surprise-button {
      margin-top: 12px;
    }
    .avatar-grid {
      grid-template-columns: repeat(8, minmax(34px, 1fr));
      gap: 5px;
    }
    .color-grid {
      grid-template-columns: repeat(8, 1fr);
    }
  }
  @media (max-width: 440px) {
    .picker__header,
    .choice-area,
    .picker__footer {
      padding-inline: 16px;
    }
    .picker__header p {
      display: none;
    }
    .avatar-grid {
      grid-template-columns: repeat(4, 1fr);
      gap: 8px;
    }
  }
</style>
