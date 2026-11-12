<script lang="ts">
  import { onMount, tick } from "svelte";
  import { LoaderCircle, Send, X } from "@lucide/svelte";
  import { executeRecordCommands } from "./record-actions";
  import {
    compileRecordCommandQueue,
    type QueueCommandProgress,
  } from "./execution-queue";
  import { commandReviewUrl } from "./command-url";
  import { parseRecordCommands } from "./record-commands";

  type Message = {
    id: number;
    role: "assistant" | "user";
    text: string;
    href?: string;
  };

  type DragState = {
    pointerId: number;
    startY: number;
    startBottom: number;
    moved: boolean;
  };

  const assistantPositionStorageKey = "demanda.assistant.vertical-position";
  const dragThreshold = 6;
  const viewportMargin = 16;

  let panelOpen = $state(false);
  let executionProgress = $state<QueueCommandProgress[]>([]);
  let panelPlacement = $state<"above" | "below">("above");
  let panelMaxHeight = $state<number>();
  let bottomOffset = $state<number>();
  let dragState = $state<DragState>();
  let suppressPanelOpen = false;
  let assistantRoot = $state<HTMLDivElement>();
  let triggerButton = $state<HTMLButtonElement>();
  let text = $state("");
  let submitting = $state(false);
  let inputElement = $state<HTMLTextAreaElement>();
  let messageId = 1;
  let messages = $state<Message[]>([
    {
      id: 0,
      role: "assistant",
      text: "Posso registrar contatos, negócios, projetos e tarefas. Diga o que você quer criar.",
    },
  ]);

  async function openPanel(): Promise<void> {
    if (suppressPanelOpen) return;
    panelOpen = true;
    updatePanelPlacement();
    await tick();
    inputElement?.focus();
  }

  function clampBottom(value: number): number {
    const buttonHeight = assistantRoot?.getBoundingClientRect().height ?? 60;
    const maxBottom = Math.max(
      viewportMargin,
      window.innerHeight - buttonHeight - viewportMargin,
    );
    return Math.min(Math.max(value, viewportMargin), maxBottom);
  }

  function getCurrentBottom(): number {
    if (bottomOffset !== undefined) return bottomOffset;
    const bounds = assistantRoot?.getBoundingClientRect();
    return bounds ? window.innerHeight - bounds.bottom : viewportMargin;
  }

  function updatePanelPlacement(): void {
    const bounds = assistantRoot?.getBoundingClientRect();
    if (!bounds) return;

    const availableAbove = bounds.top - viewportMargin;
    const availableBelow = window.innerHeight - bounds.bottom - viewportMargin;
    panelPlacement = availableAbove >= availableBelow ? "above" : "below";
    panelMaxHeight = Math.max(
      220,
      Math.floor(
        (panelPlacement === "above" ? availableAbove : availableBelow) - 18,
      ),
    );
  }

  function saveBottomOffset(): void {
    if (bottomOffset === undefined) return;
    try {
      localStorage.setItem(assistantPositionStorageKey, String(bottomOffset));
    } catch {
      // The control continues to work when browser storage is unavailable.
    }
  }

  function startDrag(event: PointerEvent): void {
    if (event.pointerType === "mouse" && event.button !== 0) return;

    triggerButton?.setPointerCapture(event.pointerId);
    dragState = {
      pointerId: event.pointerId,
      startY: event.clientY,
      startBottom: getCurrentBottom(),
      moved: false,
    };
  }

  function moveDrag(event: PointerEvent): void {
    if (!dragState || event.pointerId !== dragState.pointerId) return;

    const distance = event.clientY - dragState.startY;
    if (!dragState.moved && Math.abs(distance) < dragThreshold) return;

    dragState.moved = true;
    bottomOffset = clampBottom(dragState.startBottom - distance);
    if (panelOpen) updatePanelPlacement();
    event.preventDefault();
  }

  function endDrag(event: PointerEvent): void {
    if (!dragState || event.pointerId !== dragState.pointerId) return;

    const moved = dragState.moved;
    if (triggerButton?.hasPointerCapture(event.pointerId)) {
      triggerButton.releasePointerCapture(event.pointerId);
    }
    dragState = undefined;

    if (!moved) return;

    saveBottomOffset();
    suppressPanelOpen = true;
    window.setTimeout(() => {
      suppressPanelOpen = false;
    }, 0);
    event.preventDefault();
  }

  onMount(() => {
    try {
      const storedPosition = localStorage.getItem(assistantPositionStorageKey);
      if (storedPosition !== null) {
        const parsedPosition = Number(storedPosition);
        if (Number.isFinite(parsedPosition)) {
          bottomOffset = clampBottom(parsedPosition);
        }
      }
    } catch {
      // Storage is optional for this UI preference.
    }

    const handleResize = (): void => {
      if (bottomOffset !== undefined) bottomOffset = clampBottom(bottomOffset);
      if (panelOpen) updatePanelPlacement();
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  });

  function append(role: Message["role"], content: string, href?: string): void {
    messages = [...messages, { id: messageId++, role, text: content, href }];
  }

  function commandLabel(entry: QueueCommandProgress): string {
    const labels = {
      contact: "Contato",
      business: "Negócio",
      project: "Projeto",
      task: "Tarefa",
      service_template: "Modelo de serviço",
      delivery_template: "Modelo de entrega",
    } as const;
    return `${labels[entry.command.kind]}: ${entry.command.name}`;
  }

  function commandStatus(entry: QueueCommandProgress): string {
    const labels = {
      pending: "Aguardando",
      running: "Executando",
      succeeded: "Concluído",
      failed: "Falhou",
      needs_resolution: "Precisa de decisão",
      blocked: "Bloqueado",
    } as const;
    return labels[entry.status];
  }

  async function submit(): Promise<void> {
    const request = text.trim();
    if (!request || submitting) return;
    text = "";
    append("user", request);
    executionProgress = [];
    submitting = true;

    try {
      const parsed = parseRecordCommands(request);
      if (!parsed.ok) {
        append("assistant", parsed.message);
        return;
      }
      if (parsed.queueCommands) {
        compileRecordCommandQueue(parsed.queueCommands);
        append(
          "assistant",
          "O lote foi validado. Revise tudo e confirme a execução nesta página:",
          commandReviewUrl(request),
        );
        return;
      }
      const result = await executeRecordCommands(parsed.commands);
      append("assistant", result.message);
    } catch (cause) {
      append(
        "assistant",
        cause instanceof Error
          ? cause.message
          : "Não foi possível concluir esse registro. Tente novamente.",
      );
    } finally {
      submitting = false;
      await tick();
      inputElement?.focus();
    }
  }

  function handleKeydown(event: KeyboardEvent): void {
    if (event.key === "Escape") panelOpen = false;
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void submit();
    }
  }
