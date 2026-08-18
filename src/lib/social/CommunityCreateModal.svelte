<script lang="ts">
  import {
    AlignLeft,
    AtSign,
    Globe2,
    Image as ImageIcon,
    LoaderCircle,
    Save,
    Tags,
    Upload,
    UsersRound,
    X,
  } from "@lucide/svelte";
  import type { GlobalSelectorItem } from "$lib/ui/GlobalSelector.svelte";
  import UserSearch from "$lib/ui/UserSearch.svelte";

  export type CommunityDraft = {
    linkName: string;
    name: string;
    description: string;
    topic: string;
    visibility: "public" | "private";
    cover: File | null;
    memberUserIds: string[];
  };

  let {
    oncancel,
    oncreate,
  }: {
    oncancel: () => void;
    oncreate: (community: CommunityDraft) => Promise<void>;
  } = $props();

  let name = $state("");
  let linkName = $state("");
  let description = $state("");
  let topic = $state("");
  let visibility = $state<CommunityDraft["visibility"]>("public");
  let cover = $state<File | null>(null);
  let coverPreview = $state("");
  let selectedPeople = $state<GlobalSelectorItem[]>([]);
  let creating = $state(false);
  let error = $state("");

  function normalizeLinkName(value: string): string {
    return value
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, "")
      .toLocaleLowerCase("pt-BR")
      .replace(/\s+/gu, "-")
      .replace(/[^a-z0-9._-]/gu, "")
      .slice(0, 40);
  }

  function selectCover(event: Event): void {
    const file = (event.currentTarget as HTMLInputElement).files?.[0] ?? null;
    if (coverPreview) URL.revokeObjectURL(coverPreview);
    cover = file;
    coverPreview = file ? URL.createObjectURL(file) : "";
  }

  function cancel(): void {
    if (creating) return;
    if (coverPreview) URL.revokeObjectURL(coverPreview);
    oncancel();
  }

  async function submit(event: SubmitEvent): Promise<void> {
    event.preventDefault();
    if (
      !name.trim() ||
      !linkName.trim() ||
      !description.trim() ||
      !topic.trim() ||
      creating
    )
      return;

    creating = true;
    error = "";
    try {
      await oncreate({
        linkName,
        name: name.trim(),
        description: description.trim(),
        topic: topic.trim(),
        visibility,
        cover,
        memberUserIds: selectedPeople.map((person) => person.id),
      });
      if (coverPreview) URL.revokeObjectURL(coverPreview);
    } catch (cause) {
      error =
        cause instanceof Error
          ? cause.message
          : "Não foi possível criar a comunidade.";
    } finally {
      creating = false;
    }
  }
</script>

<div
  class="backdrop"
  role="presentation"
  onclick={(event) => event.target === event.currentTarget && cancel()}
