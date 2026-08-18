import { describe, expect, it } from "vitest";
import { cardDropBeforeId } from "./card-drop-position";

function card(id: string, top: number, left = 0): HTMLElement {
  return {
    getAttribute: (name: string) => (name === "data-card-id" ? id : null),
    getBoundingClientRect: () =>
      ({
        top,
        bottom: top + 100,
        left,
        right: left + 200,
        width: 200,
        height: 100,
        x: left,
        y: top,
        toJSON: () => undefined,
      }) as DOMRect,
  } as HTMLElement;
}

function container(cards: HTMLElement[]): HTMLElement {
  return {
    querySelectorAll: () => cards,
  } as unknown as HTMLElement;
}

describe("cardDropBeforeId", () => {
  it("moves the destination above or below vertical cards", () => {
    const column = container([card("one", 0), card("two", 110)]);
    const options = {
      cardSelector: "[data-card-id]",
      idAttribute: "data-card-id",
    };

    expect(
      cardDropBeforeId({ clientY: 20 } as DragEvent, column, options),
    ).toBe("one");
    expect(
      cardDropBeforeId({ clientY: 80 } as DragEvent, column, options),
    ).toBe("two");
    expect(
      cardDropBeforeId({ clientY: 250 } as DragEvent, column, options),
    ).toBeUndefined();
  });

  it("ignores the card being dragged", () => {
    const column = container([card("one", 0), card("two", 110)]);

    expect(
      cardDropBeforeId({ clientY: 20 } as DragEvent, column, {
        cardSelector: "[data-card-id]",
        idAttribute: "data-card-id",
        excludeId: "one",
      }),
    ).toBe("two");
  });

  it("supports the horizontal daily agenda", () => {
    const row = container([card("one", 0, 0), card("two", 0, 210)]);

    expect(
      cardDropBeforeId({ clientX: 180 } as DragEvent, row, {
        cardSelector: "[data-card-id]",
        idAttribute: "data-card-id",
        axis: "horizontal",
      }),
    ).toBe("two");
  });
});
