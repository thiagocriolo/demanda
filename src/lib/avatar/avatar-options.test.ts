import { describe, expect, it } from "vitest";
import {
  AVATAR_OPTIONS,
  avatarProfileUrl,
  avatarSource,
  normalizeAvatarId,
  parseAvatarProfileUrl,
} from "./avatar-options";

describe("avatar options", () => {
  it("expõe as 16 imagens em URLs públicas estáveis", () => {
    expect(AVATAR_OPTIONS).toHaveLength(16);
    expect(AVATAR_OPTIONS[0]).toMatchObject({
      id: "avatar-01",
      src: "/avatars/avatar-01.png",
    });
    expect(AVATAR_OPTIONS[15]).toMatchObject({
      id: "avatar-16",
      src: "/avatars/avatar-16.png",
    });
  });

  it("mantém compatibilidade com os identificadores antigos", () => {
    expect(normalizeAvatarId("avatar (4).png")).toBe("avatar-04");
    expect(normalizeAvatarId("avatar__0007_Camada-9.png")).toBe("avatar-09");
    expect(avatarSource("avatar%20(12).png")).toBe("/avatars/avatar-12.png");
  });

  it("incorpora imagem e cor na URL persistida", () => {
    expect(avatarProfileUrl("avatar-03", "#5DAC83")).toBe(
      "/avatars/avatar-03.png?bg=5DAC83",
    );
  });

  it("recupera imagem e cor da URL persistida", () => {
    expect(parseAvatarProfileUrl("/avatars/avatar-06.png?bg=A78BFA")).toEqual({
      avatarImage: "avatar-06",
      avatarColor: "#A78BFA",
    });
    expect(parseAvatarProfileUrl("/images/avatar-user.svg")).toBeNull();
    expect(
      parseAvatarProfileUrl("/avatars/avatar-99.png?bg=A78BFA"),
    ).toBeNull();
    expect(
      parseAvatarProfileUrl("/avatars/avatar-06.png?bg=invalid"),
    ).toBeNull();
  });
});
