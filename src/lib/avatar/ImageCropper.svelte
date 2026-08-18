<script lang="ts">
  import { Check, Minus, Plus, X } from "@lucide/svelte";

  let { source, oncancel, onconfirm } = $props<{
    source: string;
    oncancel: () => void;
    onconfirm: (photo: Blob) => void;
  }>();

  const stageSize = 320;
  let imageElement: HTMLImageElement;
  let naturalWidth = $state(1);
  let naturalHeight = $state(1);
  let zoom = $state(1);
  let panX = $state(0);
  let panY = $state(0);
  let dragging = $state(false);
  let dragStartX = 0;
  let dragStartY = 0;
  let startPanX = 0;
  let startPanY = 0;
  let previousSource = "";

  let baseScale = $derived(
    Math.max(stageSize / naturalWidth, stageSize / naturalHeight),
  );
  let renderedWidth = $derived(naturalWidth * baseScale * zoom);
  let renderedHeight = $derived(naturalHeight * baseScale * zoom);

  $effect(() => {
    if (source === previousSource) return;
    previousSource = source;
    zoom = 1;
    panX = 0;
    panY = 0;
  });

  function clampPan(): void {
    const maxX = Math.max(0, (renderedWidth - stageSize) / 2);
    const maxY = Math.max(0, (renderedHeight - stageSize) / 2);
    panX = Math.max(-maxX, Math.min(maxX, panX));
    panY = Math.max(-maxY, Math.min(maxY, panY));
  }

  function imageLoaded(event: Event): void {
    const image = event.currentTarget as HTMLImageElement;
    naturalWidth = image.naturalWidth || 1;
    naturalHeight = image.naturalHeight || 1;
    panX = 0;
    panY = 0;
  }

  function zoomChanged(): void {
    clampPan();
  }

  function startDrag(event: PointerEvent): void {
    const target = event.currentTarget as HTMLElement;
    target.setPointerCapture(event.pointerId);
    const ratio = stageSize / target.getBoundingClientRect().width;
    dragging = true;
    dragStartX = event.clientX * ratio;
    dragStartY = event.clientY * ratio;
    startPanX = panX;
    startPanY = panY;
  }

  function moveDrag(event: PointerEvent): void {
    if (!dragging) return;
    const target = event.currentTarget as HTMLElement;
    const ratio = stageSize / target.getBoundingClientRect().width;
    panX = startPanX + event.clientX * ratio - dragStartX;
    panY = startPanY + event.clientY * ratio - dragStartY;
    clampPan();
  }

  function endDrag(): void {
    dragging = false;
  }

  function crop(): void {
    if (!imageElement) return;
    const outputSize = 512;
    const factor = outputSize / stageSize;
    const canvas = document.createElement("canvas");
    canvas.width = outputSize;
    canvas.height = outputSize;
    const context = canvas.getContext("2d");
    if (!context) return;

    context.drawImage(
      imageElement,
      ((stageSize - renderedWidth) / 2 + panX) * factor,
      ((stageSize - renderedHeight) / 2 + panY) * factor,
      renderedWidth * factor,
      renderedHeight * factor,
    );
    canvas.toBlob(
      (blob) => {
        if (blob) onconfirm(blob);
      },
      "image/jpeg",
      0.9,
    );
  }
</script>

<div
  class="cropper"
  role="dialog"
  aria-modal="true"
  aria-labelledby="crop-title"
