<script lang="ts">
  import IconColorPicker from "$lib/ui/IconColorPicker.svelte";
  import type { GlobalSelectorItem } from "$lib/ui/GlobalSelector.svelte";
  import UserSearch from "$lib/ui/UserSearch.svelte";
  import { Plus, Save, X } from "@lucide/svelte";
  import { onMount, tick } from "svelte";

  export type WorkspaceFormValue = {
    name: string;
    description: string;
    icon: string;
    color: string;
    people: GlobalSelectorItem[];
  };

  let {
    title,
    actionLabel,
    initialValue,
    nameDisabled = false,
    peopleDisabled = false,
    error = "",
    oncancel,
    onsave,
  } = $props<{
    title: string;
    actionLabel: string;
    initialValue?: Partial<WorkspaceFormValue>;
    nameDisabled?: boolean;
    peopleDisabled?: boolean;
    error?: string;
    oncancel: () => void;
    onsave: (value: WorkspaceFormValue) => void;
  }>();

  let name = $state("");
  let description = $state("");
  let icon = $state("briefcase-business");
  let color = $state("blue");
  let selectedPeople = $state<GlobalSelectorItem[]>([]);
  let selectionError = $state("");
  let nameInput: HTMLInputElement;

  onMount(() => {
    name = initialValue?.name ?? "";
    description = initialValue?.description ?? "";
    icon = initialValue?.icon ?? "briefcase-business";
    color = initialValue?.color ?? "blue";
    selectedPeople = initialValue?.people ?? [];
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    void tick().then(() => nameInput?.focus());
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  });

  function submit(event: SubmitEvent): void {
    event.preventDefault();
    onsave({
      name,
      description,
      icon,
      color,
      people: selectedPeople,
    });
  }

  function handleSelectedPeople(next: GlobalSelectorItem[]): void {
    if (next.length > 20) {
      selectedPeople = next.slice(0, 20);
      selectionError = "Cada workspace aceita no máximo 20 colaboradores.";
      return;
    }
    selectionError = "";
  }
</script>

<div
  class="backdrop"
  role="presentation"
  onclick={(event) => event.target === event.currentTarget && oncancel()}
>
  <div
    class="dialog"
    role="dialog"
    aria-modal="true"
    aria-labelledby="workspace-form-title"
  >
    <header>
      <h2 id="workspace-form-title">{title}</h2>
      <button type="button" aria-label="Fechar" onclick={oncancel}>
        <X size={19} />
      </button>
    </header>

    <form onsubmit={submit}>
      {#if error || selectionError}<div class="notice" role="alert">
          {error || selectionError}
        </div>{/if}

      <div class="name-row">
        <input
          bind:this={nameInput}
          required
          maxlength="60"
          aria-label="Nome do workspace"
          placeholder="Nome do workspace"
          disabled={nameDisabled}
          bind:value={name}
        />
        <IconColorPicker bind:selectedIcon={icon} bind:selectedColor={color} />
      </div>

      <textarea
        rows="4"
        maxlength="240"
        aria-label="Descrição do workspace"
        placeholder="Descrição do workspace"
        bind:value={description}></textarea>

      <UserSearch
        bind:selected={selectedPeople}
        selection="multiple"
        display="workspace"
        allowEmailInvites
        label="Pessoas"
        placeholder="@usuário ou e-mail"
        emptyMessage="Nenhuma pessoa encontrada."
        dropdownPosition="above"
        maxResults={3}
        disabled={peopleDisabled}
        onselectedchange={handleSelectedPeople}
      />

      <footer>
        <button class="primary" type="submit">
          {#if actionLabel.toLocaleLowerCase("pt-BR").includes("criar")}
            <Plus size={17} />
          {:else}
            <Save size={17} />
          {/if}
          {actionLabel}
        </button>
      </footer>
    </form>
  </div>
</div>

<style>
  .backdrop {
    position: fixed;
    z-index: 3200;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 20px;
    background: rgba(15, 23, 42, 0.48);
    backdrop-filter: blur(3px);
  }

  .dialog {
    --icon-color-picker-trigger-focus-shadow: none;

    display: flex;
    width: min(680px, 100%);
    max-height: min(90dvh, 860px);
    overflow: hidden;
    flex-direction: column;
    border: 1px solid var(--border);
    border-radius: 20px;
    background: var(--surface);
    box-shadow: var(--shadow-lg);
  }

  header {
    display: flex;
    min-height: 74px;
    align-items: center;
    justify-content: space-between;
    gap: 18px;
    padding: 17px 16px 17px 20px;
    border-bottom: 1px solid var(--border);
  }

  header h2 {
    color: var(--ink-900);
    font-size: var(--text-lg);
    line-height: 1.2;
  }

  header button {
    display: grid;
    width: 36px;
    height: 36px;
    flex: 0 0 auto;
    place-items: center;
    border: 1px solid var(--border);
    border-radius: 11px;
    color: var(--ink-600);
    background: var(--surface);
  }

  header button:hover {
    color: var(--ink-900);
    background: var(--surface-hover);
  }

  form {
    display: grid;
    gap: 13px;
    overflow-y: auto;
    padding: 16px 16px 14px;
    overscroll-behavior: contain;
  }

  .name-row {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  input,
  textarea {
    width: 100%;
    min-width: 0;
    border: 1px solid var(--border);
    border-radius: var(--radius-xl);
    outline: 0;
    color: var(--ink-800);
    background: var(--surface);
    font: inherit;
    transition:
      border-color var(--motion-fast) ease,
      box-shadow var(--motion-fast) ease;
  }

  input {
    min-height: 58px;
    padding: 0 14px;
  }

  textarea {
    min-height: 118px;
    padding: 13px 14px;
    resize: vertical;
  }

  input::placeholder,
  textarea::placeholder {
    color: var(--ink-400);
  }

  input:disabled {
    cursor: not-allowed;
    color: var(--ink-600);
    background: var(--surface-muted);
  }

  input:focus,
  textarea:focus {
    border-color: var(--brand-500);
    box-shadow: none;
  }

  .notice {
    padding: 10px 12px;
    border: 1px solid color-mix(in srgb, var(--red-500) 30%, var(--border));
    border-radius: 11px;
    color: var(--red-500);
    background: color-mix(in srgb, var(--red-500) 6%, white);
    font-size: var(--text-xs);
  }

  footer {
    display: flex;
    justify-content: flex-end;
    padding-top: 12px;
    border-top: 1px solid var(--border);
  }

  .primary {
    display: inline-flex;
    min-height: 42px;
    align-items: center;
    justify-content: center;
    gap: 7px;
    padding: 0 16px;
    border: 0;
    border-radius: 11px;
    color: white;
    background: var(--brand-600);
    box-shadow: 0 8px 18px rgba(46, 86, 255, 0.2);
    font-size: var(--text-sm);
    font-weight: 700;
  }

  @media (max-width: 560px) {
    .backdrop {
      align-items: flex-end;
      padding: 0;
    }

    .dialog {
      max-height: 94dvh;
      border-radius: 20px 20px 0 0;
    }

    .name-row {
      align-items: stretch;
      flex-wrap: wrap;
    }

    .name-row > input {
      flex-basis: 100%;
    }
  }
</style>
