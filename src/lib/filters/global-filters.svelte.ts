import { getContext } from "svelte";
import type { StyledChoice } from "$lib/settings/types";
import type { WorkspaceUser } from "$lib/workspaces/workspace-storage";

export const GLOBAL_FILTERS_CONTEXT = Symbol("global-filters");

export class GlobalFiltersState {
  responsibleIds = $state<string[]>([]);
  businessCategoryKeys = $state<string[]>([]);
  taskCategoryKeys = $state<string[]>([]);
  users = $state<WorkspaceUser[]>([]);
  businessCategories = $state<StyledChoice[]>([]);
  taskCategories = $state<StyledChoice[]>([]);

  constructor(settings: {
    businessCategories: StyledChoice[];
    taskCategories: StyledChoice[];
  }) {
    this.setCatalogs(settings);
  }

  get activeCount(): number {
    return (
      this.responsibleIds.length +
      this.businessCategoryKeys.length +
      this.taskCategoryKeys.length
    );
  }

  setCatalogs(settings: {
    businessCategories: StyledChoice[];
    taskCategories: StyledChoice[];
  }): void {
    this.businessCategories = settings.businessCategories;
    this.taskCategories = settings.taskCategories;
  }

  setUsers(users: WorkspaceUser[]): void {
    this.users = users;
  }

  clear(): void {
    this.responsibleIds = [];
    this.businessCategoryKeys = [];
    this.taskCategoryKeys = [];
  }
}

export function useGlobalFilters(): GlobalFiltersState {
  const filters = getContext<GlobalFiltersState>(GLOBAL_FILTERS_CONTEXT);
  if (!filters) throw new Error("Global filters context is unavailable.");
  return filters;
}
