export type CardDropAxis = "horizontal" | "vertical";

type CardDropPositionOptions = {
  cardSelector: string;
  idAttribute: string;
  axis?: CardDropAxis;
  excludeId?: string | null;
};

export function cardDropBeforeId(
  event: DragEvent,
  container: HTMLElement,
  {
    cardSelector,
    idAttribute,
    axis = "vertical",
    excludeId = null,
  }: CardDropPositionOptions,
): string | undefined {
  const pointer = axis === "horizontal" ? event.clientX : event.clientY;
  const cards = Array.from(
    container.querySelectorAll<HTMLElement>(cardSelector),
  ).filter((card) => card.getAttribute(idAttribute) !== excludeId);

  for (const card of cards) {
    const bounds = card.getBoundingClientRect();
    const middle =
      axis === "horizontal"
        ? bounds.left + bounds.width / 2
        : bounds.top + bounds.height / 2;
    if (pointer < middle) return card.getAttribute(idAttribute) ?? undefined;
  }

  return undefined;
}
