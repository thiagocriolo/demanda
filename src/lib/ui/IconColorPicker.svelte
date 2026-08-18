<script lang="ts">
  import { Check } from "@lucide/svelte";
  import {
    colorOptions,
    iconOptions,
    type ColorOption,
    type IconOption,
  } from "$lib/ui/icon-color";
  import { tick } from "svelte";

  let {
    icons = iconOptions,
    colors = colorOptions,
    selectedIcon = $bindable("briefcase-business"),
    selectedColor = $bindable("blue"),
    showColorControl = true,
    accentColor = "",
    size = "default",
    iconAriaLabel = "Escolher ícone",
    neutralIcon = false,
    disabled = false,
  } = $props<{
    icons?: IconOption[];
    colors?: ColorOption[];
    selectedIcon?: string;
    selectedColor?: string;
    showColorControl?: boolean;
    accentColor?: string;
    size?: "default" | "field";
    iconAriaLabel?: string;
    neutralIcon?: boolean;
    disabled?: boolean;
  }>();

  let iconOpen = $state(false);
  let colorOpen = $state(false);
  let pickerElement = $state<HTMLDivElement>();
  let iconTriggerElement = $state<HTMLButtonElement>();
  let colorTriggerElement = $state<HTMLButtonElement>();
  let iconPopoverElement = $state<HTMLDivElement>();
  let colorPopoverElement = $state<HTMLDivElement>();
  let CurrentIcon = $derived(
    icons.find((item: IconOption) => item.value === selectedIcon)?.icon ??
      icons[0]?.icon,
  );
  let currentColor = $derived(
    accentColor ||
      (colors.find((item: ColorOption) => item.value === selectedColor)
        ?.color ??
        colors[0]?.color ??
        "#2e56ff"),
  );

  function focusSelectedOption(popover: HTMLDivElement | undefined): void {
    const option =
      popover?.querySelector<HTMLButtonElement>('[aria-pressed="true"]') ??
      popover?.querySelector<HTMLButtonElement>("button");
    option?.focus();
  }

  async function toggleIcon(): Promise<void> {
    if (disabled) return;
    iconOpen = !iconOpen;
    colorOpen = false;
    if (iconOpen) {
      await tick();
      focusSelectedOption(iconPopoverElement);
    }
  }

  async function toggleColor(): Promise<void> {
    if (disabled) return;
    colorOpen = !colorOpen;
    iconOpen = false;
    if (colorOpen) {
      await tick();
      focusSelectedOption(colorPopoverElement);
    }
  }

  function closeOnOutside(event: PointerEvent): void {
    if (!pickerElement?.contains(event.target as Node)) {
      iconOpen = false;
      colorOpen = false;
    }
  }

  function closeOnEscape(event: KeyboardEvent): void {
    if (event.key === "Escape") {
      const returnToIcon = iconOpen;
      const returnToColor = colorOpen;
      iconOpen = false;
      colorOpen = false;
      if (returnToIcon) iconTriggerElement?.focus();
      if (returnToColor) colorTriggerElement?.focus();
    }
  }

  function closeOnFocusOut(event: FocusEvent): void {
    const nextTarget = event.relatedTarget as Node | null;
    if (!nextTarget || !pickerElement?.contains(nextTarget)) {
      iconOpen = false;
      colorOpen = false;
    }
  }
</script>

<svelte:window onpointerdown={closeOnOutside} onkeydown={closeOnEscape} />

<div
  class:field-size={size === "field"}
  class:open={iconOpen || colorOpen}
  class="picker"
  bind:this={pickerElement}
  onfocusout={closeOnFocusOut}
