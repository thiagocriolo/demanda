<script module lang="ts">
  export type ChoiceRowOption = {
    value: string;
    label: string;
  };
</script>

<script lang="ts">
  let {
    label,
    description,
    value = $bindable(),
    options,
    disabled = false,
  } = $props<{
    label: string;
    description: string;
    value: string;
    options: ChoiceRowOption[];
    disabled?: boolean;
  }>();
</script>

<label class:disabled class="settings-choice">
  <span><strong>{label}</strong><small>{description}</small></span>
  <select class="settings-select" bind:value {disabled}>
    {#each options as option (option.value)}
      <option value={option.value}>{option.label}</option>
    {/each}
  </select>
</label>
