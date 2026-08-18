<script lang="ts">
  import { ImagePlus, Plus, Trash2, X } from "@lucide/svelte";
  import { uploadStoredFileWithProgress } from "$lib/files/client";
  import type {
    ComparisonAlternative,
    ComparisonUseContent,
    VisualAsset,
  } from "../types";

  let { content, onchange } = $props<{
    content: ComparisonUseContent;
    onchange: (content: ComparisonUseContent) => void;
  }>();
  let uploading = $state<Record<string, number>>({});
  let uploadError = $state("");

  function updateAlternative(
    index: number,
    values: Partial<ComparisonUseContent["alternatives"][number]>,
  ): void {
    onchange({
      ...content,
      alternatives: content.alternatives.map(
        (alternative: ComparisonAlternative, alternativeIndex: number) =>
          alternativeIndex === index
            ? { ...alternative, ...values }
            : alternative,
      ),
    });
  }

  function addAlternative(): void {
    const label = String.fromCharCode(65 + content.alternatives.length);
    onchange({
      ...content,
      alternatives: [
        ...content.alternatives,
        {
          id: crypto.randomUUID(),
          title: `Alternativa ${label}`,
          description: "",
          assets: [],
        },
      ],
    });
  }

  async function upload(index: number, files: FileList | null): Promise<void> {
    if (!files?.length) return;
    uploadError = "";
    const alternative = content.alternatives[index];
    if (!alternative) return;
    for (const file of [...files]) {
      const uploadId = `${alternative.id}:${file.name}`;
      uploading = { ...uploading, [uploadId]: 0 };
      try {
        const { file: stored } = await uploadStoredFileWithProgress(
          file,
          "attachment",
          (progress) => (uploading = { ...uploading, [uploadId]: progress }),
        );
        const asset: VisualAsset = {
          id: crypto.randomUUID(),
          fileId: stored.id,
          url: stored.url,
          name: stored.originalName,
        };
        const latest = content.alternatives[index];
        if (latest)
          updateAlternative(index, { assets: [...latest.assets, asset] });
      } catch (cause) {
        uploadError =
          cause instanceof Error
            ? cause.message
            : "Não foi possível enviar a imagem.";
      } finally {
        const { [uploadId]: _, ...rest } = uploading;
        uploading = rest;
      }
    }
  }
</script>

<div class="tool-editor-heading">
  <div>
    <strong>Alternativas deste Uso</strong><small
      >Mínimo de duas alternativas visuais</small
    >
  </div>
  <button class="tool-secondary-button" type="button" onclick={addAlternative}
    ><Plus size={15} /> Adicionar alternativa</button
  >
</div>
{#if uploadError}<p class="tool-inline-error" role="alert">
    {uploadError}
  </p>{/if}
<div class="tool-alternative-editor-grid">
  {#each content.alternatives as alternative, index (alternative.id)}
    <article class="tool-content-card">
      <div class="tool-content-card__heading">
        <strong>Alternativa {String.fromCharCode(65 + index)}</strong><button
          class="tool-icon-button tool-icon-button--danger"
          type="button"
          aria-label="Remover alternativa"
          onclick={() =>
            onchange({
              ...content,
              alternatives: content.alternatives.filter(
                (
                  _alternative: ComparisonAlternative,
                  alternativeIndex: number,
                ) => alternativeIndex !== index,
              ),
            })}><Trash2 size={16} /></button
        >
      </div>
      <label class="tool-field"
        ><span>Título</span><input
          value={alternative.title}
          maxlength="160"
          required
          oninput={(event) =>
            updateAlternative(index, { title: event.currentTarget.value })}
        /></label
      >
      <label class="tool-field"
        ><span>Descrição</span><textarea
          rows="2"
          value={alternative.description}
          maxlength="800"
          oninput={(event) =>
            updateAlternative(index, {
              description: event.currentTarget.value,
            })}></textarea></label
      >
      <div class="tool-assets">
        {#each alternative.assets as asset (asset.id)}
          <figure class="tool-asset">
            <img src={asset.url} alt={asset.name} /><button
              type="button"
              aria-label={`Remover ${asset.name}`}
              onclick={() =>
                updateAlternative(index, {
                  assets: alternative.assets.filter(
                    ({ id }: VisualAsset) => id !== asset.id,
                  ),
                })}><X size={14} /></button
            >
            <figcaption>{asset.name}</figcaption>
          </figure>
        {/each}
        <label class="tool-upload"
          ><ImagePlus size={22} /><span>Adicionar imagem</span><input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple
            onchange={(event) => void upload(index, event.currentTarget.files)}
          /></label
        >
      </div>
      {#each Object.entries(uploading).filter( ([key]) => key.startsWith(`${alternative.id}:`) ) as [key, progress] (key)}<div
          class="tool-progress"
        >
          <span style={`width:${progress}%`}></span>
        </div>{/each}
    </article>
  {:else}
    <div class="tool-mini-empty">
      <ImagePlus size={24} /><strong>Nenhuma alternativa adicionada</strong
      ><span>Adicione as opções que serão comparadas.</span>
    </div>
  {/each}
</div>
