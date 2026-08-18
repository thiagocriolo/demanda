import type { StoredFilePurpose, StoredFileUploadResponse } from "./types";

export class FileApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "FileApiError";
  }
}

async function responseError(response: Response): Promise<FileApiError> {
  let message = "Não foi possível processar o arquivo.";
  try {
    const payload = (await response.json()) as { message?: unknown };
    if (typeof payload.message === "string") message = payload.message;
  } catch {
    // A mensagem genérica cobre respostas sem JSON.
  }
  return new FileApiError(response.status, message);
}

export async function uploadStoredFile(
  file: File,
  purpose: StoredFilePurpose = "profile_avatar",
  fetcher: typeof fetch = fetch,
): Promise<StoredFileUploadResponse> {
  const form = new FormData();
  form.set("purpose", purpose);
  form.set("file", file);
  const response = await fetcher("/api/files", { method: "POST", body: form });
  if (!response.ok) throw await responseError(response);
  return (await response.json()) as StoredFileUploadResponse;
}

export async function uploadStoredFileWithProgress(
  file: File,
  purpose: StoredFilePurpose = "profile_avatar",
  onprogress: (progress: number) => void,
): Promise<StoredFileUploadResponse> {
  if (typeof XMLHttpRequest === "undefined") {
    const uploaded = await uploadStoredFile(file, purpose);
    onprogress(100);
    return uploaded;
  }

  const form = new FormData();
  form.set("purpose", purpose);
  form.set("file", file);

  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("POST", "/api/files");
    request.responseType = "json";
    request.upload.addEventListener("progress", (event) => {
      if (!event.lengthComputable) return;
      onprogress(Math.round((event.loaded / event.total) * 100));
    });
    request.addEventListener("load", () => {
      const payload = request.response as
        | StoredFileUploadResponse
        | { message?: unknown }
        | null;
      if (request.status >= 200 && request.status < 300 && payload && "file" in payload) {
        onprogress(100);
        resolve(payload);
        return;
      }
      const message =
        payload && "message" in payload && typeof payload.message === "string"
          ? payload.message
          : "Não foi possível processar o arquivo.";
      reject(new FileApiError(request.status, message));
    });
    request.addEventListener("error", () => {
      reject(new FileApiError(0, "Não foi possível enviar a imagem."));
    });
    request.addEventListener("abort", () => {
      reject(new FileApiError(0, "O envio da imagem foi cancelado."));
    });
    request.send(form);
  });
}

export function storedFileIdFromUrl(url: string): string | null {
  return /^\/api\/files\/([0-9a-f-]{36})\/content$/u.exec(url)?.[1] ?? null;
}

export async function deleteStoredFile(
  fileId: string,
  fetcher: typeof fetch = fetch,
): Promise<void> {
  const response = await fetcher(`/api/files/${fileId}`, { method: "DELETE" });
  if (!response.ok && response.status !== 404)
    throw await responseError(response);
}
