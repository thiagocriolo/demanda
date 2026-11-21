import type { ParamMatcher } from "@sveltejs/kit";
import { systemTabs } from "$lib/settings/routes";

export const match: ParamMatcher = (param) =>
  systemTabs.includes(param as (typeof systemTabs)[number]);
