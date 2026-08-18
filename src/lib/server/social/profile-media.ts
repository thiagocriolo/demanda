import { storedFileIdFromPrivateUrl } from "../files/service";

export function publicProfileMediaUrl(url: string | null): string | null {
  if (!url) return null;
  const fileId = storedFileIdFromPrivateUrl(url);
  return fileId ? `/api/public/files/${fileId}/content` : url;
}
