import { writable } from "svelte/store";

export const DEFAULT_CARD_SCALE = 5;
export const cardScale = writable(DEFAULT_CARD_SCALE);

export function normalizeCardScale(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return DEFAULT_CARD_SCALE;
  return Math.max(1, Math.min(10, Math.round(parsed)));
}
