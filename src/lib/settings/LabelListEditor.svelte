<script lang="ts">
  import IconColorPicker from "$lib/ui/IconColorPicker.svelte";
  import { colorOptions, type ColorOption } from "$lib/ui/icon-color";
  import { Plus, Trash2 } from "@lucide/svelte";
  import { labelIconOptions } from "./label-icon-options";
  import type { StyledChoice } from "./types";

  let {
    items = $bindable(),
    fixed = false,
    levelMode = false,
    max = 30,
    lockedKey = "",
    showColor = true,
    colors = [],
    useIconColorPicker = false,
    showHeader = true,
  } = $props<{
    items: StyledChoice[];
    fixed?: boolean;
    levelMode?: boolean;
    max?: number;
    lockedKey?: string;
    showColor?: boolean;
    colors?: string[];
    useIconColorPicker?: boolean;
    showHeader?: boolean;
  }>();

  function pickerColors(currentColor: string): ColorOption[] {
    const matchingOption = colorOptions.find(
      (option) => option.color.toLowerCase() === currentColor.toLowerCase(),
    );
    if (matchingOption) {
      return colorOptions.map(({ label, color }) => ({
        value: color === matchingOption.color ? currentColor : color,
        label,
        color,
      }));
    }

    const options: ColorOption[] = [];
    const seen = new Set<string>();
    const add = (option: ColorOption): void => {
      const key = option.color.toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);
      options.push(option);
    };

    add({
      value: currentColor,
      label: "Cor atual",
      color: currentColor,
    });
    colorOptions.forEach(({ label, color }) =>
      add({ value: color, label, color }),
    );
    return options.slice(0, 16);
  }

  function addItem(): void {
    if (fixed || items.length >= max) return;
    items = [
      ...items,
      {
        key: `item-${Date.now()}`,
        label: "Novo rótulo",
        icon: "tag",
        color: "#2E56FF",
      },
    ];
  }

  function removeItem(index: number): void {
    if (fixed || items[index]?.key === lockedKey) return;
    items = items.filter(
      (_: StyledChoice, itemIndex: number) => itemIndex !== index,
    );
  }
</script>

{#if showHeader}
  <div class="settings-list-head">
    <p>{items.length}{fixed ? " itens fixos" : ` de ${max} itens`}</p>
    {#if !fixed}
      <button
        class="settings-button"
        type="button"
        disabled={items.length >= max}
        onclick={addItem}
      >
        <Plus size={16} />Adicionar
      </button>
    {/if}
  </div>
{/if}

<div class="settings-list">
  {#each items as item, index (item.key)}
    <div
      class:level-row={levelMode}
      class:with-color={levelMode && showColor}
      class:picker-row={!levelMode && useIconColorPicker}
      class="settings-list-row"
    >
      <span class="position"
        >{levelMode ? `Nível ${index + 1}` : index + 1}</span
      >
      {#if levelMode}
        <input
          class="settings-input"
          maxlength="80"
          aria-label={`Nome do nível ${index + 1}`}
          bind:value={item.label}
        />
        <div class="icon-field">
          <IconColorPicker
            icons={labelIconOptions}
            bind:selectedIcon={item.icon}
            showColorControl={false}
            accentColor={showColor ? (colors[index] ?? item.color) : ""}
            neutralIcon={!showColor}
            size="field"
            iconAriaLabel={`Escolher ícone do nível ${index + 1}`}
          />
        </div>
      {:else}
        <input
          class="settings-input"
          maxlength="80"
          aria-label={`Rótulo ${index + 1}`}
          bind:value={item.label}
        />
        {#if useIconColorPicker}
          <div class="icon-color-field">
            <IconColorPicker
              icons={labelIconOptions}
              colors={pickerColors(item.color)}
              bind:selectedIcon={item.icon}
              bind:selectedColor={item.color}
              showColorControl={showColor}
              neutralIcon={!showColor}
              size="field"
              iconAriaLabel={`Escolher ícone de ${item.label}`}
            />
          </div>
        {:else}
          <label class="settings-field icon-field">
            Ícone
            <select class="settings-select" bind:value={item.icon}>
              {#each labelIconOptions as icon}<option value={icon.value}
                  >{icon.value}</option
                >{/each}
            </select>
          </label>
        {/if}
      {/if}
      {#if showColor && !useIconColorPicker}
        <label class="settings-field">
          <span class="sr-only">Cor</span>
          <input class="settings-input" type="color" bind:value={item.color} />
        </label>
      {/if}
      {#if !fixed}
        <button
          class="settings-button remove"
          type="button"
          disabled={item.key === lockedKey}
          aria-label={`Excluir ${item.label}`}
          title={item.key === lockedKey ? "Rótulo obrigatório" : "Excluir"}
          onclick={() => removeItem(index)}><Trash2 size={16} /></button
        >
      {/if}
    </div>
  {/each}
</div>

<style>
  .settings-list-row {
    background: transparent;
  }
  .settings-list-row:not(.level-row) .position {
    width: 42px;
    height: 42px;
  }
  .settings-list-row.level-row {
    grid-template-columns: minmax(74px, auto) minmax(0, 1fr) 42px;
    align-items: center;
  }
  .settings-list-row.level-row.with-color {
    grid-template-columns: minmax(74px, auto) minmax(0, 1fr) 42px 42px;
  }
  .settings-list-row.level-row .position {
    width: auto;
    min-width: 74px;
    height: 42px;
    padding-inline: 10px;
    white-space: nowrap;
  }
  .settings-list-row.level-row .icon-field {
    grid-column: auto;
    width: 42px;
    height: 42px;
  }
  .settings-list-row.picker-row {
    grid-template-columns: 42px minmax(140px, 1fr) auto 40px;
  }
  .icon-color-field {
    align-self: end;
  }

  @media (max-width: 760px) {
    .settings-list-row.picker-row {
      grid-template-columns: 42px minmax(0, 1fr) 40px;
    }
    .settings-list-row.picker-row .icon-color-field {
      grid-column: 2 / -1;
      grid-row: 2;
    }
    .settings-list-row.picker-row .remove {
      grid-column: 3;
      grid-row: 1;
    }
  }

  @media (min-width: 521px) and (max-width: 760px) {
    .settings-list-row.picker-row .icon-color-field :global(.icon-popover) {
      right: auto;
      left: 0;
    }
    .settings-list-row.picker-row .icon-color-field :global(.color-popover) {
      right: auto;
      left: 0;
    }
  }
</style>
