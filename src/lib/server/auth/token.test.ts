import { describe, expect, it } from "vitest";
import {
  OPAQUE_TOKEN_BYTES,
  createOpaqueToken,
  hashOpaqueToken,
} from "./token";

describe("opaque tokens", () => {
  it("creates independent 256-bit base64url values", () => {
    const first = createOpaqueToken();
    const second = createOpaqueToken();

    expect(Buffer.from(first, "base64url")).toHaveLength(OPAQUE_TOKEN_BYTES);
    expect(first).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(second).not.toBe(first);
  });

  it("hashes tokens as deterministic SHA-256 hexadecimal values", () => {
    expect(hashOpaqueToken("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
    expect(hashOpaqueToken("different-token")).toMatch(/^[a-f0-9]{64}$/);
  });
});
