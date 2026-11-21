import type { ParamMatcher } from "@sveltejs/kit";
import { preferenceTabs } from "$lib/settings/routes";

export const match: ParamMatcher = (param) =>
  preferenceTabs.includes(param as (typeof preferenceTabs)[number]);
