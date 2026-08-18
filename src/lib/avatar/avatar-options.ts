export type AvatarOption = {
  id: string;
  src: string;
  label: string;
};

export const AVATAR_OPTIONS: AvatarOption[] = Array.from(
  { length: 16 },
  (_, index) => {
    const number = index + 1;
    const suffix = String(number).padStart(2, "0");
    return {
      id: `avatar-${suffix}`,
      src: `/avatars/avatar-${suffix}.png`,
      label: `Avatar ${number}`,
    };
  },
);

export const AVATAR_COLORS = [
  "#2E56FF",
  "#5DAC83",
  "#F4A261",
  "#E76F51",
  "#8B5CF6",
  "#EC4899",
  "#0EA5E9",
  "#14B8A6",
  "#84CC16",
  "#EAB308",
  "#F97316",
  "#EF4444",
  "#64748B",
  "#334155",
  "#A78BFA",
  "#F2C6DE",
] as const;

export const DEFAULT_AVATAR_ID = "avatar-08";
export const DEFAULT_AVATAR_COLOR = AVATAR_COLORS[0];

function avatarNumber(value: string): number | null {
  let decoded = value;
  try {
    decoded = decodeURIComponent(value);
  } catch {
    // Mantém o valor original caso ele não seja uma URI válida.
  }

  const current = decoded.match(/avatar-(\d{1,2})(?:\.png)?(?:[?#].*)?$/i);
  const renamed = decoded.match(/avatar \((\d{1,2})\)\.png(?:[?#].*)?$/i);
  const legacy = decoded.match(/Camada-(\d{1,2})\.png(?:[?#].*)?$/i);
  const number = Number(current?.[1] ?? renamed?.[1] ?? legacy?.[1]);
  return Number.isInteger(number) && number >= 1 && number <= 16
    ? number
    : null;
}

export function normalizeAvatarId(value: string): string {
  const number = avatarNumber(value);
  return number
    ? `avatar-${String(number).padStart(2, "0")}`
    : DEFAULT_AVATAR_ID;
}

export function isAvatarId(value: string): boolean {
  return AVATAR_OPTIONS.some((avatar) => avatar.id === value);
}

export function isAvatarColor(
  value: string,
): value is (typeof AVATAR_COLORS)[number] {
  return AVATAR_COLORS.some((color) => color === value.toUpperCase());
}

export function avatarSource(id: string): string {
  const normalizedId = normalizeAvatarId(id);
  return (
    AVATAR_OPTIONS.find((avatar) => avatar.id === normalizedId)?.src ??
    "/images/avatar-user.svg"
  );
}

/** URL persistida no usuário. O parâmetro mantém a cor junto da imagem. */
export function avatarProfileUrl(image: string, color: string): string {
  const safeColor = isAvatarColor(color) ? color.slice(1) : "2E56FF";
  return `${avatarSource(image)}?bg=${safeColor}`;
}

/** Recupera a imagem e a cor de uma URL de avatar persistida no usuário. */
export function parseAvatarProfileUrl(
  value: string,
): { avatarImage: string; avatarColor: string } | null {
  if (!value) return null;

  try {
    const url = new URL(value, "http://demanda.local");
    const number = avatarNumber(url.pathname);
    const color = `#${url.searchParams.get("bg") ?? ""}`.toUpperCase();
    if (!number || !isAvatarColor(color)) return null;

    return {
      avatarImage: `avatar-${String(number).padStart(2, "0")}`,
      avatarColor: color,
    };
  } catch {
    return null;
  }
}

export function randomAvatar(): { avatarImage: string; avatarColor: string } {
  const option =
    AVATAR_OPTIONS[Math.floor(Math.random() * AVATAR_OPTIONS.length)];
  const color = AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)];

  return {
    avatarImage: option?.id ?? DEFAULT_AVATAR_ID,
    avatarColor: color,
  };
}
