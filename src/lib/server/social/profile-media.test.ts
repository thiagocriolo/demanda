import { describe, expect, it } from "vitest";
import { publicProfileMediaUrl } from "./profile-media";

describe("publicProfileMediaUrl", () => {
  it("troca a rota privada pela rota pública do mesmo arquivo", () => {
    const id = "246c5e3a-4dad-4fb2-9f04-3f6f1ac78a22";

    expect(publicProfileMediaUrl(`/api/files/${id}/content`)).toBe(
      `/api/public/files/${id}/content`,
    );
  });

  it("preserva URLs externas e valores vazios", () => {
    expect(publicProfileMediaUrl("https://cdn.example.test/image.jpg")).toBe(
      "https://cdn.example.test/image.jpg",
    );
    expect(publicProfileMediaUrl(null)).toBeNull();
  });
});
