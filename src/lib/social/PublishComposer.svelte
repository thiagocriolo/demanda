<script lang="ts">
  import { onDestroy } from "svelte";
  import { LoaderCircle, Paperclip, Send, X } from "@lucide/svelte";
  import { deleteStoredFile, uploadStoredFile } from "$lib/files/client";
  import type { CreateSocialPostInput, SocialPost } from "./types";

  const MAX_MEDIA = 10;
  const MAX_IMAGE_BYTES = 15 * 1024 * 1024;
  const MAX_VIDEO_BYTES = 100 * 1024 * 1024;
  const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
  const VIDEO_TYPES = new Set(["video/mp4", "video/webm"]);

  type SelectedMedia = {
    id: string;
    file: File;
    kind: "image" | "video";
    previewUrl: string;
  };

  let {
    placeholder = "Compartilhe algo com a comunidade…",
    publish,
    onpublished,
  } = $props<{
    placeholder?: string;
    publish: (input: CreateSocialPostInput) => Promise<SocialPost>;
    onpublished?: (post: SocialPost) => void;
  }>();

  let text = $state("");
  let media = $state<SelectedMedia[]>([]);
  let publishing = $state(false);
  let error = $state("");

  let hasContent = $derived(Boolean(text.trim() || media.length));

  onDestroy(clearMedia);

  function idFor(file: File): string {
    return `${file.name}-${file.size}-${file.lastModified}-${crypto.randomUUID()}`;
  }

  function clearMedia(): void {
    for (const item of media) URL.revokeObjectURL(item.previewUrl);
    media = [];
  }

  function removeMedia(id: string): void {
    const selected = media.find((item) => item.id === id);
    if (selected) URL.revokeObjectURL(selected.previewUrl);
    media = media.filter((item) => item.id !== id);
  }

  function selectMedia(event: Event): void {
    const input = event.currentTarget as HTMLInputElement;
    const files = [...(input.files ?? [])];
    input.value = "";
    error = "";
    if (!files.length) return;

    const availableSlots = Math.max(0, MAX_MEDIA - media.length);
    const accepted: SelectedMedia[] = [];
    let rejected = 0;

    for (const file of files) {
      const kind = IMAGE_TYPES.has(file.type)
        ? "image"
        : VIDEO_TYPES.has(file.type)
          ? "video"
          : null;
      const withinSize =
        kind === "image"
          ? file.size <= MAX_IMAGE_BYTES
          : kind === "video"
            ? file.size <= MAX_VIDEO_BYTES
            : false;
      if (!kind || !withinSize || accepted.length >= availableSlots) {
        rejected += 1;
        continue;
      }
      accepted.push({
        id: idFor(file),
        file,
        kind,
        previewUrl: URL.createObjectURL(file),
      });
    }
    media = [...media, ...accepted];
    if (rejected > 0) {
      error = `${rejected} ${rejected === 1 ? "arquivo não foi adicionado" : "arquivos não foram adicionados"} por formato, tamanho ou limite de quantidade.`;
    }
  }

  async function submit(): Promise<void> {
    if (publishing || !hasContent) return;
    publishing = true;
    error = "";
    const uploadedIds: string[] = [];
    try {
      const uploaded: CreateSocialPostInput["blocks"] = [];
      for (const item of media) {
        const result = await uploadStoredFile(item.file, "attachment");
        uploadedIds.push(result.file.id);
        uploaded.push({ kind: item.kind, fileId: result.file.id });
      }
      const post = await publish({
        kind: "feed",
        body: text.trim() || undefined,
        blocks: uploaded,
      });
      text = "";
      clearMedia();
      onpublished?.(post);
    } catch (cause) {
      await Promise.all(
        uploadedIds.map((fileId) =>
          deleteStoredFile(fileId).catch(() => undefined),
        ),
      );
      error =
        cause instanceof Error ? cause.message : "Não foi possível publicar.";
    } finally {
      publishing = false;
    }
  }
</script>

