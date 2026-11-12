<script module lang="ts">
  export type EntityFormMode = "create" | "view" | "edit";
</script>

<script lang="ts">
  import {
    businessResponsiblesFromRecord,
    listBusinessResponsibleUsers,
  } from "$lib/businesses/client";
  import {
    contactToEntityRecord,
    listAllActiveContacts,
  } from "$lib/contacts/client";
  import {
    currentSettings,
    loadSettingsFromServer,
  } from "$lib/settings/client";
  import GlobalSelector, {
    type GlobalSelectorItem,
  } from "$lib/ui/GlobalSelector.svelte";
  import { recordPageHrefForEntity } from "$lib/records/record-page";
  import { Archive, Pencil, Save, Trash2, X } from "@lucide/svelte";
  import { onMount } from "svelte";
  import {
    BRAZILIAN_MOBILE_PHONE_PATTERN,
    EMAIL_PATTERN,
    formatBrazilianMobilePhone,
    formatEmail,
    isValidBrazilianMobilePhone,
    isValidEmail,
  } from "./contact-format";
  import type { EntityConfig, EntityField, EntityRecord } from "./types";

  let { config, record, mode, oncancel, onsave, onedit, onarchive, ondelete } =
    $props<{
      config: EntityConfig;
      record?: EntityRecord;
      mode?: EntityFormMode;
      oncancel: () => void;
      onsave: (values: Record<string, string>) => void;
      onedit?: () => void;
      onarchive?: () => void;
      ondelete?: () => void;
    }>();

  let form = $state<Record<string, string>>({});
  let configuredFields = $state<EntityField[] | undefined>();
  let people = $state<GlobalSelectorItem[]>([]);
  let selectedPeople = $state<GlobalSelectorItem[]>([]);
  let peopleValidationMessage = $state("");
  let peopleLoading = $state(false);
  let peopleLoadError = $state("");
  let peopleAbortController: AbortController | undefined;
  let formNode: HTMLFormElement;
  let fields: EntityField[] = $derived(configuredFields ?? config.fields);
  let resolvedMode = $derived(mode ?? (record ? "edit" : "create"));
  let viewOnly = $derived(resolvedMode === "view");
  let title = $derived(
    resolvedMode === "view"
      ? `Ver ${config.singular}`
      : resolvedMode === "edit"
        ? config.editTitle
        : config.createTitle,
  );
  let recordHref = $derived(
    record?.id ? recordPageHrefForEntity(config.key, record.id) : undefined,
  );
  let modalTitle = $derived(viewOnly && record?.nome ? record.nome : title);

  function closeBeforePageNavigation(event: MouseEvent): void {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)
      return;
    oncancel();
  }

  $effect(() => {
    form = Object.fromEntries(
      fields.map((field: EntityField) => {
        const storedValue = normalizeFieldValue(
          field,
          record?.[field.name] ?? "",
        );
        const value = field.options?.length
          ? field.options.some((option) => option.value === storedValue)
            ? storedValue
            : field.options[0].value
          : storedValue;
        return [field.name, value];
      }),
    );
  });

  $effect(() => {
    if (selectedPeople.length > 0) peopleValidationMessage = "";
  });

  function applyBusinessSettings(
    settings: ReturnType<typeof currentSettings>,
  ): void {
    if (config.key !== "negocios") return;
    configuredFields = config.fields.map((field: EntityField) => {
      if (field.name === "categoria") {
        return {
          ...field,
          options: withStoredOption(
            settings.businessCategories.map(({ key, label }) => ({
              value: key,
              label,
            })),
            record?.categoria,
          ),
        };
      }
      if (field.name === "etapa") {
        return {
          ...field,
          options: withStoredOption(
            settings.businessStatuses
              .filter(
                ({ key }) => key !== "arquivado" || Boolean(record?.archivedAt),
              )
              .map(({ key, label }, index) => ({
                value: key,
                label,
                tone: statusTone(index),
              })),
            record?.etapa,
          ),
        };
      }
      return field;
    });
  }

  onMount(() => {
    if (config.key === "negocios") {
      applyBusinessSettings(currentSettings());
      void loadSettingsFromServer()
        .then(applyBusinessSettings)
        .catch(() => undefined);
      void loadBusinessResponsibles();
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    queueMicrotask(() =>
      formNode.querySelector<HTMLElement>("input, select, textarea")?.focus(),
    );
    return () => {
      peopleAbortController?.abort();
      document.body.style.overflow = previousOverflow;
    };
  });

  async function loadBusinessResponsibles(): Promise<void> {
    peopleAbortController?.abort();
    const controller = new AbortController();
    peopleAbortController = controller;
    peopleLoading = true;
    peopleLoadError = "";
    const retainedPeople = businessResponsiblesFromRecord(record).map(
      (responsible): GlobalSelectorItem => ({
        id:
          responsible.kind === "user"
            ? `user:${responsible.userId}`
            : `contact:${responsible.contactId}`,
        label: responsible.name,
        description: [
          responsible.kind === "user"
            ? `@${responsible.username} · Usuário`
            : responsible.profession,
          responsible.archivedAt
            ? responsible.kind === "user"
              ? "Usuário indisponível"
              : "Contato arquivado"
            : "",
        ]
          .filter(Boolean)
          .join(" · "),
        updatedAt: record?.updatedAt,
      }),
    );
    people = retainedPeople;
    selectedPeople = selectedPeopleFromRecord(record, retainedPeople);

    try {
      const [contacts, users] = await Promise.all([
        listAllActiveContacts({
          orderBy: "name_asc",
          signal: controller.signal,
        }),
        listBusinessResponsibleUsers(fetch, controller.signal),
      ]);
      const activePeople = contacts
        .map(contactToEntityRecord)
        .filter((person) => Boolean(person.nome))
        .map(toPeopleSelectorItem);
      const activeUsers = users.map((user): GlobalSelectorItem => ({
        id: `user:${user.id}`,
        label: user.name,
        description: user.current
          ? "Você · Usuário"
          : `@${user.username} · Usuário`,
        updatedAt: user.id,
      }));
      const optionsById = new Map(
        retainedPeople.map((person) => [person.id, person]),
      );
      for (const person of activePeople) optionsById.set(person.id, person);
      for (const user of activeUsers) optionsById.set(user.id, user);
      people = [...optionsById.values()];
      selectedPeople = selectedPeopleFromRecord(record, people);
    } catch {
      if (controller.signal.aborted) return;
      people = retainedPeople;
      selectedPeople = selectedPeopleFromRecord(record, retainedPeople);
      peopleLoadError =
        "Não foi possível carregar os contatos e usuários responsáveis.";
    } finally {
      if (peopleAbortController === controller) peopleLoading = false;
    }
  }

  function placeholderFor(field: EntityField): string {
    const placeholder = field.placeholder ?? field.label;
    return field.required ? `${placeholder} *` : placeholder;
  }

  function normalizeFieldValue(field: EntityField, value: string): string {
    if (field.type === "tel") return formatBrazilianMobilePhone(value);
    if (field.type === "email") return formatEmail(value);
    return value;
  }

  function patternFor(field: EntityField): string | undefined {
    if (field.type === "tel") return BRAZILIAN_MOBILE_PHONE_PATTERN;
    if (field.type === "email") return EMAIL_PATTERN;
    return undefined;
  }

  function autocompleteFor(field: EntityField): "tel" | "email" | undefined {
    if (field.type === "tel") return "tel";
    if (field.type === "email") return "email";
    return undefined;
  }

  function statusTone(
    index: number,
  ): NonNullable<NonNullable<EntityField["options"]>[number]["tone"]> {
    return ["blue", "amber", "green", "red", "gray"][index] as NonNullable<
      NonNullable<EntityField["options"]>[number]["tone"]
    >;
  }

  function withStoredOption(
    options: NonNullable<EntityField["options"]>,
    storedValue: string | undefined,
  ): NonNullable<EntityField["options"]> {
    if (!storedValue || options.some(({ value }) => value === storedValue)) {
      return options;
    }
    return [...options, { value: storedValue, label: storedValue }];
  }

  function toPeopleSelectorItem(person: EntityRecord): GlobalSelectorItem {
    return {
      id: `contact:${person.id}`,
      label: person.nome,
      description: [person.cargo, person.email, "Contato"]
        .filter(Boolean)
        .join(" · "),
      updatedAt: person.updatedAt,
    };
  }

  function storedResponsibleIds(value: string | undefined): string[] {
    if (!value) return [];
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed)
        ? parsed.filter((id): id is string => typeof id === "string")
        : [];
    } catch {
      return [];
    }
  }

  function selectedPeopleFromRecord(
    currentRecord: EntityRecord | undefined,
    options: GlobalSelectorItem[],
  ): GlobalSelectorItem[] {
    if (!currentRecord) return [];
    const ids = storedResponsibleIds(currentRecord.responsavelIds);
    if (ids.length) {
      const byId = new Map(options.map((person) => [person.id, person]));
      const selected = ids.flatMap((id) => {
        const person = byId.get(id);
        return person ? [person] : [];
      });
      if (selected.length) return selected;
    }

    const names = (currentRecord.responsaveis ?? "")
      .split(",")
      .map((name) => name.trim())
      .filter(Boolean);
    const byName = new Map(
      options.map((person) => [
        person.label.toLocaleLowerCase("pt-BR"),
        person,
      ]),
    );
    return names.map(
      (name, index) =>
        byName.get(name.toLocaleLowerCase("pt-BR")) ?? {
          id: `responsavel-legado-${index}-${name}`,
          label: name,
          description: "Pessoa responsável",
        },
    );
  }

  function update(field: EntityField, control: HTMLInputElement): void;
  function update(
    field: EntityField,
    control: HTMLSelectElement | HTMLTextAreaElement,
  ): void;
  function update(
    field: EntityField,
    control: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement,
  ): void {
    const value = normalizeFieldValue(field, control.value);
    control.value = value;
    form[field.name] = value;
    const registeredControl = formNode?.elements.namedItem(field.name);
    if (
      registeredControl instanceof HTMLInputElement ||
      registeredControl instanceof HTMLSelectElement ||
      registeredControl instanceof HTMLTextAreaElement
    ) {
      registeredControl.setCustomValidity("");
    }
  }

  function validateContactFields(): boolean {
    for (const field of fields) {
      const value = (form[field.name] ?? "").trim();
      if (!value) continue;

      const message =
        field.type === "tel" && !isValidBrazilianMobilePhone(value)
          ? "Informe o telefone completo no formato 88 9 8121.9267."
          : field.type === "email" && !isValidEmail(value)
            ? "Informe um e-mail válido, como nome@exemplo.com.br."
            : "";
      if (!message) continue;

      const control = formNode.elements.namedItem(field.name);
      if (control instanceof HTMLInputElement) {
        control.setCustomValidity(message);
        control.reportValidity();
        control.focus();
      }
      return false;
    }
    return true;
  }

  function submit(event: SubmitEvent): void {
    event.preventDefault();
    if (viewOnly) return;
    if (config.key === "negocios" && (peopleLoading || peopleLoadError)) {
      peopleValidationMessage = peopleLoading
        ? "Aguarde o carregamento dos contatos."
        : peopleLoadError;
      return;
    }
    const emptyRequiredField = fields.find(
      (field: EntityField) =>
        field.required &&
        !(field.type === "people"
          ? selectedPeople.length > 0
          : (form[field.name] ?? "").trim()),
    );
    if (emptyRequiredField) {
      if (emptyRequiredField.type === "people") {
        peopleValidationMessage = "Selecione ao menos uma pessoa responsável.";
        queueMicrotask(() =>
          formNode
            .querySelector<HTMLInputElement>(".people-field input")
            ?.focus(),
        );
        return;
      }
      const control = formNode.elements.namedItem(emptyRequiredField.name);
      if (
        control instanceof HTMLInputElement ||
        control instanceof HTMLSelectElement ||
        control instanceof HTMLTextAreaElement
      ) {
        control.setCustomValidity("Preencha este campo.");
        control.reportValidity();
        control.focus();
      }
      return;
    }
    if (!validateContactFields() || !formNode.reportValidity()) return;
    const values = { ...form };
    if (fields.some((field) => field.type === "people")) {
      values.responsaveis = selectedPeople
        .map((person) => person.label)
        .join(", ");
      values.responsavelIds = JSON.stringify(
        selectedPeople.map((person) => person.id),
      );
    }
    onsave(values);
  }
