import { getContext } from "svelte";
import type { StyledChoice } from "$lib/settings/types";
import type { WorkspaceUser } from "$lib/workspaces/workspace-storage";

export const GLOBAL_FILTERS_CONTEXT = Symbol("global-filters");

export class GlobalFiltersState {
  responsibleIds = $state<string[]>([]);
  businessCategoryKeys = $state<string[]>([]);
  deliveryCategoryKeys = $state<string[]>([]);
  users = $state<WorkspaceUser[]>([]);
  businessCategories = $state<StyledChoice[]>([]);
  deliveryCategories = $state<StyledChoice[]>([]);

  constructor(settings: {
    businessCategories: StyledChoice[];
    deliveryCategories: StyledChoice[];
  }) {
    this.setCatalogs(settings);
  }

  get activeCount(): number {
    return (
      this.responsibleIds.length +
      this.businessCategoryKeys.length +
      this.deliveryCategoryKeys.length
    );
  }

  setCatalogs(settings: {
    businessCategories: StyledChoice[];
    deliveryCategories: StyledChoice[];
  }): void {
    this.businessCategories = settings.businessCategories;
    this.deliveryCategories = settings.deliveryCategories;
  }

  setUsers(users: WorkspaceUser[]): void {
    this.users = users;
  }

  clear(): void {
    this.responsibleIds = [];
    this.businessCategoryKeys = [];
    this.deliveryCategoryKeys = [];
  }
}

export function useGlobalFilters(): GlobalFiltersState {
  const filters = getContext<GlobalFiltersState>(GLOBAL_FILTERS_CONTEXT);
  if (!filters) throw new Error("Global filters context is unavailable.");
  return filters;
}
