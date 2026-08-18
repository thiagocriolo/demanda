<script lang="ts">
  import { Inbox, Pencil, Trash2 } from "@lucide/svelte";
  import type { EntityConfig, EntityField, EntityRecord } from "./types";

  let { config, records, onedit, ondelete, oncreate } = $props<{
    config: EntityConfig;
    records: EntityRecord[];
    onedit: (record: EntityRecord) => void;
    ondelete: (record: EntityRecord) => void;
    oncreate: () => void;
  }>();

  let columns = $derived(
    config.fields.filter((field: EntityField) => field.table),
  );

  function optionFor(field: EntityField, value: string) {
    return field.options?.find((option) => option.value === value);
  }

  function displayValue(field: EntityField, value: string): string {
    if (!value) return "—";
    const option = optionFor(field, value);
    if (option) return option.label;
    if (field.format === "currency") {
      return new Intl.NumberFormat("pt-BR", {
        style: "currency",
        currency: "BRL",
      }).format(Number(value));
    }
    if (field.format === "date") {
      return new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" }).format(
        new Date(`${value}T00:00:00Z`),
      );
    }
    return value;
  }
</script>

{#if records.length}
  <div class="table-wrap">
    <table>
      <thead>
        <tr>
          {#each columns as field (field.name)}<th>{field.label}</th>{/each}
          <th><span class="sr-only">Ações</span></th>
        </tr>
      </thead>
      <tbody>
        {#each records as record (record.id)}
          <tr>
            {#each columns as field, index (field.name)}
              <td data-label={field.label}>
                {#if field.options}
                  {@const option = optionFor(field, record[field.name])}
                  <span class="status" data-tone={option?.tone ?? "gray"}>
                    {displayValue(field, record[field.name])}
                  </span>
                {:else if index === 0}
                  <strong>{displayValue(field, record[field.name])}</strong>
                {:else}
                  {displayValue(field, record[field.name])}
                {/if}
              </td>
            {/each}
            <td class="row-actions">
              <button
                type="button"
                aria-label={`Editar ${record.nome ?? config.singular}`}
                title="Editar"
                onclick={() => onedit(record)}><Pencil size={16} /></button
              >
              <button
                class="delete"
                type="button"
                aria-label={`Excluir ${record.nome ?? config.singular}`}
                title="Excluir"
                onclick={() => ondelete(record)}><Trash2 size={16} /></button
              >
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
{:else}
  <div class="empty">
    <span><Inbox size={27} /></span>
    <h2>Nenhum cadastro encontrado</h2>
    <p>Altere a busca ou adicione {config.singular} para começar.</p>
    <button type="button" onclick={oncreate}>Adicionar {config.singular}</button
    >
  </div>
{/if}

<style>
  .table-wrap {
    overflow-x: auto;
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
    background: var(--surface);
  }
  table {
    width: 100%;
    border-collapse: collapse;
  }
  th,
  td {
    padding: 14px 16px;
    border-bottom: 1px solid var(--border);
    color: var(--ink-500);
    font-size: var(--text-sm);
    text-align: left;
    white-space: nowrap;
  }
  th {
    color: var(--ink-400);
    background: var(--surface-soft);
    font-size: var(--text-xs);
    font-weight: 700;
    letter-spacing: 0.035em;
    text-transform: uppercase;
  }
  tbody tr:last-child td {
    border-bottom: 0;
  }
  tbody tr:hover {
    background: rgba(46, 86, 255, 0.025);
  }
  td strong {
    color: var(--ink-800);
    font-weight: 600;
  }
  .status {
    display: inline-flex;
    min-height: 25px;
    align-items: center;
    padding: 0 8px;
    border-radius: var(--radius-pill);
    color: var(--ink-700);
    background: var(--surface-hover);
    font-size: var(--text-xs);
    font-weight: 600;
  }
  .status[data-tone="blue"] {
    color: var(--brand-600);
    background: var(--brand-50);
  }
  .status[data-tone="green"] {
    color: #377c58;
    background: rgba(93, 172, 131, 0.12);
  }
  .status[data-tone="amber"] {
    color: #996900;
    background: rgba(234, 179, 8, 0.13);
  }
  .status[data-tone="red"] {
    color: var(--red-500);
    background: rgba(220, 38, 38, 0.09);
  }
  .status[data-tone="violet"] {
    color: var(--violet-500);
    background: rgba(124, 92, 229, 0.1);
  }
  .row-actions {
    display: flex;
    justify-content: flex-end;
    gap: 5px;
  }
  .row-actions button {
    display: grid;
    width: 32px;
    height: 32px;
    border: 1px solid transparent;
    border-radius: 8px;
    color: var(--ink-400);
    background: transparent;
    place-items: center;
  }
  .row-actions button:hover {
    border-color: var(--brand-100);
    color: var(--brand-600);
    background: var(--brand-50);
  }
  .row-actions button.delete:hover {
    border-color: rgba(220, 38, 38, 0.12);
    color: var(--red-500);
    background: rgba(220, 38, 38, 0.06);
  }
  .empty {
    display: grid;
    min-height: 310px;
    padding: 36px;
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
    background: var(--surface);
    text-align: center;
    place-content: center;
    justify-items: center;
  }
  .empty > span {
    display: grid;
    width: 54px;
    height: 54px;
    margin-bottom: 16px;
    border-radius: 15px;
    color: var(--brand-600);
    background: var(--brand-50);
    place-items: center;
  }
  .empty h2 {
    color: var(--ink-800);
    font-size: var(--text-lg);
  }
  .empty p {
    margin-top: 6px;
    color: var(--ink-500);
    font-size: var(--text-sm);
  }
  .empty button {
    min-height: 38px;
    margin-top: 17px;
    padding: 0 14px;
    border: 0;
    border-radius: 10px;
    color: white;
    background: var(--brand-600);
    font-weight: 600;
  }
  @media (max-width: 720px) {
    .table-wrap {
      overflow: visible;
      border: 0;
      background: transparent;
    }
    table,
    tbody {
      display: grid;
      gap: 10px;
    }
    thead {
      display: none;
    }
    tr {
      display: grid;
      padding: 14px;
      border: 1px solid var(--border);
      border-radius: var(--radius-lg);
      background: var(--surface);
    }
    td {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      padding: 8px 2px;
      white-space: normal;
    }
    td::before {
      color: var(--ink-400);
      content: attr(data-label);
      font-size: var(--text-xs);
      font-weight: 600;
    }
    td:first-child {
      padding-top: 2px;
      font-size: var(--text-md);
    }
    td:first-child::before {
      display: none;
    }
    .row-actions {
      justify-content: flex-end;
      padding: 10px 0 0;
      border: 0;
    }
    .row-actions::before {
      display: none;
    }
  }
</style>