</script>

<div
  bind:this={assistantRoot}
  class="assistant-root"
  style:--assistant-bottom={bottomOffset === undefined
    ? undefined
    : `${bottomOffset}px`}
  style:--assistant-panel-max-height={panelMaxHeight === undefined
    ? undefined
    : `${panelMaxHeight}px`}
>
  {#if panelOpen}
    <section
      class:below={panelPlacement === "below"}
      class="assistant-panel"
      aria-label="Assistente de registros"
    >
      <header>
        <div class="assistant-title">
          <span class="assistant-mark" aria-hidden="true">
            <img src="/images/chat.svg" alt="" />
          </span>
          <div>
            <strong>Assistente</strong>
            <span>Registros</span>
          </div>
        </div>
        <button
          class="icon-button"
          type="button"
          onclick={() => (panelOpen = false)}
          aria-label="Fechar assistente"
        >
          <X size={18} strokeWidth={2} />
        </button>
      </header>

      <div class="messages" aria-live="polite">
        {#each messages as message (message.id)}
          <div class:user-message={message.role === "user"} class="message">
            {message.text}
            {#if message.href}
              <a class="review-link" href={message.href}>Revisar e confirmar</a>
            {/if}
          </div>
        {/each}
        {#if executionProgress.length}
          <div
            class="execution-progress"
            aria-label="Progresso da fila de comandos"
          >
            {#each executionProgress as entry (entry.id)}
              <div class={`execution-item ${entry.status}`}>
                <div>
                  <strong>{commandLabel(entry)}</strong>
                  {#if entry.message}<span>{entry.message}</span>{/if}
                  {#if entry.resolutionOptions?.length}
                    <span>
                      Opções encontradas: {entry.resolutionOptions
                        .map(({ label }) => label)
                        .join(", ")}
                    </span>
                  {/if}
                </div>
                <small>{commandStatus(entry)}</small>
              </div>
            {/each}
          </div>
        {/if}
        {#if submitting}
          <div class="message thinking">
            <LoaderCircle size={16} /> Registrando…
          </div>
        {/if}
      </div>

      <form
        onsubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <div class="composer">
          <textarea
            bind:this={inputElement}
            bind:value={text}
            onkeydown={handleKeydown}
            placeholder="Descreva o que deseja criar…"
            aria-label="Mensagem para o assistente"
            rows="2"
            disabled={submitting}></textarea>
          <button
            class="send"
            type="submit"
            aria-label="Enviar"
            disabled={!text.trim() || submitting}
          >
            <Send size={18} strokeWidth={2.3} />
          </button>
        </div>
      </form>
    </section>
  {/if}

  <button
    bind:this={triggerButton}
    class:dragging={dragState?.moved}
    class="assistant-trigger"
    type="button"
    onclick={openPanel}
    onpointerdown={startDrag}
    onpointermove={moveDrag}
    onpointerup={endDrag}
    onpointercancel={endDrag}
    aria-label="Abrir assistente de IA"
    aria-expanded={panelOpen}
    title="Arraste verticalmente para reposicionar o assistente"
  >
    <img src="/images/chat.svg" alt="" />
  </button>
</div>

<style>
  .assistant-root {
    position: fixed;
    right: 24px;
    bottom: var(--assistant-bottom, 24px);
    z-index: 90;
  }
  .assistant-trigger {
    display: inline-grid;
    width: 60px;
    aspect-ratio: 1;
    place-items: center;
    padding: 0;
    border: 1px solid color-mix(in srgb, var(--primary) 82%, #000);
    border-radius: 50%;
    color: #fff;
    background: var(--primary);
    box-shadow: 0 12px 20px color-mix(in srgb, var(--primary) 30%, transparent);
    cursor: grab;
    touch-action: none;
    user-select: none;
    transition:
      transform var(--motion-fast, 160ms) ease,
      box-shadow var(--motion-fast, 160ms) ease;
  }
  .assistant-trigger:hover {
    transform: translateY(-3px) scale(1.04);
    box-shadow: 0 16px 24px color-mix(in srgb, var(--primary) 38%, transparent);
  }
  .assistant-trigger.dragging {
    cursor: grabbing;
    transition: none;
  }
  .assistant-trigger:focus-visible,
  button:focus-visible,
  textarea:focus-visible {
    outline: 3px solid color-mix(in srgb, var(--primary) 48%, transparent);
    outline-offset: 3px;
  }
  .assistant-trigger img {
    width: 34px;
    height: 34px;
  }
  .assistant-panel {
    position: absolute;
    right: 0;
    bottom: 78px;
    display: flex;
    width: min(400px, calc(100vw - 32px));
    max-height: min(
      650px,
      var(--assistant-panel-max-height, calc(100dvh - 112px))
    );
    flex-direction: column;
    overflow: hidden;
    border: 1px solid var(--border-color, #e1e5ef);
    border-radius: 22px;
    background: var(--surface-color, #fff);
    box-shadow: 0 24px 60px rgb(23 31 66 / 22%);
  }
  .assistant-panel.below {
    top: 78px;
    bottom: auto;
  }
  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 15px 16px 12px;
    border-bottom: 1px solid var(--border-color, #e9edf4);
  }
  .assistant-title {
    display: flex;
    align-items: center;
    gap: 9px;
  }
  .assistant-mark {
    display: inline-grid;
    width: 34px;
    height: 34px;
    flex: none;
    place-items: center;
    border-radius: 50%;
    color: #fff;
    background: var(--primary);
  }
  .assistant-mark img {
    width: 22px;
    height: 22px;
  }
  .assistant-title strong,
  .assistant-title span {
    display: block;
  }
  .assistant-title strong {
    color: var(--text-primary, #1f2435);
    font-size: 0.92rem;
  }
  .assistant-title span {
    color: var(--text-secondary, #73798d);
    font-size: 0.75rem;
    margin-top: 1px;
  }
  .icon-button {
    display: inline-grid;
    width: 34px;
    height: 34px;
    place-items: center;
    border: 0;
    border-radius: 10px;
    color: var(--text-secondary, #6c7488);
    background: transparent;
    cursor: pointer;
  }
  .icon-button:hover {
    background: #f1f3f9;
    color: #282e42;
  }
  .messages {
    display: flex;
    min-height: 150px;
    flex: 1;
    flex-direction: column;
    gap: 8px;
    overflow-y: auto;
    padding: 12px 14px;
  }
  .message {
    align-self: flex-start;
    max-width: 88%;
    border-radius: 13px 13px 13px 4px;
    padding: 9px 11px;
    color: var(--text-primary, #2c3244);
    background: #f1f3f8;
    font-size: 0.82rem;
    line-height: 1.4;
    white-space: pre-wrap;
  }
  .message.user-message {
    align-self: flex-end;
    border-radius: 13px 13px 4px 13px;
    color: #fff;
    background: linear-gradient(135deg, #5e58da, #357bdb);
  }
  .review-link {
    display: inline-flex;
    margin-top: 8px;
    border-radius: 8px;
    padding: 7px 9px;
    color: #fff;
    background: #5d57d9;
    font-weight: 800;
    text-decoration: none;
  }
  .review-link:hover {
    background: #4d47c5;
  }
  .message.thinking {
    display: flex;
    align-items: center;
    gap: 6px;
    color: #62697b;
  }
  .execution-progress {
    display: grid;
    gap: 6px;
    border: 1px solid #dce1ef;
    border-radius: 13px;
    padding: 9px;
    background: #fafbff;
  }
  .execution-item {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 8px;
    border-radius: 8px;
    padding: 7px 8px;
    color: #535b70;
    background: #f0f2f7;
    font-size: 0.72rem;
    line-height: 1.3;
  }
  .execution-item > div {
    min-width: 0;
  }
  .execution-item strong,
  .execution-item span {
    display: block;
  }
  .execution-item span {
    margin-top: 2px;
    color: #72798b;
  }
  .execution-item small {
    flex: none;
    font-size: 0.65rem;
    font-weight: 800;
  }
  .execution-item.running {
    color: #5750c3;
    background: #edecff;
  }
  .execution-item.succeeded {
    color: #237451;
    background: #e9f8ef;
  }
  .execution-item.failed {
    color: #aa3647;
    background: #fff0f2;
  }
  .execution-item.needs_resolution {
    color: #806436;
    background: #fff7df;
  }
  .execution-item.blocked {
    color: #806436;
    background: #fff7df;
  }
  .thinking :global(svg) {
    animation: spin 800ms linear infinite;
  }
  form {
    padding: 10px 12px 12px;
    border-top: 1px solid var(--border-color, #e9edf4);
  }
  .composer {
    display: flex;
    align-items: center;
    gap: 8px;
    min-height: 48px;
    border: 1px solid #d9deea;
    border-radius: 14px;
    padding: 4px 5px 4px 12px;
    background: #fff;
    transition:
      border-color var(--motion-fast, 160ms) ease,
      box-shadow var(--motion-fast, 160ms) ease;
  }
  .composer:focus-within {
    border-color: color-mix(in srgb, var(--primary) 68%, #fff);
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--primary) 17%, transparent);
  }
  textarea {
    min-height: 40px;
    max-height: 84px;
    flex: 1;
    resize: vertical;
    border: 0;
    outline: 0;
    padding: 7px 0;
    color: var(--text-primary, #252b3c);
    background: #fff;
    font: inherit;
    font-size: 0.82rem;
    line-height: 1.35;
  }
  textarea:focus-visible {
    outline: 0;
  }
  textarea::placeholder {
    color: #9aa1b2;
  }
  .send {
    display: inline-grid;
    width: 38px;
    height: 38px;
    flex: none;
    place-items: center;
    border: 0;
    border-radius: 11px;
    color: #fff;
    background: #5d57d9;
    cursor: pointer;
  }
  .send:not(:disabled):hover {
    background: #4d47c5;
  }
  .send:disabled {
    cursor: default;
    opacity: 0.43;
  }
  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }
  @media (max-width: 920px) {
    .assistant-root {
      right: 16px;
      bottom: var(--assistant-bottom, calc(82px + env(safe-area-inset-bottom)));
    }
    .assistant-panel {
      bottom: 70px;
    }
    .assistant-trigger {
      width: 56px;
    }
  }
</style>
