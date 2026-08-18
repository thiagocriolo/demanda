<script lang="ts">
  import { createMenuItems } from "$lib/entities/catalog";
  import {
    ENTITY_CREATE_CONTEXT,
    type EntityCreateContext,
  } from "$lib/entities/create-context";
  import type { EntityConfig } from "$lib/entities/types";
  import FloatingMenu, {
    type FloatingMenuItem,
  } from "$lib/ui/FloatingMenu.svelte";
  import { Plus } from "@lucide/svelte";
  import { getContext } from "svelte";

  let { collapsed = false } = $props<{ collapsed?: boolean }>();
  const entityCreator = getContext<EntityCreateContext>(ENTITY_CREATE_CONTEXT);

  function openCreateModal(item: FloatingMenuItem): void {
    entityCreator.open(item.id as EntityConfig["key"]);
  }
</script>

<FloatingMenu
  label="Adicionar"
  icon={Plus}
  items={createMenuItems}
  onselect={openCreateModal}
  placement="side"
  tone="green"
  compact={collapsed}
  fill
  iconSize={21}
/>