>
  <div class="cropper__backdrop"></div>
  <section class="cropper__panel">
    <header>
      <div>
        <span>Foto do perfil</span>
        <h3 id="crop-title">Ajuste o recorte</h3>
      </div>
      <button type="button" aria-label="Fechar recorte" onclick={oncancel}
        ><X size={20} /></button
      >
    </header>

    <div
      class:dragging
      class="crop-stage"
      role="application"
      aria-label="Área de recorte quadrado. Arraste a imagem para reposicionar."
      onpointerdown={startDrag}
      onpointermove={moveDrag}
      onpointerup={endDrag}
      onpointercancel={endDrag}
    >
      <img
        bind:this={imageElement}
        src={source}
        alt="Prévia da foto para recorte"
        draggable="false"
        onload={imageLoaded}
        style={`width:${renderedWidth}px;height:${renderedHeight}px;transform:translate(calc(-50% + ${panX}px), calc(-50% + ${panY}px));`}
      />
      <span class="crop-grid" aria-hidden="true"></span>
    </div>

    <div class="zoom-control">
      <Minus size={16} aria-hidden="true" />
      <input
        type="range"
        min="1"
        max="3"
        step="0.01"
        aria-label="Zoom da imagem"
        bind:value={zoom}
        oninput={zoomChanged}
      />
      <Plus size={16} aria-hidden="true" />
    </div>

    <footer>
      <button class="secondary" type="button" onclick={oncancel}
        >Cancelar</button
      >
      <button class="primary" type="button" onclick={crop}
        ><Check size={17} />Usar recorte</button
      >
    </footer>
  </section>
</div>

<style>
  .cropper {
    position: fixed;
    z-index: 1001;
    inset: 0;
    display: grid;
    place-items: center;
    padding: 18px;
  }
  .cropper__backdrop {
    position: absolute;
    inset: 0;
    background: rgba(15, 23, 42, 0.72);
    backdrop-filter: blur(4px);
  }
  .cropper__panel {
    position: relative;
    width: min(440px, 100%);
    overflow: hidden;
    border-radius: 20px;
    background: var(--panel);
    box-shadow: 0 24px 70px rgba(15, 23, 42, 0.28);
  }
  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    padding: 18px 20px;
  }
  header div {
    display: grid;
    gap: 3px;
  }
  header span {
    color: var(--brand-600);
    font-size: var(--text-xs);
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.08em;
  }
  h3 {
    color: var(--ink-950);
    font-size: var(--text-lg);
  }
  header button {
    display: grid;
    width: 38px;
    height: 38px;
    place-items: center;
    border: 1px solid var(--border);
    border-radius: 10px;
    color: var(--ink-500);
    background: var(--surface);
  }
  .crop-stage {
    position: relative;
    width: min(320px, calc(100vw - 72px));
    aspect-ratio: 1;
    margin: 8px auto 0;
    overflow: hidden;
    border-radius: 16px;
    background: #dbe1e8;
    cursor: grab;
    touch-action: none;
    user-select: none;
  }
  .crop-stage.dragging {
    cursor: grabbing;
  }
  .crop-stage img {
    position: absolute;
    top: 50%;
    left: 50%;
    max-width: none;
    pointer-events: none;
  }
  .crop-grid {
    position: absolute;
    inset: 0;
    border: 2px solid rgba(255, 255, 255, 0.88);
    border-radius: inherit;
    background:
      linear-gradient(
        90deg,
        transparent 33.1%,
        rgba(255, 255, 255, 0.42) 33.3%,
        rgba(255, 255, 255, 0.42) 33.7%,
        transparent 33.9%,
        transparent 66.1%,
        rgba(255, 255, 255, 0.42) 66.3%,
        rgba(255, 255, 255, 0.42) 66.7%,
        transparent 66.9%
      ),
      linear-gradient(
        transparent 33.1%,
        rgba(255, 255, 255, 0.42) 33.3%,
        rgba(255, 255, 255, 0.42) 33.7%,
        transparent 33.9%,
        transparent 66.1%,
        rgba(255, 255, 255, 0.42) 66.3%,
        rgba(255, 255, 255, 0.42) 66.7%,
        transparent 66.9%
      );
    pointer-events: none;
  }
  .zoom-control {
    display: grid;
    grid-template-columns: auto 1fr auto;
    align-items: center;
    gap: 10px;
    width: min(320px, calc(100% - 40px));
    margin: 18px auto;
    color: var(--ink-400);
  }
  .zoom-control input {
    width: 100%;
    accent-color: var(--brand-600);
  }
  footer {
    display: flex;
    justify-content: flex-end;
    gap: 9px;
    padding: 16px 20px;
    border-top: 1px solid var(--border);
  }
  footer button {
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
  .secondary {
    border: 1px solid var(--border);
    color: var(--ink-700);
    background: var(--surface);
  }
  .primary {
    border: 1px solid var(--brand-600);
    color: white;
    background: var(--brand-600);
  }
</style>
