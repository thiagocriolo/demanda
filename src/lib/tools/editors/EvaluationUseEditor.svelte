<script lang="ts">
  import { ImagePlus, Plus, Trash2, X } from "@lucide/svelte";
  import { uploadStoredFileWithProgress } from "$lib/files/client";
  import type {
    EvaluationItem,
    EvaluationUseContent,
    VisualAsset,
  } from "../types";

  let { content, onchange } = $props<{
    content: EvaluationUseContent;
    onchange: (content: EvaluationUseContent) => void;
  }>();
  let uploading = $state<Record<string, number>>({});
  let uploadError = $state("");

  function updateItem(
    index: number,
    values: Partial<EvaluationUseContent["items"][number]>,
  ): void {
    onchange({
      ...content,
      items: content.items.map((item: EvaluationItem, itemIndex: number) =>
        itemIndex === index ? { ...item, ...values } : item,
      ),
    });
  }

  function addItem(): void {
    onchange({
      ...content,
      items: [
        ...content.items,
        {
          id: crypto.randomUUID(),
          title: `Referência ${content.items.length + 1}`,
          description: "",
          assets: [],
        },
      ],
    });
  }

  async function upload(
    itemIndex: number,
    files: FileList | null,
  ): Promise<void> {
    if (!files?.length) return;
    uploadError = "";
    const item = content.items[itemIndex];
    if (!item) return;
    for (const file of [...files]) {
      const uploadId = `${item.id}:${file.name}`;
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
        const latest = content.items[itemIndex];
        if (latest)
          updateItem(itemIndex, { assets: [...latest.assets, asset] });
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
    <strong>Referências deste Uso</strong><small
      >Cada item precisa de ao menos uma imagem</small
    >
  </div>
  <button class="tool-secondary-button" type="button" onclick={addItem}
    ><Plus size={15} /> Adicionar referência</button
  >
</div>
{#if uploadError}<p class="tool-inline-error" role="alert">
    {uploadError}
  </p>{/if}
<div class="tool-stack">
  {#each content.items as item, index (item.id)}
    <article class="tool-content-card">
      <div class="tool-content-card__heading">
        <strong>Item {index + 1}</strong>
        <button
          class="tool-icon-button tool-icon-button--danger"
          type="button"
          aria-label="Remover referência"
          onclick={() =>
            onchange({
              ...content,
              items: content.items.filter(
                (_item: EvaluationItem, itemIndex: number) =>
                  itemIndex !== index,
              ),
            })}><Trash2 size={16} /></button
        >
      </div>
      <div class="tool-grid tool-grid--2">
        <label class="tool-field"
          ><span>Título</span><input
            value={item.title}
            maxlength="160"
            required
            oninput={(event) =>
              updateItem(index, { title: event.currentTarget.value })}
          /></label
        >
        <label class="tool-field"
          ><span>Descrição</span><input
            value={item.description}
            maxlength="800"
            placeholder="Opcional"
            oninput={(event) =>
              updateItem(index, { description: event.currentTarget.value })}
          /></label
        >
      </div>
      <div class="tool-assets">
        {#each item.assets as asset (asset.id)}
          <figure class="tool-asset">
            <img src={asset.url} alt={asset.name} />
            <button
              type="button"
              aria-label={`Remover ${asset.name}`}
              onclick={() =>
                updateItem(index, {
                  assets: item.assets.filter(
                    ({ id }: VisualAsset) => id !== asset.id,
                  ),
                })}><X size={14} /></button
            >
            <figcaption>{asset.name}</figcaption>
          </figure>
        {/each}
        <label class="tool-upload">
          <ImagePlus size={22} />
          <span>Adicionar imagem</span>
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple
            onchange={(event) => void upload(index, event.currentTarget.files)}
          />
        </label>
      </div>
      {#each Object.entries(uploading).filter( ([key]) => key.startsWith(`${item.id}:`) ) as [key, progress] (key)}
        <div class="tool-progress">
          <span style={`width:${progress}%`}></span>
        </div>
      {/each}
    </article>
  {:else}
    <div class="tool-mini-empty">
      <ImagePlus size={24} /><strong>Nenhuma referência adicionada</strong><span
        >Adicione os itens visuais específicos deste projeto.</span
      >
    </div>
  {/each}
</div>
