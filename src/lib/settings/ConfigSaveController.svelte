<script lang="ts">
  import { getContext, onMount } from "svelte";
  import {
    CONFIG_SAVE_CONTEXT,
    type ConfigSaveContext,
    type ConfigSaveRegistration,
  } from "./config-save";

  let { dirty, onsave } = $props<{
    dirty: boolean;
    onsave: () => void | Promise<void>;
  }>();

  const context = getContext<ConfigSaveContext>(CONFIG_SAVE_CONTEXT);
  let registration: ConfigSaveRegistration | undefined;

  onMount(() => {
    registration = context.register(onsave);
    registration.setDirty(dirty);

    return () => registration?.unregister();
  });

  $effect(() => {
    registration?.setDirty(dirty);
  });
</script>
