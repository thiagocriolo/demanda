<script lang="ts">
  import { onMount } from "svelte";
  import {
    AlignLeft,
    BriefcaseBusiness,
    FileText,
    FolderKanban,
    GripVertical,
    Image as ImageIcon,
    LoaderCircle,
    Plus,
    Save,
    Sparkles,
    Trash2,
    X,
  } from "@lucide/svelte";
  import { page } from "$app/state";
  import {
    deleteStoredFile,
    uploadStoredFileWithProgress,
  } from "$lib/files/client";
  import {
    loadPortfolio,
    loadPortfolios,
    publishPost,
  } from "$lib/social/client";
  import PortfolioCard from "$lib/social/PortfolioCard.svelte";
  import PortfolioViewer from "$lib/social/PortfolioViewer.svelte";
  import type {
    CreateSocialPostInput,
    SocialPost,
    SocialPostInteraction,
  } from "$lib/social/types";

  type DraftBlock =
    | { id: string; kind: "text"; text: string }
    | { id: string; kind: "image"; file: File; preview: string };

  let posts = $state<SocialPost[]>([]);
  let nextCursor = $state<string | null>(null);
  let loading = $state(true);
  let loadingMore = $state(false);
  let publishing = $state(false);
  let error = $state("");
  let editorOpen = $state(false);
  let selected = $state<SocialPost | null>(null);
  let title = $state("");
  let summary = $state("");
  let blocks = $state<DraftBlock[]>([]);
  let uploadProgress = $state(0);
  let publishStage = $state("");
  let blockProgress = $state<Record<string, number>>({});
  let draggedId = $state<string | null>(null);
  let dragOverId = $state<string | null>(null);
  let sentinel = $state<HTMLDivElement>();

  onMount(() => void initialLoad());

  $effect(() => {
    if (!sentinel || !nextCursor) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) void loadMore();
      },
      { rootMargin: "350px" },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  });

  async function initialLoad() {
    try {
      const result = await loadPortfolios();
      posts = result.items;
      nextCursor = result.nextCursor;
      const requestedId = page.url.searchParams.get("projeto");
      if (requestedId)
        selected =
          posts.find((post) => post.id === requestedId) ??
          (await loadPortfolio(requestedId));
    } catch (cause) {
      error =
        cause instanceof Error
          ? cause.message
          : "Não foi possível carregar os portfólios.";
    } finally {
      loading = false;
    }
  }

  async function loadMore() {
    if (!nextCursor || loadingMore) return;
    loadingMore = true;
    try {
      const result = await loadPortfolios(nextCursor);
      posts = [...posts, ...result.items];
      nextCursor = result.nextCursor;
    } catch (cause) {
      error =
        cause instanceof Error
          ? cause.message
          : "Não foi possível carregar mais projetos.";
    } finally {
      loadingMore = false;
    }
  }

  function updatePostInteraction(interaction: SocialPostInteraction) {
    if (!selected) return;
    const updated = {
      ...selected,
      ...interaction,
    };
    posts = posts.map((post) => (post.id === updated.id ? updated : post));
    selected = updated;
  }

  function addText() {
    blocks = [...blocks, { id: crypto.randomUUID(), kind: "text", text: "" }];
  }

  function addImages(event: Event) {
    const files = Array.from(
      (event.currentTarget as HTMLInputElement).files ?? [],
    );
    blocks = [
      ...blocks,
      ...files.map((file) => ({
        id: crypto.randomUUID(),
        kind: "image" as const,
        file,
        preview: URL.createObjectURL(file),
      })),
    ];
    (event.currentTarget as HTMLInputElement).value = "";
  }

  function removeBlock(index: number) {
    const block = blocks[index];
    if (block?.kind === "image") URL.revokeObjectURL(block.preview);
    blocks = blocks.filter((_, blockIndex) => blockIndex !== index);
  }

  function moveBlock(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= blocks.length) return;
    const copy = [...blocks];
    [copy[index], copy[target]] = [copy[target]!, copy[index]!];
    blocks = copy;
  }

  function dropBlock(targetId: string) {
    if (!draggedId || draggedId === targetId) {
      draggedId = null;
      dragOverId = null;
      return;
    }
    const sourceIndex = blocks.findIndex((block) => block.id === draggedId);
    const targetIndex = blocks.findIndex((block) => block.id === targetId);
    if (sourceIndex < 0 || targetIndex < 0) return;
    const reordered = [...blocks];
    const [moved] = reordered.splice(sourceIndex, 1);
    if (moved) reordered.splice(targetIndex, 0, moved);
    blocks = reordered;
    draggedId = null;
    dragOverId = null;
  }

  function handleDragKey(event: KeyboardEvent, index: number) {
    if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
    event.preventDefault();
    moveBlock(index, event.key === "ArrowUp" ? -1 : 1);
  }

  function resetDraft() {
    for (const block of blocks)
      if (block.kind === "image") URL.revokeObjectURL(block.preview);
    blocks = [];
    title = "";
    summary = "";
    uploadProgress = 0;
    publishStage = "";
    blockProgress = {};
  }

  function closeEditor() {
    if (publishing) return;
    resetDraft();
    editorOpen = false;
  }

  function updateOverallProgress(
    imageBlocks: Extract<DraftBlock, { kind: "image" }>[],
  ) {
    const totalBytes = imageBlocks.reduce(
      (total, block) => total + block.file.size,
      0,
    );
    if (totalBytes <= 0) return;
    const completedBytes = imageBlocks.reduce(
      (total, block) =>
        total + block.file.size * ((blockProgress[block.id] ?? 0) / 100),
      0,
    );
    uploadProgress = Math.min(
      90,
      Math.round((completedBytes / totalBytes) * 90),
    );
  }

  async function publish() {
    if (
      !title.trim() ||
      !blocks.some((block) => block.kind === "image") ||
      publishing
    )
      return;
    publishing = true;
    error = "";
    uploadProgress = 0;
    publishStage = "Preparando imagens…";
    blockProgress = {};
    const uploadedFileIds: string[] = [];
    try {
      const payloadBlocks: CreateSocialPostInput["blocks"] = [];
      const imageBlocks = blocks.filter(
        (block): block is Extract<DraftBlock, { kind: "image" }> =>
          block.kind === "image",
      );
      publishStage = `Enviando ${imageBlocks.length === 1 ? "imagem" : "imagens"}…`;
      const uploads = await Promise.all(
        imageBlocks.map(async (block) => {
          const uploaded = await uploadStoredFileWithProgress(
            block.file,
            "attachment",
            (progress) => {
              blockProgress = { ...blockProgress, [block.id]: progress };
              updateOverallProgress(imageBlocks);
            },
          );
          uploadedFileIds.push(uploaded.file.id);
          return [block.id, uploaded.file.id] as const;
        }),
      );
      const uploadedByBlock = new Map(uploads);
      for (const block of blocks) {
        if (block.kind === "text") {
          if (block.text.trim())
            payloadBlocks.push({ kind: "text", text: block.text.trim() });
        } else {
          const fileId = uploadedByBlock.get(block.id);
          if (fileId) payloadBlocks.push({ kind: "image", fileId });
        }
      }
      uploadProgress = 94;
      publishStage = "Montando portfólio…";
      const post = await publishPost({
        kind: "portfolio",
        title: title.trim(),
        body: summary.trim() || undefined,
        blocks: payloadBlocks,
      });
      uploadProgress = 100;
      publishStage = "Portfólio publicado";
      posts = [post, ...posts];
      editorOpen = false;
      resetDraft();
      selected = post;
    } catch (cause) {
      await Promise.all(
        uploadedFileIds.map((fileId) =>
          deleteStoredFile(fileId).catch(() => undefined),
        ),
      );
      error =
        cause instanceof Error
          ? cause.message
          : "Não foi possível publicar o portfólio.";
      publishStage = "";
      uploadProgress = 0;
    } finally {
      publishing = false;
    }
  }