<section class="publish-composer" aria-label="Nova publicação">
  <textarea
    bind:value={text}
    maxlength="5000"
    rows="4"
    {placeholder}
    aria-label="Texto da publicação"></textarea>

  {#if media.length}
    <div class:multiple={media.length > 1} class="media-preview">
      {#each media as item, index (item.id)}
        <div class="preview-item">
          {#if item.kind === "image"}
            <img src={item.previewUrl} alt={`Prévia da imagem ${index + 1}`} />
          {:else}
            <video src={item.previewUrl} controls preload="metadata">
              <track kind="captions" />
            </video>
          {/if}
          <button
            type="button"
            aria-label={`Remover ${item.kind === "image" ? "imagem" : "vídeo"}`}
            onclick={() => removeMedia(item.id)}><X size={15} /></button
          >
        </div>
      {/each}
    </div>
  {/if}

  {#if error}<p class="error" role="alert">{error}</p>{/if}

  <footer>
    <div class="media-picker">
      <label>
        <Paperclip size={16} />Adicionar mídia
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp,video/mp4,video/webm"
          multiple
          aria-label="Adicionar imagens ou vídeos à publicação"
          aria-describedby="media-rules"
          onchange={selectMedia}
        />
      </label>
      <span id="media-rules" role="tooltip">
        Até 10 arquivos · JPG, PNG ou WebP até 15 MB · MP4 ou WebM até 100 MB
      </span>
    </div>
    <button
      class="publish"
      type="button"
      disabled={publishing || !hasContent}
      onclick={submit}
    >
      {#if publishing}<LoaderCircle class="spin" size={16} />{:else}<Send
          size={16}
        />{/if}
      {publishing ? "Publicando…" : "Publicar"}
    </button>
  </footer>
</section>

<style>
  .publish-composer {
    overflow: visible;
    border: 1px solid var(--border);
    border-radius: 16px;
    background: var(--panel);
  }
  textarea {
    width: 100%;
    min-height: 108px;
    padding: 16px 17px;
    border: 0;
    outline: 0;
    color: var(--ink-800, var(--text));
    background: transparent;
    resize: vertical;
    font: inherit;
    font-size: 13px;
    line-height: 1.5;
  }
  textarea::placeholder {
    color: var(--ink-400, var(--muted));
  }
  .media-preview {
    padding: 0 14px 12px;
  }
  .media-preview.multiple {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(112px, 1fr));
    gap: 8px;
  }
  .preview-item {
    position: relative;
    overflow: hidden;
    border-radius: 12px;
    background: var(--surface-soft);
  }
  .preview-item img,
  .preview-item video {
    display: block;
    width: 100%;
    max-height: 360px;
    object-fit: cover;
  }
  .multiple .preview-item img,
  .multiple .preview-item video {
    height: 112px;
  }
  .preview-item > button {
    position: absolute;
    top: 7px;
    right: 7px;
    display: grid;
    width: 29px;
    height: 29px;
    place-items: center;
    border: 0;
    border-radius: 50%;
    color: white;
    background: rgba(15, 23, 42, 0.74);
  }
  .error {
    padding: 0 14px 10px;
    color: #b42318;
    font-size: 10px;
    line-height: 1.4;
  }
  footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    padding: 9px 11px;
    border-top: 1px solid var(--border);
  }
  .media-picker {
    position: relative;
    display: inline-flex;
    align-items: center;
  }
  .media-picker > span {
    position: absolute;
    z-index: 5;
    left: calc(100% + 12px);
    width: max-content;
    max-width: min(430px, 64vw);
    color: var(--ink-500);
    font-size: 10px;
    font-weight: 500;
    line-height: 1.35;
    opacity: 0;
    pointer-events: none;
    transform: translateX(-8px);
    transition:
      opacity 0.1s ease-out,
      transform 0.1s ease-out;
  }
  .media-picker:hover > span,
  .media-picker:focus-within > span {
    opacity: 1;
    transform: translateX(0);
  }
  label,
  footer button {
    display: inline-flex;
    min-height: 35px;
    align-items: center;
    gap: 6px;
    padding: 0 9px;
    border: 0;
    border-radius: 9px;
    color: var(--ink-500);
    background: transparent;
    font-size: 11px;
    font-weight: 600;
    cursor: pointer;
  }
  label:hover,
  footer button:hover {
    color: var(--brand-700);
    background: var(--brand-50);
  }
  label:focus-within {
    box-shadow: var(--focus-ring);
  }
  label input {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
  }
  footer .publish {
    min-height: 36px;
    margin-left: auto;
    padding-inline: 13px;
    border: 1px solid transparent;
    color: white;
    background: var(--brand-600);
    font-weight: 700;
    transition:
      background 0.15s ease,
      transform 0.15s ease;
  }
  footer .publish:hover:not(:disabled) {
    color: white;
    background: var(--brand-700);
    transform: translateY(-1px);
  }
  footer .publish:disabled {
    border-color: var(--brand-600);
    color: white;
    background: var(--brand-600);
    box-shadow: none;
    opacity: 1;
  }
  button:disabled {
    cursor: not-allowed;
    opacity: 0.55;
  }
  :global(.spin) {
    animation: spin 0.8s linear infinite;
  }
  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }
  @media (max-width: 600px) {
    footer {
      align-items: flex-end;
    }
  }
</style>