</script>

<div
  class="backdrop"
  role="presentation"
  onclick={(event) => event.target === event.currentTarget && oncancel()}
>
  <div
    class="dialog"
    class:business-dialog={config.key === "negocios"}
    role="dialog"
    aria-modal="true"
    aria-labelledby="entity-form-title"
  >
    <header>
      <h2 id="entity-form-title">
        {#if viewOnly && recordHref}
          <a
            class="record-page-link"
            href={recordHref}
            onclick={closeBeforePageNavigation}>{modalTitle}</a
          >
        {:else}
          {modalTitle}
        {/if}
      </h2>
      <button
        class="close"
        type="button"
        aria-label="Fechar"
        onclick={oncancel}
      >
        <X size={18} strokeWidth={2} />
      </button>
    </header>

    <div class="body">
      <form class:view-mode={viewOnly} bind:this={formNode} onsubmit={submit}>
        <section
          class="form-section"
          class:business-section={config.key === "negocios"}
        >
          {#if config.key !== "negocios"}
            <h3>{config.formSectionTitle}</h3>
          {/if}
          <div class="fields">
            {#each fields as field (field.name)}
              {@const FieldIcon = field.icon}
              <div
                class="field"
                class:half={field.half}
                class:people-field={field.type === "people"}
              >
                {#if field.type === "people"}
                  <GlobalSelector
                    items={people}
                    bind:selected={selectedPeople}
                    selection="multiple"
                    presentation="search"
                    label="Responsáveis"
                    placeholder="Selecione um contato ou usuário"
                    emptyMessage={peopleLoading
                      ? "Carregando contatos e usuários…"
                      : "Nenhum contato ou usuário disponível."}
                    icon={FieldIcon}
                    showInitials
                    disabled={viewOnly ||
                      peopleLoading ||
                      Boolean(peopleLoadError)}
                    required={field.required}
                    invalid={Boolean(peopleValidationMessage)}
                    errorMessage={peopleValidationMessage}
                    showLabel={false}
                    showHelper={false}
                  />
                  {#if peopleLoading}
                    <p class="people-state" aria-live="polite">
                      Carregando contatos e usuários…
                    </p>
                  {:else if peopleLoadError}
                    <p class="people-state people-error" role="alert">
                      {peopleLoadError}
                      <button
                        type="button"
                        onclick={() => void loadBusinessResponsibles()}
                        >Tentar novamente</button
                      >
                    </p>
                  {/if}
                {:else}
                  <div
                    class="control"
                    class:textarea-control={field.type === "textarea"}
                  >
                    <span class="control-icon" aria-hidden="true">
                      <FieldIcon size={15} strokeWidth={1.8} />
                    </span>

                    {#if field.type === "select"}
                      <select
                        name={field.name}
                        value={form[field.name] ?? ""}
                        required={field.required}
                        disabled={viewOnly}
                        aria-label={field.label}
                        aria-readonly={viewOnly}
                        onchange={(event) => update(field, event.currentTarget)}
                      >
                        {#each field.options ?? [] as option (option.value)}
                          <option value={option.value}>{option.label}</option>
                        {/each}
                      </select>
                    {:else if field.type === "textarea"}
                      <textarea
                        name={field.name}
                        value={form[field.name] ?? ""}
                        placeholder={placeholderFor(field)}
                        required={field.required}
                        disabled={viewOnly}
                        aria-label={field.label}
                        aria-readonly={viewOnly}
                        rows="4"
                        oninput={(event) => update(field, event.currentTarget)}
                      ></textarea>
                    {:else}
                      <input
                        name={field.name}
                        type={field.type}
                        value={form[field.name] ?? ""}
                        placeholder={placeholderFor(field)}
                        required={field.required}
                        disabled={viewOnly}
                        aria-label={field.label}
                        aria-readonly={viewOnly}
                        autocomplete={autocompleteFor(field)}
                        inputmode={field.type === "tel" ? "numeric" : undefined}
                        maxlength={field.type === "tel" ? 14 : undefined}
                        pattern={patternFor(field)}
                        title={field.type === "tel"
                          ? "Use o formato 88 9 8121.9267"
                          : field.type === "email"
                            ? "Use um e-mail como nome@exemplo.com.br"
                            : undefined}
                        min={field.type === "number"
                          ? (field.min ?? "0")
                          : undefined}
                        max={field.type === "number" ? field.max : undefined}
                        step={field.type === "number"
                          ? (field.step ?? "0.01")
                          : undefined}
                        oninput={(event) => update(field, event.currentTarget)}
                      />
                    {/if}
                  </div>
                {/if}
              </div>
            {/each}
          </div>
        </section>

        <div class="actions">
          {#if resolvedMode === "view"}
            <div class="action-group action-group-right">
              <button
                class="primary"
                type="button"
                disabled={!onedit}
                onclick={() => onedit?.()}
              >
                <Pencil size={16} strokeWidth={2} />
                <span>Editar</span>
              </button>
              <button
                class="archive"
                type="button"
                disabled={!onarchive}
                onclick={() => onarchive?.()}
              >
                <Archive size={16} strokeWidth={2} />
                <span>Arquivar</span>
              </button>
            </div>
          {:else if resolvedMode === "edit"}
            <div class="action-group">
              <button
                class="danger"
                type="button"
                disabled={!ondelete}
                onclick={() => ondelete?.()}
              >
                <Trash2 size={16} strokeWidth={2} />
                <span>Excluir</span>
              </button>
              <button
                class="archive"
                type="button"
                disabled={!onarchive}
                onclick={() => onarchive?.()}
              >
                <Archive size={16} strokeWidth={2} />
                <span>Arquivar</span>
              </button>
            </div>
            <div class="action-group action-group-right">
              <button class="cancel" type="button" onclick={oncancel}>
                <X size={16} strokeWidth={2} />
                <span>Cancelar</span>
              </button>
              <button class="success" type="submit">
                <Save size={16} strokeWidth={2} />
                <span>Salvar</span>
              </button>
            </div>
          {:else}
            <div class="action-group action-group-right">
              <button class="cancel" type="button" onclick={oncancel}>
                <X size={16} strokeWidth={2} />
                <span>Cancelar</span>
              </button>
              <button class="success" type="submit">
                <Save size={16} strokeWidth={2} />
                <span>{config.createAction}</span>
              </button>
            </div>
          {/if}
        </div>
      </form>
    </div>
  </div>
</div>

<svelte:window onkeydown={(event) => event.key === "Escape" && oncancel()} />

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
  .dialog.business-dialog {
    width: min(830px, 100%);
  }
  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    padding: 22px 24px 18px;
    border-bottom: 1px solid var(--border);
  }
  h2 {
    color: var(--ink-950);
    font-size: var(--text-xl);
    font-weight: 600;
    line-height: 1.25;
    letter-spacing: 0;
  }
  .record-page-link {
    color: inherit;
  }
  .record-page-link:hover,
  .record-page-link:focus-visible {
    color: var(--brand-600);
    text-decoration: underline;
    outline: 0;
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
  }
  form {
    display: grid;
    gap: 14px;
  }
  .form-section {
    display: grid;
    gap: 12px;
    padding: 14px;
    border: 1px solid var(--border);
    border-radius: 20px;
    background: var(--panel);
    box-shadow: none;
  }
  .form-section.business-section {
    gap: 8px;
  }
  h3 {
    color: var(--ink-950);
    font-size: var(--text-lg);
    font-weight: 600;
    line-height: 1.2;
  }
  .fields {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px 10px;
  }
  .field {
    grid-column: 1 / -1;
    min-width: 0;
  }
  .field.half {
    grid-column: auto;
  }
  .people-state {
    margin: 6px 4px 0;
    color: var(--muted);
    font-size: var(--text-xs);
  }
  .people-error {
    color: var(--red-700, #b91c1c);
  }
  .people-state button {
    margin-left: 6px;
    border: 0;
    color: inherit;
    background: transparent;
    font: inherit;
    font-weight: 700;
    text-decoration: underline;
  }
  .control {
    display: grid;
    grid-template-columns: 18px minmax(0, 1fr);
    min-height: 58px;
    align-items: center;
    gap: 10px;
    padding: 0 14px;
    border: 1px solid var(--border);
    border-radius: var(--radius-xl);
    background: var(--panel);
    transition:
      border-color var(--motion-fast) ease,
      box-shadow var(--motion-fast) ease,
      background var(--motion-fast) ease;
  }
  .control:focus-within {
    border-color: var(--primary);
    box-shadow: none;
  }
  .textarea-control {
    min-height: 118px;
    align-items: start;
    padding-block: 12px;
  }
  .control-icon {
    display: inline-flex;
    align-self: center;
    align-items: center;
    justify-content: center;
    color: var(--muted);
  }
  .textarea-control .control-icon {
    align-self: start;
    margin-top: 3px;
  }
  input,
  select,
  textarea {
    width: 100%;
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
  select {
    cursor: pointer;
  }
  .view-mode input:disabled,
  .view-mode select:disabled,
  .view-mode textarea:disabled {
    color: var(--text);
    opacity: 1;
    cursor: default;
    -webkit-text-fill-color: var(--text);
  }
  .view-mode textarea:disabled {
    resize: none;
  }
  textarea {
    min-height: 92px;
    resize: vertical;
  }
  input::placeholder,
  textarea::placeholder {
    color: var(--muted);
    opacity: 1;
  }
  .actions {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    margin-top: 6px;
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
    min-width: 150px;
    min-height: 40px;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 10px 12px;
    border-radius: var(--radius-md);
    color: white;
    font: inherit;
    font-size: var(--text-md);
    font-weight: 500;
    line-height: 1.2;
    transition:
      background var(--motion-fast) ease,
      border-color var(--motion-fast) ease,
      box-shadow var(--motion-fast) ease;
  }
  .primary {
    border: 1px solid var(--primary);
    background: var(--primary);
    box-shadow: 0 8px 18px rgba(46, 86, 255, 0.22);
  }
  .primary:hover {
    border-color: #1f3fc2;
    background: #2447d8;
  }
  .archive {
    border: 1px solid #64748b;
    color: white;
    background: #64748b;
    box-shadow: 0 8px 18px rgba(71, 85, 105, 0.2);
  }
  .archive:hover {
    border-color: #475569;
    background: #475569;
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
  .danger {
    border: 1px solid #dc2626;
    background: #dc2626;
    box-shadow: 0 8px 18px rgba(220, 38, 38, 0.24);
  }
  .danger:hover {
    border-color: #991b1b;
    background: #b91c1c;
  }
  .cancel {
    border: 1px solid var(--primary);
    background: var(--primary);
    box-shadow: 0 8px 18px rgba(46, 86, 255, 0.22);
  }
  .cancel:hover {
    border-color: #1f3fc2;
    background: #2447d8;
  }
  .actions button:disabled,
  .actions button:disabled:hover {
    border-color: var(--border);
    color: var(--muted);
    background: var(--surface-soft);
    box-shadow: none;
    cursor: not-allowed;
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
    .form-section {
      padding: 12px;
      border-radius: var(--radius-lg);
    }
    .control {
      min-height: 52px;
      border-radius: var(--radius-lg);
    }
    .actions {
      display: grid;
      grid-template-columns: 1fr;
      align-items: stretch;
      justify-content: stretch;
    }
    .actions button {
      width: 100%;
    }
    .action-group {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      width: 100%;
    }
    .action-group-right {
      margin-left: 0;
    }
  }
  @media (max-width: 520px) {
    .fields {
      grid-template-columns: minmax(0, 1fr);
    }
    .field.half {
      grid-column: 1 / -1;
    }
  }
</style>