</script>

<svelte:head><title>Portfólio · Social · Demanda</title></svelte:head>

<section class="portfolio-page">
  <header class="portfolio-header">
    <div>
      <span><Sparkles size={15} />Seus trabalhos</span>
      <h1>Portfólio</h1>
      <p>
        Seus projetos visuais, processos e resultados reunidos em um só lugar.
      </p>
    </div>
    <button type="button" onclick={() => (editorOpen = true)}
      ><Plus size={17} />Criar portfólio</button
    >
  </header>
  {#if error}<p class="alert" role="alert">{error}</p>{/if}
  {#if loading}
    <div class="state">
      <LoaderCircle class="spin" size={22} />Carregando projetos…
    </div>
  {:else if posts.length === 0}
    <div class="state empty">
      <BriefcaseBusiness size={29} />
      <h2>Mostre o trabalho por trás do resultado</h2>
      <p>
        Crie seu primeiro portfólio com imagens e textos, como uma história
        visual.
      </p>
      <button type="button" onclick={() => (editorOpen = true)}
        >Criar portfólio</button
      >
    </div>
  {:else}
    <div class="portfolio-grid">
      {#each posts as post (post.id)}
        <PortfolioCard {post} onselect={(item) => (selected = item)} />
      {/each}
    </div>
    <div class="sentinel" bind:this={sentinel}>
      {#if loadingMore}<LoaderCircle class="spin" size={18} />Carregando mais…{/if}
    </div>
  {/if}
</section>

{#if editorOpen}
  <div
    class="editor-backdrop"
    role="presentation"
    onclick={(event) => {
      if (event.target === event.currentTarget) closeEditor();
    }}
  >
    <div
      class="editor"
      role="dialog"
      aria-modal="true"
      aria-labelledby="editor-title"
    >
      <div class="editor-layout">
        <section class="preview-pane" aria-label="Preview do portfólio">
          <header class="preview-header">
            <h2 id="editor-title">Novo portfólio</h2>
            <button
              type="button"
              aria-label="Fechar"
              disabled={publishing}
              onclick={closeEditor}><X size={18} /></button
            >
          </header>

          <div class="project-preview">
            <div class="preview-intro">
              <h3>{title.trim() || "Título do projeto"}</h3>
              <p>
                {summary.trim() || "A descrição do projeto aparecerá aqui."}
              </p>
            </div>

            {#if blocks.length === 0}
              <div class="preview-empty" aria-hidden="true"></div>
            {:else}
              <div class="preview-blocks">
                {#each blocks as block, index (block.id)}
                  <article
                    class:image-section={block.kind === "image"}
                    class:drag-over={dragOverId === block.id &&
                      draggedId !== block.id}
                    class:dragging={draggedId === block.id}
                    ondragover={(event) => {
                      event.preventDefault();
                      dragOverId = block.id;
                    }}
                    ondrop={(event) => {
                      event.preventDefault();
                      dropBlock(block.id);
                    }}
                  >
                    <span
                      class="drag-handle"
                      role="button"
                      tabindex="0"
                      draggable={!publishing}
                      aria-label={`Mover seção ${index + 1}`}
                      title="Arraste para reordenar"
                      ondragstart={(event) => {
                        draggedId = block.id;
                        event.dataTransfer?.setData("text/plain", block.id);
                        if (event.dataTransfer)
                          event.dataTransfer.effectAllowed = "move";
                      }}
                      ondragend={() => {
                        draggedId = null;
                        dragOverId = null;
                      }}
                      onkeydown={(event) => handleDragKey(event, index)}
                      ><GripVertical size={17} /></span
                    >
                    <div class="preview-content">
                      {#if block.kind === "image"}
                        <img
                          src={block.preview}
                          alt={`Imagem ${index + 1} do portfólio`}
                        />
                      {:else}
                        <textarea
                          bind:value={block.text}
                          maxlength="5000"
                          rows="5"
                          aria-label={`Texto da seção ${index + 1}`}
                          placeholder="Escreva sobre o processo, uma decisão ou o resultado…"
                        ></textarea>
                      {/if}
                    </div>
                    <button
                      class="remove"
                      type="button"
                      disabled={publishing}
                      aria-label={`Remover seção ${index + 1}`}
                      onclick={() => removeBlock(index)}
                      ><Trash2 size={15} /></button
                    >
                  </article>
                {/each}
              </div>
            {/if}
          </div>
        </section>

        <section class="edit-pane" aria-label="Edição do portfólio">
          <div class="pane-head">
            <div>
              <strong>Edição</strong><span
                >Informações e conteúdo do projeto</span
              >
            </div>
            <small
              >{blocks.length} {blocks.length === 1 ? "seção" : "seções"}</small
            >
          </div>

          {#if publishing}
            <div
              class="publishing-progress"
              role="progressbar"
              aria-label="Progresso da publicação"
              aria-valuemin="0"
              aria-valuemax="100"
              aria-valuenow={uploadProgress}
            >
              <div>
                <span>{publishStage}</span><strong>{uploadProgress}%</strong>
              </div>
              <span class="progress-track"
                ><span style={`width:${uploadProgress}%`}></span></span
              >
            </div>
          {/if}

          {#if error}<p class="editor-error" role="alert">{error}</p>{/if}

          <div class="control">
            <span aria-hidden="true"><FolderKanban size={16} /></span>
            <input
              bind:value={title}
              maxlength="160"
              aria-label="Título do projeto"
              placeholder="Título do projeto"
            />
          </div>

          <div class="control textarea-control">
            <span aria-hidden="true"><AlignLeft size={16} /></span>
            <textarea
              bind:value={summary}
              maxlength="5000"
              rows="5"
              aria-label="Descrição do projeto"
              placeholder="Descrição do projeto"></textarea>
          </div>

          <div class="add-actions">
            <button type="button" disabled={publishing} onclick={addText}
              ><FileText size={16} />Adicionar texto</button
            >
            <label class:disabled={publishing}>
              <ImageIcon size={16} />Adicionar imagem
              <input
                type="file"
                multiple
                disabled={publishing}
                accept="image/jpeg,image/png,image/webp"
                onchange={addImages}
              />
            </label>
          </div>

          <div class="edit-note">
            <GripVertical size={16} />
            <p>
              Arraste as seções pelo puxador do preview para mudar a ordem. A
              primeira imagem será a capa.
            </p>
          </div>

          <div class="editor-actions">
            <button
              class="cancel"
              type="button"
              disabled={publishing}
              onclick={closeEditor}><X size={16} />Cancelar</button
            >
            <button
              class="publish"
              type="button"
              disabled={publishing ||
                !title.trim() ||
                !blocks.some((block) => block.kind === "image")}
              onclick={publish}
            >
              {#if publishing}<LoaderCircle
                  class="spin"
                  size={16}
                />{:else}<Save size={16} />{/if}
              {publishing ? "Publicando…" : "Publicar"}
            </button>
          </div>
        </section>
      </div>
    </div>
  </div>
{/if}

{#if selected}<PortfolioViewer
    post={selected}
    onclose={() => (selected = null)}
    oninteraction={updatePostInteraction}
  />{/if}

<style>
  .portfolio-page {
    display: grid;
    width: min(100%, var(--social-content-width));
    gap: 18px;
    margin-inline: auto;
    padding-bottom: 30px;
  }
  .portfolio-header {
    display: flex;
    height: var(--social-header-height);
    align-items: flex-end;
    justify-content: space-between;
    gap: 20px;
    padding: 24px 26px;
    border-radius: 18px;
    color: white;
    background: linear-gradient(125deg, #17244f, #2e56ff 66%, #6f8cff);
  }
  .portfolio-header span {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    color: rgba(255, 255, 255, 0.76);
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.08em;
  }
  .portfolio-header h1 {
    margin-top: 7px;
    font-size: 28px;
  }
  .portfolio-header p {
    max-width: 620px;
    margin-top: 5px;
    color: rgba(255, 255, 255, 0.76);
    font-size: 12px;
    line-height: 1.45;
  }
  .portfolio-header > button,
  .empty button {
    display: inline-flex;
    min-height: 39px;
    flex: 0 0 auto;
    align-items: center;
    gap: 7px;
    padding: 0 14px;
    border: 0;
    border-radius: 10px;
    color: var(--brand-700);
    background: white;
    font-size: 11px;
    font-weight: 600;
  }
  .portfolio-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
    gap: 16px;
  }
  .state,
  .sentinel {
    display: grid;
    min-height: 220px;
    place-content: center;
    justify-items: center;
    gap: 8px;
    color: var(--ink-400);
    font-size: 11px;
  }
  .empty {
    min-height: 340px;
    border: 1px dashed var(--border-strong);
    border-radius: 16px;
    background: rgba(255, 255, 255, 0.55);
    text-align: center;
  }
  .empty h2 {
    color: var(--ink-800);
    font-size: 17px;
  }
  .empty p {
    max-width: 420px;
    font-size: 11px;
  }
  .empty button {
    margin-top: 8px;
    color: white;
    background: var(--brand-600);
  }
  .sentinel {
    display: flex;
    min-height: 70px;
  }
  .alert {
    padding: 10px 13px;
    border: 1px solid rgba(220, 38, 38, 0.22);
    border-radius: 10px;
    color: #991b1b;
    background: rgba(220, 38, 38, 0.07);
    font-size: 11px;
  }
  .editor-backdrop {
    position: fixed;
    z-index: 3200;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 20px;
    background: rgba(15, 23, 42, 0.52);
  }
  .editor {
    width: min(1160px, 100%);
    height: min(90dvh, 940px);
    overflow: hidden;
    border: 1px solid var(--border);
    border-radius: 20px;
    background: var(--canvas);
    box-shadow: 0 22px 48px rgba(15, 23, 42, 0.18);
  }
  .preview-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    padding: 22px 24px 18px;
    border-bottom: 1px solid var(--border);
    background: var(--canvas);
  }
  .editor h2 {
    color: var(--ink-950);
    font-size: var(--text-xl);
    font-weight: 600;
  }
  .preview-header button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    border: 0;
    color: var(--muted);
    background: transparent;
  }
  .preview-header button:hover {
    color: var(--text);
  }
  .editor-layout {
    display: grid;
    grid-template-columns: minmax(0, 1.45fr) minmax(340px, 0.85fr);
    height: 100%;
    min-height: 0;
    overflow: hidden;
    background: var(--panel);
  }
  .preview-pane,
  .edit-pane {
    min-width: 0;
    min-height: 0;
    background: var(--panel);
  }
  .preview-pane {
    display: grid;
    grid-template-rows: auto minmax(0, 1fr);
    overflow: hidden;
    border-right: 1px solid var(--border);
  }
  .edit-pane {
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 18px;
    overflow-y: auto;
  }
  .pane-head {
    display: flex;
    min-height: 54px;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 12px 14px;
    border-bottom: 1px solid var(--border);
  }
  .edit-pane > .pane-head {
    min-height: 44px;
    padding: 0 0 10px;
  }
  .pane-head > div {
    display: grid;
    gap: 2px;
  }
  .pane-head strong {
    color: var(--ink-950);
    font-size: var(--text-md);
    font-weight: 600;
  }
  .pane-head span {
    color: var(--muted);
    font-size: var(--text-xs);
  }
  .pane-head small {
    padding: 5px 8px;
    border-radius: var(--radius-pill);
    color: var(--brand-700);
    background: var(--brand-50);
    font-size: var(--text-xs);
    font-weight: 600;
  }
  .project-preview {
    min-height: 0;
    overflow-y: auto;
    background: #fff;
    overscroll-behavior: contain;
  }
  .preview-intro {
    display: grid;
    justify-items: center;
    padding: 42px 26px 36px;
    background: linear-gradient(145deg, #f3f6ff, #fff 62%);
    text-align: center;
  }
  .preview-intro h3 {
    max-width: 560px;
    color: var(--ink-950);
    font-size: clamp(25px, 3.4vw, 42px);
    line-height: 1.08;
    overflow-wrap: anywhere;
  }
  .preview-intro p {
    max-width: 520px;
    margin-top: 12px;
    color: var(--ink-500);
    font-size: var(--text-sm);
    line-height: 1.55;
    white-space: pre-wrap;
  }
  .preview-empty {
    min-height: 250px;
    background: #fff;
  }
  .preview-blocks {
    display: grid;
    gap: 0;
    padding: 0;
  }
  .preview-blocks article {
    display: grid;
    grid-template-columns: 34px minmax(0, 1fr) 34px;
    align-items: stretch;
    gap: 0;
    padding: 0;
    border: 0;
    border-bottom: 1px solid var(--border);
    background: white;
    transition:
      box-shadow var(--motion-fast),
      opacity var(--motion-fast),
      transform var(--motion-fast);
  }
  .preview-blocks article.drag-over {
    z-index: 1;
    box-shadow: inset 0 3px 0 var(--primary);
  }
  .preview-blocks article.dragging {
    opacity: 0.46;
  }
  .drag-handle {
    display: grid;
    min-height: 64px;
    place-items: center;
    color: var(--ink-400);
    background: #fff;
    cursor: grab;
    touch-action: none;
  }
  .drag-handle:hover {
    color: var(--brand-600);
    background: var(--brand-50);
  }
  .drag-handle:active {
    cursor: grabbing;
  }
  .preview-content {
    position: relative;
    min-width: 0;
    overflow: hidden;
  }
  .preview-content img {
    display: block;
    width: 100%;
    height: auto;
    object-fit: contain;
  }
  .preview-content textarea {
    display: block;
    width: 100%;
    min-height: 150px;
    padding: 28px 24px;
    resize: vertical;
    border: 0;
    outline: 0;
    color: var(--ink-700);
    background: #fff;
    font: inherit;
    font-size: var(--text-lg);
    line-height: 1.65;
  }
  .preview-content textarea::placeholder {
    color: var(--muted);
  }
  .remove {
    display: grid;
    width: 30px;
    height: 30px;
    align-self: center;
    place-items: center;
    border: 0;
    border-radius: 0;
    color: var(--red-500);
    background: transparent;
  }
  .remove:hover {
    background: rgba(220, 38, 38, 0.07);
  }
  .control {
    display: grid;
    grid-template-columns: 18px minmax(0, 1fr);
    min-height: 56px;
    align-items: center;
    gap: 10px;
    padding: 0 14px;
    border: 1px solid var(--border);
    border-radius: var(--radius-xl);
    background: var(--panel);
  }
  .control:focus-within {
    border-color: var(--primary);
  }
  .control > span {
    display: inline-flex;
    color: var(--muted);
  }
  .control input,
  .control textarea {
    width: 100%;
    min-width: 0;
    padding: 0;
    border: 0;
    outline: 0;
    color: var(--text);
    background: transparent;
    font: inherit;
    font-size: var(--text-md);
    line-height: 1.45;
  }
  .control input::placeholder,
  .control textarea::placeholder {
    color: var(--muted);
    opacity: 1;
  }
  .textarea-control {
    min-height: 132px;
    align-items: start;
    padding-block: 13px;
  }
  .textarea-control > span {
    margin-top: 3px;
  }
  .control textarea {
    min-height: 102px;
    resize: vertical;
  }
  .add-actions {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 9px;
  }
  .add-actions button,
  .add-actions label {
    display: inline-flex;
    min-height: 56px;
    align-items: center;
    justify-content: center;
    gap: 7px;
    padding: 0 12px;
    border: 1px solid var(--border);
    border-radius: var(--radius-xl);
    color: var(--ink-800);
    background: var(--panel);
    font-size: var(--text-sm);
    font-weight: 600;
    text-align: center;
    cursor: pointer;
  }
  .add-actions button:hover,
  .add-actions label:hover {
    background: var(--surface-hover);
  }
  .add-actions label.disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }
  .add-actions input {
    position: absolute;
    width: 1px;
    height: 1px;
    opacity: 0;
  }
  .edit-note {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    padding: 11px 12px;
    border-radius: var(--radius-lg);
    color: var(--muted);
    background: var(--surface-soft);
  }
  .edit-note p {
    font-size: var(--text-xs);
    line-height: 1.45;
  }
  .editor-error {
    padding: 10px 12px;
    border: 1px solid color-mix(in srgb, var(--danger) 30%, var(--border));
    border-radius: var(--radius-md);
    color: var(--danger);
    background: color-mix(in srgb, var(--danger) 6%, white);
    font-size: var(--text-sm);
  }
  .editor-actions {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
    margin-top: auto;
    padding-top: 4px;
  }
  .editor-actions button {
    display: inline-flex;
    min-height: 40px;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 10px 12px;
    border-radius: var(--radius-md);
    color: white;
    font: inherit;
    font-size: var(--text-md);
    font-weight: 600;
    line-height: 1.2;
  }
  .editor-actions .cancel {
    border: 1px solid var(--primary);
    background: var(--primary);
    box-shadow: 0 8px 18px rgba(46, 86, 255, 0.22);
  }
  .editor-actions .publish {
    border: 1px solid #16a34a;
    background: #16a34a;
    box-shadow: 0 8px 18px rgba(22, 163, 74, 0.22);
  }
  .editor-actions .cancel:hover {
    background: var(--brand-700);
  }
  .editor-actions .publish:hover {
    background: #15803d;
  }
  .editor-actions button:disabled,
  .editor-actions button:disabled:hover {
    border-color: var(--border);
    color: var(--muted);
    background: var(--surface-soft);
    box-shadow: none;
    cursor: not-allowed;
  }
  .publishing-progress {
    display: grid;
    gap: 8px;
    padding: 2px 0 12px;
    border-bottom: 1px solid var(--border);
    background: transparent;
  }
  .publishing-progress > div {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }
  .publishing-progress span,
  .publishing-progress strong {
    color: var(--ink-600);
    font-size: var(--text-xs);
  }
  .publishing-progress strong {
    color: var(--brand-700);
  }
  .progress-track {
    display: block;
    height: 7px;
    overflow: hidden;
    border-radius: var(--radius-pill);
    background: var(--surface-hover);
  }
  .progress-track > span {
    display: block;
    height: 100%;
    border-radius: inherit;
    background: linear-gradient(90deg, var(--brand-600), #6f8cff);
    transition: width 120ms linear;
  }
  :global(.spin) {
    animation: spin 0.8s linear infinite;
  }
  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }
  @media (max-width: 900px) {
    .editor-layout {
      grid-template-columns: 1fr;
      overflow-y: auto;
    }
    .preview-pane {
      min-height: 500px;
      border-right: 0;
      border-bottom: 1px solid var(--border);
    }
    .edit-pane {
      overflow: visible;
    }
  }
  @media (max-width: 620px) {
    .portfolio-header {
      align-items: start;
      flex-direction: column;
    }
    .portfolio-grid {
      grid-template-columns: 1fr;
    }
    .editor-backdrop {
      padding: 0;
    }
    .editor {
      height: 100dvh;
      border-radius: 0;
    }
    .preview-header {
      padding: 17px 16px 14px;
    }
    .preview-pane {
      min-height: 440px;
    }
    .add-actions {
      grid-template-columns: 1fr;
    }
    .preview-blocks article {
      grid-template-columns: 30px minmax(0, 1fr) 30px;
    }
    .remove {
      width: 28px;
    }
  }
</style>
