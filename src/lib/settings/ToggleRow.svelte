<script lang="ts">
  let {
    label,
    description,
    checked = $bindable(),
    disabled = false,
  } = $props<{
    label: string;
    description: string;
    checked: boolean;
    disabled?: boolean;
  }>();
</script>

<label class:disabled class="settings-toggle">
  <span><strong>{label}</strong><small>{description}</small></span>
  <input type="checkbox" bind:checked {disabled} />
</label>
