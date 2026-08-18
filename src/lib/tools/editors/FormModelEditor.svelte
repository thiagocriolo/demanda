<script lang="ts">
  import { GripVertical, Plus, Trash2 } from "@lucide/svelte";
  import type { FormField, FormFieldKind, FormToolConfig } from "../types";

  let { config, onchange } = $props<{
    config: FormToolConfig;
    onchange: (config: FormToolConfig) => void;
  }>();

  const fieldKinds: Array<{ value: FormFieldKind; label: string }> = [
    { value: "short_text", label: "Texto curto" },
    { value: "long_text", label: "Texto longo" },
    { value: "single_choice", label: "Seleção" },
    { value: "multi_choice", label: "Múltipla seleção" },
    { value: "number", label: "Número" },
    { value: "date", label: "Data" },
    { value: "section", label: "Texto de orientação" },
  ];

  function update(values: Partial<FormToolConfig>): void {
    onchange({ ...config, ...values });
  }

  function updateField(
    index: number,
    values: Partial<FormToolConfig["fields"][number]>,
  ): void {
    const fields = config.fields.map((field: FormField, fieldIndex: number) =>
      fieldIndex === index ? { ...field, ...values } : field,
    );
    update({ fields });
  }

  function addField(): void {
    update({
      fields: [
        ...config.fields,
        {
          id: crypto.randomUUID(),
          kind: "short_text",
          label: "Nova pergunta",
          description: "",
          required: false,
          options: [],
        },
      ],
    });
  }

  function removeField(index: number): void {
    update({
      fields: config.fields.filter(
        (_field: FormField, fieldIndex: number) => fieldIndex !== index,
      ),
    });
  }

  function selectionField(kind: FormFieldKind): boolean {
    return kind === "single_choice" || kind === "multi_choice";
  }
</script>

<label class="tool-field tool-field--full">
  <span>Instruções para o participante</span>
  <textarea
    rows="3"
    maxlength="1600"
    value={config.instructions}
    oninput={(event) => update({ instructions: event.currentTarget.value })}
  ></textarea>
</label>

<div class="tool-editor-heading">
  <div>
    <strong>Perguntas e conteúdo</strong><small
      >{config.fields.length} itens</small
    >
  </div>
  <button class="tool-secondary-button" type="button" onclick={addField}>
    <Plus size={15} /> Adicionar campo
  </button>
</div>

<div class="tool-stack">
  {#each config.fields as field, index (field.id)}
    <article class="tool-editor-card">
      <div class="tool-editor-card__handle"><GripVertical size={17} /></div>
      <div class="tool-editor-card__body">
        <div class="tool-grid tool-grid--2">
          <label class="tool-field">
            <span>{field.kind === "section" ? "Título" : "Pergunta"}</span>
            <input
              value={field.label}
              maxlength="240"
              required
              oninput={(event) =>
                updateField(index, { label: event.currentTarget.value })}
            />
          </label>
          <label class="tool-field">
            <span>Tipo</span>
            <select
              value={field.kind}
              onchange={(event) => {
                const kind = event.currentTarget.value as FormFieldKind;
                updateField(index, {
                  kind,
                  required: kind === "section" ? false : field.required,
                  options: selectionField(kind)
                    ? field.options.length >= 2
                      ? field.options
                      : ["Opção 1", "Opção 2"]
                    : [],
                });
              }}
            >
              {#each fieldKinds as kind}
                <option value={kind.value}>{kind.label}</option>
              {/each}
            </select>
          </label>
        </div>
        <label class="tool-field">
          <span>Descrição ou ajuda</span>
          <input
            value={field.description}
            maxlength="500"
            placeholder="Opcional"
            oninput={(event) =>
              updateField(index, { description: event.currentTarget.value })}
          />
        </label>
        {#if selectionField(field.kind)}
          <label class="tool-field">
            <span>Opções <small>uma por linha</small></span>
            <textarea
              rows="3"
              value={field.options.join("\n")}
              oninput={(event) =>
                updateField(index, {
                  options: event.currentTarget.value
                    .split("\n")
                    .map((option) => option.trim())
                    .filter(Boolean),
                })}></textarea>
          </label>
        {/if}
        {#if field.kind !== "section"}
          <label class="tool-check">
            <input
              type="checkbox"
              checked={field.required}
              onchange={(event) =>
                updateField(index, { required: event.currentTarget.checked })}
            />
            <span>Resposta obrigatória</span>
          </label>
        {/if}
      </div>
      <button
        class="tool-icon-button tool-icon-button--danger"
        type="button"
        aria-label="Remover item"
        disabled={config.fields.length === 1}
        onclick={() => removeField(index)}><Trash2 size={16} /></button
      >
    </article>
  {/each}
</div>
