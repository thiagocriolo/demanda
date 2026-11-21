import type { ParamMatcher } from "@sveltejs/kit";
import { interfaceTabs } from "$lib/settings/routes";

export const match: ParamMatcher = (param) =>
  interfaceTabs.includes(param as (typeof interfaceTabs)[number]);