>
  <div class="choice">
    <button
      type="button"
      class="trigger icon-trigger"
      class:neutral={neutralIcon}
      style={`--choice:${currentColor}`}
      aria-label={iconAriaLabel}
      aria-expanded={iconOpen}
      aria-haspopup="dialog"
      {disabled}
      bind:this={iconTriggerElement}
      onclick={toggleIcon}
    >
      {#if CurrentIcon}<CurrentIcon size={20} strokeWidth={1.9} />{/if}
    </button>

    {#if iconOpen}
      <div
        class="popover icon-popover"
        role="dialog"
        aria-label="Ícones"
        bind:this={iconPopoverElement}
      >
        <div class="icon-grid">
          {#each icons.slice(0, 36) as item (item.value)}
            {@const ItemIcon = item.icon}
            <button
              type="button"
              class:active={selectedIcon === item.value}
              aria-label={item.label}
              aria-pressed={selectedIcon === item.value}
              title={item.label}
              onclick={() => {
                selectedIcon = item.value;
                iconOpen = false;
                iconTriggerElement?.focus();
              }}
            >
              <ItemIcon size={18} strokeWidth={1.9} />
            </button>
          {/each}
        </div>
      </div>
    {/if}
  </div>

  {#if showColorControl}
    <div class="choice">
      <button
        type="button"
        class="trigger color-trigger"
        style={`--choice:${currentColor}`}
        aria-label="Escolher cor"
        aria-expanded={colorOpen}
        aria-haspopup="dialog"
        {disabled}
        bind:this={colorTriggerElement}
        onclick={toggleColor}><span></span></button
      >

      {#if colorOpen}
        <div
          class="popover color-popover"
          role="dialog"
          aria-label="Cores"
          bind:this={colorPopoverElement}
        >
          <div class="color-grid">
            {#each colors.slice(0, 16) as item (item.value)}
              <button
                type="button"
                class:active={selectedColor === item.value}
                style={`--swatch:${item.color}`}
                aria-label={item.label}
                aria-pressed={selectedColor === item.value}
                title={item.label}
                onclick={() => {
                  selectedColor = item.value;
                  colorOpen = false;
                  colorTriggerElement?.focus();
                }}
              >
                <span></span>
                {#if selectedColor === item.value}<Check size={15} />{/if}
              </button>
            {/each}
          </div>
        </div>
      {/if}
    </div>
  {/if}
</div>

<style>
  .picker {
    position: relative;
    z-index: 4;
    display: flex;
    flex: 0 0 auto;
    gap: 8px;
  }

  .picker.open {
    z-index: 40;
  }

  .choice {
    position: relative;
  }

  button {
    font: inherit;
    cursor: pointer;
  }

  .trigger {
    display: grid;
    width: 46px;
    height: 46px;
    place-items: center;
    border: 1px solid var(--border);
    border-radius: 12px;
    background: var(--surface);
    transition:
      border-color 150ms ease,
      box-shadow 150ms ease,
      transform 150ms ease;
  }

  .field-size .trigger {
    width: 42px;
    height: 42px;
    border-radius: 10px;
  }

  .trigger:hover:not(:disabled) {
    border-color: var(--border-strong);
    box-shadow: var(--shadow-sm);
  }

  .trigger:active:not(:disabled) {
    transform: translateY(1px);
  }

  .trigger:focus-visible {
    outline: 0;
    box-shadow: var(
      --icon-color-picker-trigger-focus-shadow,
      var(--focus-ring)
    );
  }

  .icon-grid button:focus-visible,
  .color-grid button:focus-visible {
    outline: 0;
    box-shadow: var(--focus-ring);
  }

  .trigger:disabled {
    cursor: not-allowed;
    opacity: 0.55;
  }

  .icon-trigger {
    border-color: color-mix(in srgb, var(--choice) 24%, var(--border));
    color: var(--choice);
    background: color-mix(in srgb, var(--choice) 8%, var(--surface));
  }

  .icon-trigger.neutral {
    border-color: var(--border);
    color: var(--ink-500);
    background: var(--surface);
  }

  .color-trigger {
    border-color: transparent;
    background: var(--choice);
  }

  .color-trigger span {
    width: 100%;
    height: 100%;
  }

  .popover {
    position: absolute;
    top: calc(100% + 8px);
    z-index: 30;
    padding: 10px;
    border: 1px solid var(--border);
    border-radius: 15px;
    background: var(--surface);
    box-shadow: var(--shadow-md);
  }

  .icon-popover {
    right: 0;
    width: max-content;
  }

  .color-popover {
    right: 0;
  }

  .icon-grid {
    display: grid;
    grid-template-columns: repeat(6, 36px);
    gap: 6px;
  }

  .icon-grid button {
    display: grid;
    width: 36px;
    height: 36px;
    place-items: center;
    border: 1px solid transparent;
    border-radius: 9px;
    color: var(--ink-500);
    background: transparent;
  }

  .icon-grid button:hover {
    color: var(--ink-800);
    background: var(--surface-soft);
  }

  .icon-grid button.active {
    border-color: color-mix(in srgb, var(--brand-600) 28%, transparent);
    color: var(--brand-600);
    background: var(--brand-50);
  }

  .color-grid {
    display: grid;
    grid-template-columns: repeat(4, 34px);
    gap: 8px;
  }

  .color-grid button {
    position: relative;
    display: grid;
    width: 34px;
    height: 34px;
    place-items: center;
    overflow: hidden;
    border: 2px solid transparent;
    border-radius: 9px;
    color: white;
    background: var(--swatch);
  }

  .color-grid button:hover,
  .color-grid button.active {
    border-color: var(--surface);
    box-shadow: 0 0 0 2px var(--swatch);
  }

  .color-grid button > span {
    position: absolute;
    inset: 0;
    background: var(--swatch);
  }

  .color-grid button :global(svg) {
    position: relative;
    z-index: 1;
  }

  @media (max-width: 520px) {
    .trigger {
      width: 44px;
      height: 44px;
    }

    .icon-popover,
    .color-popover {
      position: fixed;
      top: 50%;
      right: auto;
      left: 50%;
      transform: translate(-50%, -50%);
    }
  }
</style>
