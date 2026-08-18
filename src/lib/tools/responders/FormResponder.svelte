<script lang="ts">
  import type {
    FormAnswerValue,
    FormToolConfig,
    FormToolResponse,
  } from "../types";
  import { untrack } from "svelte";

  let { config, initial, pending, onsubmit } = $props<{
    config: FormToolConfig;
    initial?: FormToolResponse;
    pending: boolean;
    onsubmit: (payload: FormToolResponse) => void;
  }>();
  const seed = untrack(() => initial);
  let answers = $state<Record<string, FormAnswerValue>>(
    structuredClone(seed?.answers ?? {}),
  );

  function toggle(fieldId: string, option: string, checked: boolean): void {
    const current = Array.isArray(answers[fieldId])
      ? (answers[fieldId] as string[])
      : [];
    answers[fieldId] = checked
      ? [...current.filter((item) => item !== option), option]
      : current.filter((item) => item !== option);
  }
</script>

<form
  class="tool-response-form"
  onsubmit={(event) => {
    event.preventDefault();
    onsubmit({ kind: "form", answers });
  }}
>
  {#each config.fields as field (field.id)}
    {#if field.kind === "section"}
      <section class="tool-response-section">
        <h3>{field.label}</h3>
        {#if field.description}<p>{field.description}</p>{/if}
      </section>
    {:else}
      <fieldset class="tool-response-field">
        <legend
          >{field.label}{#if field.required}<span>*</span>{/if}</legend
        >
        {#if field.description}<p>{field.description}</p>{/if}
        {#if field.kind === "long_text"}
          <textarea
            rows="5"
            required={field.required}
            value={typeof answers[field.id] === "string"
              ? (answers[field.id] as string)
              : ""}
            oninput={(event) => (answers[field.id] = event.currentTarget.value)}
          ></textarea>
        {:else if field.kind === "single_choice"}
          <div class="tool-option-list">
            {#each field.options as option}<label
                ><input
                  type="radio"
                  name={field.id}
                  value={option}
                  required={field.required}
                  checked={answers[field.id] === option}
                  onchange={() => (answers[field.id] = option)}
                /><span>{option}</span></label
              >{/each}
          </div>
        {:else if field.kind === "multi_choice"}
          <div class="tool-option-list">
            {#each field.options as option}<label
                ><input
                  type="checkbox"
                  value={option}
                  checked={Array.isArray(answers[field.id]) &&
                    (answers[field.id] as string[]).includes(option)}
                  onchange={(event) =>
                    toggle(field.id, option, event.currentTarget.checked)}
                /><span>{option}</span></label
              >{/each}
          </div>
        {:else}
          <input
            type={field.kind === "number"
              ? "number"
              : field.kind === "date"
                ? "date"
                : "text"}
            required={field.required}
            value={answers[field.id] === null || answers[field.id] === undefined
              ? ""
              : String(answers[field.id])}
            oninput={(event) =>
              (answers[field.id] =
                field.kind === "number"
                  ? event.currentTarget.value === ""
                    ? null
                    : Number(event.currentTarget.value)
                  : event.currentTarget.value)}
          />
        {/if}
      </fieldset>
    {/if}
  {/each}
  <button
    class="tool-primary-button tool-submit-response"
    type="submit"
    disabled={pending}
    >{pending
      ? "Enviando…"
      : initial
        ? "Atualizar resposta"
        : "Enviar resposta"}</button
  >
</form>
