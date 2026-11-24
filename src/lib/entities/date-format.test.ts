import { describe, expect, it } from "vitest";
import {
  dateInputCaretPosition,
  formatDateForDisplay,
  formatDateInput,
  normalizeDateInput,
} from "./date-format";

describe("formatDateInput", () => {
  it("applies the dd/mm/aaaa mask progressively as digits are typed", () => {
    expect(formatDateInput("")).toBe("");
    expect(formatDateInput("2")).toBe("2");
    expect(formatDateInput("24")).toBe("24");
    expect(formatDateInput("241")).toBe("24/1");
    expect(formatDateInput("2412")).toBe("24/12");
    expect(formatDateInput("24122")).toBe("24/12/2");
    expect(formatDateInput("24122026")).toBe("24/12/2026");
  });

  it("strips non-digits and limits to 8 numeric characters", () => {
    expect(formatDateInput("2222222222")).toBe("22/22/2222");
    expect(formatDateInput("24a/12b/2026c99")).toBe("24/12/2026");
    expect(formatDateInput("abc")).toBe("");
  });

  it("converts pasted ISO dates to dd/mm/aaaa", () => {
    expect(formatDateInput("2026-12-24")).toBe("24/12/2026");
    expect(formatDateInput(" 2026-01-05 ")).toBe("05/01/2026");
  });

  it("allows deleting through slashes cleanly", () => {
    expect(formatDateInput("24/12/")).toBe("24/12");
    expect(formatDateInput("24/")).toBe("24");
  });
});

describe("dateInputCaretPosition", () => {
  it("keeps caret aligned after automatic slash insertion", () => {
    expect(dateInputCaretPosition("241", 3, "24/1")).toBe(4);
    expect(dateInputCaretPosition("24/122", 6, "24/12/2")).toBe(7);
    expect(dateInputCaretPosition("24/12/2026", 10, "24/12/2026")).toBe(10);
  });

  it("preserves caret position when editing in the middle or ignoring letters", () => {
    expect(dateInputCaretPosition("24a/12/2026", 3, "24/12/2026")).toBe(2);
    expect(dateInputCaretPosition("25/12/2026", 2, "25/12/2026")).toBe(2);
    expect(dateInputCaretPosition("24/12/", 6, "24/12")).toBe(5);
  });

  it("moves caret to the end when pasting an ISO date", () => {
    expect(dateInputCaretPosition("2026-12-24", 10, "24/12/2026")).toBe(10);
  });
});

describe("formatDateForDisplay", () => {
  it("formats ISO, compact digits, and dot-separated dates to dd/mm/aaaa", () => {
    expect(formatDateForDisplay("2026-12-24")).toBe("24/12/2026");
    expect(formatDateForDisplay("24122026")).toBe("24/12/2026");
    expect(formatDateForDisplay("24.12.2026")).toBe("24/12/2026");
    expect(formatDateForDisplay("")).toBe("");
  });
});

describe("normalizeDateInput", () => {
  it("normalizes valid Brazilian and ISO dates to ISO format", () => {
    expect(normalizeDateInput("")).toBe("");
    expect(normalizeDateInput("24/12/2026")).toBe("2026-12-24");
    expect(normalizeDateInput("24.12.2026")).toBe("2026-12-24");
    expect(normalizeDateInput("2026-12-24")).toBe("2026-12-24");
  });

  it("rejects malformed or impossible calendar dates", () => {
    expect(normalizeDateInput("22/22/2222")).toBeNull();
    expect(normalizeDateInput("31/02/2026")).toBeNull();
    expect(normalizeDateInput("24/12/20")).toBeNull();
  });
});