>
  <div
    class="dialog"
    role="dialog"
    aria-modal="true"
    aria-labelledby="community-form-title"
  >
    <header>
      <h2 id="community-form-title">Nova comunidade</h2>
      <button
        class="close"
        type="button"
        aria-label="Fechar"
        disabled={creating}
        onclick={cancel}
      >
        <X size={18} strokeWidth={2} />
      </button>
    </header>

    <div class="body">
      <form onsubmit={submit}>
        {#if error}<div class="notice" role="alert">{error}</div>{/if}

        <section class="section" aria-labelledby="community-about-title">
          <h3 id="community-about-title">Sobre</h3>

          <div class="about-grid">
            <div class="field full">
              <label class="cover-control">
                {#if coverPreview}
                  <img src={coverPreview} alt="Prévia da imagem de capa" />
                  <span class="cover-overlay"
                    ><Upload size={16} />Trocar imagem de capa</span
                  >
                {:else}
                  <span class="cover-placeholder">
                    <ImageIcon size={24} />
                    <strong>Imagem de capa</strong>
                    <small>JPEG ou PNG de até 15 MB</small>
                  </span>
                {/if}
                <input
                  class="file-input"
                  type="file"
                  accept="image/jpeg,image/png"
                  aria-label="Selecionar imagem de capa"
                  onchange={selectCover}
                />
              </label>
            </div>

            <div class="field full">
              <label class="field-label" for="community-name">
                Nome da comunidade <span>Obrigatório</span>
              </label>
              <div class="control">
                <span class="control-icon" aria-hidden="true">
                  <UsersRound size={15} strokeWidth={1.8} />
                </span>
                <input
                  id="community-name"
                  bind:value={name}
                  name="name"
                  maxlength="80"
                  required
                  aria-label="Nome da comunidade"
                  placeholder="Nome da comunidade"
                />
              </div>
            </div>

            <div class="field full">
              <label class="field-label" for="community-link-name">
                Endereço da comunidade <span>Obrigatório</span>
              </label>
              <div class="control">
                <span class="control-icon" aria-hidden="true">
                  <AtSign size={15} strokeWidth={1.8} />
                </span>
                <input
                  id="community-link-name"
                  value={linkName}
                  name="linkName"
                  minlength="3"
                  maxlength="40"
                  pattern={"[a-z0-9._-]{3,40}"}
                  required
                  aria-label="Linkname da comunidade"
                  placeholder="linkname da comunidade"
                  oninput={(event) =>
                    (linkName = normalizeLinkName(event.currentTarget.value))}
                />
              </div>
              <small class="field-hint"
                >Use letras minúsculas, números, ponto, hífen ou sublinhado.</small
              >
            </div>

            <div class="field full">
              <label class="field-label" for="community-description">
                Descrição <span>Obrigatório</span>
              </label>
              <div class="control textarea-control">
                <span class="control-icon" aria-hidden="true">
                  <AlignLeft size={15} strokeWidth={1.8} />
                </span>
                <textarea
                  id="community-description"
                  bind:value={description}
                  name="description"
                  maxlength="240"
                  required
                  aria-label="Descrição da comunidade"
                  placeholder="Conte o propósito da comunidade e quem ela reúne"
                ></textarea>
              </div>
              <small class="field-hint field-counter"
                >{description.length}/240</small
              >
            </div>

            <div class="field">
              <label class="field-label" for="community-topic">
                Tema principal <span>Obrigatório</span>
              </label>
              <div class="control">
                <span class="control-icon" aria-hidden="true">
                  <Tags size={15} strokeWidth={1.8} />
                </span>
                <input
                  id="community-topic"
                  bind:value={topic}
                  name="topic"
                  maxlength="60"
                  required
                  aria-label="Tema principal"
                  placeholder="Tema principal"
                />
              </div>
            </div>

            <div class="field">
              <label class="field-label" for="community-visibility"
                >Visibilidade</label
              >
              <div class="control">
                <span class="control-icon" aria-hidden="true">
                  <Globe2 size={15} strokeWidth={1.8} />
                </span>
                <select
                  id="community-visibility"
                  bind:value={visibility}
                  name="visibility"
                  aria-label="Visibilidade da comunidade"
                >
                  <option value="public">Comunidade pública</option>
                  <option value="private">Comunidade privada</option>
                </select>
              </div>
            </div>

            <div class="field full">
              <span class="field-label">Convidados <span>Opcional</span></span>
              <UserSearch
                bind:selected={selectedPeople}
                selection="multiple"
                display="social"
                label="Convidados"
                placeholder="Convidar pessoas para a comunidade"
                emptyMessage="Nenhuma pessoa encontrada."
                icon={UsersRound}
                disabled={creating}
              />
            </div>
          </div>
        </section>

        <div class="actions">
          <div class="action-group action-group-right">
            <button
              class="cancel"
              type="button"
              disabled={creating}
              onclick={cancel}
            >
              <X size={16} strokeWidth={2} />
              <span>Cancelar</span>
            </button>
            <button class="success" type="submit" disabled={creating}>
              {#if creating}
                <LoaderCircle class="spin" size={16} strokeWidth={2} />
              {:else}
                <Save size={16} strokeWidth={2} />
              {/if}
              <span>{creating ? "Criando…" : "Criar comunidade"}</span>
            </button>
          </div>
        </div>
      </form>
    </div>
  </div>
</div>

<svelte:window onkeydown={(event) => event.key === "Escape" && cancel()} />

<style>
  .backdrop {
    position: fixed;
    z-index: 3200;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 20px;
    background: rgba(15, 23, 42, 0.52);
    inset: 0;
    animation: fade-in var(--motion-fast) ease-out;
  }

  .dialog {
    position: relative;
    z-index: 1;
    display: grid;
    grid-template-rows: auto minmax(0, 1fr);
    width: min(920px, 100%);
    max-height: min(88dvh, 980px);
    overflow: hidden;
    border: 1px solid var(--border);
    border-radius: 20px;
    background: var(--canvas);
    box-shadow: 0 22px 48px rgba(15, 23, 42, 0.18);
    animation: rise var(--motion-base) ease-out;
  }

  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    padding: 22px 24px 18px;
    border-bottom: 1px solid var(--border);
  }

  h2,
  h3 {
    margin: 0;
    color: var(--ink-950);
    font-weight: 600;
    line-height: 1.2;
  }

  h2 {
    font-size: var(--text-xl);
  }

  h3 {
    font-size: var(--text-lg);
  }

  .close {
    display: inline-flex;
    width: auto;
    min-height: auto;
    align-items: center;
    justify-content: center;
    padding: 0;
    border: 0;
    color: var(--muted);
    background: transparent;
    box-shadow: none;
  }

  .close:hover {
    color: var(--text);
  }

  .body {
    min-height: 0;
    overflow-x: hidden;
    overflow-y: auto;
    padding: 18px 18px 20px;
    overscroll-behavior: contain;
  }

  form {
    display: grid;
    gap: 14px;
  }

  .notice {
    padding: 10px 12px;
    border: 1px solid color-mix(in srgb, var(--danger) 30%, var(--border));
    border-radius: var(--radius-md);
    color: var(--danger);
    background: color-mix(in srgb, var(--danger) 6%, white);
    font-size: var(--text-sm);
  }

  .section {
    display: grid;
    gap: 12px;
    padding: 14px;
    border: 1px solid var(--border);
    border-radius: 20px;
    background: var(--panel);
  }

  .about-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 12px;
  }

  .field {
    min-width: 0;
  }

  .field.full {
    grid-column: 1 / -1;
  }

  .field-label {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    margin: 0 2px 7px;
    color: var(--ink-800);
    font-size: var(--text-sm);
    font-weight: 600;
  }

  .field-label span {
    color: var(--ink-400);
    font-size: 9px;
    font-weight: 500;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }

  .field-hint {
    display: block;
    margin: 6px 3px 0;
    color: var(--ink-400);
    font-size: 10px;
    line-height: 1.35;
  }

  .field-counter {
    text-align: right;
  }

  .cover-control {
    position: relative;
    display: grid;
    height: 190px;
    place-items: center;
    overflow: hidden;
    border: 1px dashed var(--border-strong);
    border-radius: var(--radius-xl);
    color: var(--muted);
    background: var(--surface-soft);
    cursor: pointer;
  }

  .cover-control:focus-within {
    border-color: var(--primary);
    box-shadow: var(--focus-ring);
  }

  .cover-control img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .cover-placeholder {
    display: grid;
    justify-items: center;
    gap: 6px;
  }

  .cover-placeholder strong {
    color: var(--ink-800);
    font-size: var(--text-md);
  }

  .cover-placeholder small {
    font-size: var(--text-xs);
  }

  .cover-overlay {
    position: absolute;
    right: 12px;
    bottom: 12px;
    display: inline-flex;
    align-items: center;
    gap: 7px;
    padding: 8px 10px;
    border-radius: var(--radius-md);
    color: white;
    background: rgba(15, 23, 42, 0.72);
    font-size: var(--text-xs);
    font-weight: 600;
  }

  .file-input {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
  }

  .control {
    display: grid;
    grid-template-columns: 18px minmax(0, 1fr);
    min-height: 52px;
    align-items: center;
    gap: 10px;
    padding: 0 14px;
    border: 1px solid var(--border-strong);
    border-radius: 14px;
    background: color-mix(in srgb, var(--panel) 94%, var(--brand-50));
    box-shadow: 0 1px 2px rgba(15, 23, 42, 0.03);
    transition:
      border-color var(--motion-fast) ease,
      background var(--motion-fast) ease,
      box-shadow var(--motion-fast) ease;
  }

  .control:hover {
    border-color: color-mix(in srgb, var(--brand-500) 32%, var(--border));
    background: var(--panel);
  }

  .control:focus-within {
    border-color: var(--primary);
    background: var(--panel);
    box-shadow: var(--focus-ring);
  }

  .control-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    color: var(--ink-400);
    transition: color var(--motion-fast) ease;
  }

  .control:focus-within .control-icon {
    color: var(--primary);
  }

  .dialog :global(.user-search--social .selector-control) {
    min-height: 52px;
    border-color: var(--border-strong);
    border-radius: 14px;
    background: color-mix(in srgb, var(--panel) 94%, var(--brand-50));
    box-shadow: 0 1px 2px rgba(15, 23, 42, 0.03);
  }

  .dialog :global(.user-search--social .selector-control:hover) {
    border-color: color-mix(in srgb, var(--brand-500) 32%, var(--border));
    background: var(--panel);
  }

  input,
  select,
  textarea {
    width: 100%;
    min-width: 0;
    min-height: 0;
    padding: 0;
    border: 0;
    border-radius: 0;
    outline: 0;
    color: var(--text);
    background: transparent;
    box-shadow: none;
    font: inherit;
    font-size: var(--text-md);
    font-weight: 400;
    line-height: 1.45;
  }

  input::placeholder,
  textarea::placeholder {
    color: var(--muted);
    opacity: 1;
  }

  select {
    cursor: pointer;
  }

  .textarea-control {
    min-height: 118px;
    align-items: start;
    padding-block: 12px;
  }

  .textarea-control .control-icon {
    margin-top: 3px;
  }

  textarea {
    min-height: 92px;
    resize: vertical;
  }

  .actions {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
  }

  .action-group {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .action-group-right {
    margin-left: auto;
  }

  .actions button {
    display: inline-flex;
    min-width: 136px;
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

  .cancel {
    border: 1px solid var(--primary);
    background: var(--primary);
    box-shadow: 0 8px 18px rgba(46, 86, 255, 0.22);
  }

  .cancel:hover {
    border-color: var(--brand-700);
    background: var(--brand-700);
  }

  .success {
    border: 1px solid #16a34a;
    background: #16a34a;
    box-shadow: 0 8px 18px rgba(22, 163, 74, 0.22);
  }

  .success:hover {
    border-color: #15803d;
    background: #15803d;
  }

  .actions button:disabled,
  .actions button:disabled:hover {
    border-color: var(--border);
    color: var(--muted);
    background: var(--surface-soft);
    box-shadow: none;
    cursor: not-allowed;
  }

  :global(.spin) {
    animation: spin 0.8s linear infinite;
  }

  @keyframes fade-in {
    from {
      opacity: 0;
    }
  }

  @keyframes rise {
    from {
      transform: translateY(8px) scale(0.99);
    }
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  @media (max-width: 760px) {
    .backdrop {
      align-items: stretch;
      padding: 8px;
    }

    .dialog {
      width: 100%;
      max-height: calc(100dvh - 16px);
      border-radius: var(--radius-lg);
    }

    header {
      padding: 14px 14px 12px;
    }

    .body {
      padding: 12px;
    }

    .section {
      padding: 12px;
      border-radius: var(--radius-lg);
    }

    .actions,
    .action-group {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      width: 100%;
    }

    .action-group-right {
      margin-left: 0;
    }

    .actions button {
      width: 100%;
    }
  }

  @media (max-width: 520px) {
    .about-grid,
    .actions,
    .action-group {
      grid-template-columns: minmax(0, 1fr);
    }
  }
</style>
