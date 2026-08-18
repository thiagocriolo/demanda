<script lang="ts">
  import { Construction } from "@lucide/svelte";
  let { title, description } = $props<{ title: string; description: string }>();
</script>

<div class="settings-coming-soon">
  <Construction size={28} />
  <div>
    <strong>{title}</strong>
    <p>{description}</p>
  </div>
</div>
