<script module lang="ts">
  import type { LucideIcon } from "@lucide/svelte";
  import type {
    ConnectionSearchResult,
    ConnectionUserSearchResult,
  } from "$lib/server/connections/service";

  export type UserSearchResult = ConnectionSearchResult;
  export type UserSearchUser = ConnectionUserSearchResult;

  export type UserSearchAction = {
    label: string;
    icon?: LucideIcon;
    disabled?: boolean;
    busy?: boolean;
  };
</script>

<script lang="ts">
  import { Search } from "@lucide/svelte";
  import { searchPeople } from "$lib/connections/client";
  import GlobalSelector, {
    type GlobalSelectorDropdownPosition,
    type GlobalSelectorItem,
  } from "$lib/ui/GlobalSelector.svelte";

  let {
    selected = $bindable([]),
    query = $bindable(""),
    label,
    placeholder = "@usuário ou e-mail",
    emptyMessage = "Nenhuma pessoa encontrada.",
    selection = "multiple",
    display = "social",
    allowEmailInvites = false,
    disabled = false,
    dropdownPosition = "below",
    maxResults = 3,
    debounceMs = 300,
    icon = Search,
    searcher = defaultSearch,
    actionFor,
    onaction,
    onselectedchange,
    onerror,
  }: {
    selected?: GlobalSelectorItem[];
    query?: string;
    label: string;
    placeholder?: string;
    emptyMessage?: string;
    selection?: "multiple" | "action";
    display?: "workspace" | "social";
    allowEmailInvites?: boolean;
    disabled?: boolean;
    dropdownPosition?: GlobalSelectorDropdownPosition;
    maxResults?: number;
    debounceMs?: number;
    icon?: LucideIcon;
    searcher?: (
      query: string,
      signal: AbortSignal,
    ) => Promise<UserSearchResult[]>;
    actionFor?: (user: UserSearchUser) => UserSearchAction;
    onaction?: (user: UserSearchUser) => void;
    onselectedchange?: (selected: GlobalSelectorItem[]) => void;
    onerror?: (message: string) => void;
  } = $props();

  let results = $state<UserSearchResult[]>([]);
  let loading = $state(false);
  let sequence = 0;

  let items = $derived(
    results.flatMap((result): GlobalSelectorItem[] => {
      if (result.kind === "invite") {
        return allowEmailInvites
          ? [
              {
                id: result.id,
                label: result.email,
                description: "Convite por e-mail",
                email: result.email,
                pending: true,
              },
            ]
          : [];
      }

      const action = actionFor?.(result);
      return [
        {
          id: result.id,
          label: display === "workspace" ? `@${result.username}` : result.name,
          description:
            display === "workspace"
              ? `${result.name} · ${result.email}`
              : `@${result.username}`,
          email: result.email,
          avatarUrl: result.avatarUrl ?? undefined,
          actionLabel: action?.label,
          actionIcon: action?.icon,
          actionDisabled: action?.disabled,
          actionBusy: action?.busy,
        },
      ];
    }),
  );

  $effect(() => {
    const value = query.trim();
    const currentSequence = ++sequence;
    const controller = new AbortController();

    results = [];
    if (!value || disabled) {
      loading = false;
      return;
    }

    loading = true;
    const timeout = window.setTimeout(async () => {
      try {
        const found = await searcher(value, controller.signal);
        if (currentSequence === sequence) results = found;
      } catch (cause) {
        if (controller.signal.aborted || currentSequence !== sequence) return;
        results = [];
        onerror?.(
          cause instanceof Error
            ? cause.message
            : "Não foi possível buscar pessoas.",
        );
      } finally {
        if (!controller.signal.aborted && currentSequence === sequence) {
          loading = false;
        }
      }
    }, debounceMs);

    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  });

  function handleAction(item: GlobalSelectorItem): void {
    const result = results.find(
      (candidate): candidate is UserSearchUser =>
        candidate.kind === "user" && candidate.id === item.id,
    );
    if (result) onaction?.(result);
  }

  function defaultSearch(
    value: string,
    signal: AbortSignal,
  ): Promise<UserSearchResult[]> {
    return searchPeople(value, fetch, signal);
  }

  function handleQueryChange(value: string): void {
    query = value;
    if (value.trim()) onerror?.("");
  }
</script>

<div class="user-search" class:user-search--social={display === "social"}>
  <GlobalSelector
    {items}
    bind:selected
    {label}
    {placeholder}
    {emptyMessage}
    {selection}
    presentation="search"
    {dropdownPosition}
    {maxResults}
    compactEmpty
    preserveItemOrder
    showInitials
    showLabel={false}
    showHelper={false}
    {disabled}
    {loading}
    controlIcon={icon}
    onquerychange={handleQueryChange}
    onselectedchange={(value) => onselectedchange?.(value)}
    onitemaction={handleAction}
  />
</div>
