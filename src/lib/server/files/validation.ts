import { extname } from "node:path";
import { z } from "zod";
import type { StoredFilePurpose } from "../db/schema";
import { IMAGE_UPLOAD_POLICY, MAX_VIDEO_UPLOAD_BYTES } from "./config";

export const MAX_PRIVATE_FILE_BYTES = IMAGE_UPLOAD_POLICY.maxUploadBytes;
export const MAX_PRIVATE_MEDIA_BYTES = MAX_VIDEO_UPLOAD_BYTES;
export const MAX_IMAGE_PIXELS = IMAGE_UPLOAD_POLICY.maxInputPixels;
export const MIN_PROFILE_IMAGE_DIMENSION = 64;

const formats = {
  jpeg: { mimeType: "image/jpeg", extensions: new Set([".jpg", ".jpeg"]) },
  png: { mimeType: "image/png", extensions: new Set([".png"]) },
  webp: { mimeType: "image/webp", extensions: new Set([".webp"]) },
} as const;

const videoFormats = {
  mp4: { mimeType: "video/mp4", extensions: new Set([".mp4"]) },
  webm: { mimeType: "video/webm", extensions: new Set([".webm"]) },
} as const;

export const storedFilePurposeSchema = z.enum(["profile_avatar", "attachment"]);

export class InvalidStoredFileError extends Error {
  readonly status = 400;

  constructor(message: string) {
    super(message);
    this.name = "InvalidStoredFileError";
  }
}

export type ValidatedImageUpload = {
  content: Uint8Array;
  purpose: StoredFilePurpose;
  originalName: string;
  inputFormat: keyof typeof formats;
  claimedMimeType: "image/jpeg" | "image/png" | "image/webp";
  originalByteSize: number;
};

export type ValidatedVideoUpload = {
  content: Uint8Array;
  purpose: "attachment";
  originalName: string;
  inputFormat: keyof typeof videoFormats;
  claimedMimeType: "video/mp4" | "video/webm";
  originalByteSize: number;
  extension: ".mp4" | ".webm";
};

function safeOriginalName(name: string): string {
  const normalized = name.trim().replace(/[\\/\u0000-\u001f\u007f]/gu, "_");
  if (!normalized)
    throw new InvalidStoredFileError("O arquivo precisa ter nome.");
  return normalized.slice(0, 255);
}

function formatFromMagicBytes(
  content: Uint8Array,
): keyof typeof formats | null {
  if (
    content.length >= 3 &&
    content[0] === 0xff &&
    content[1] === 0xd8 &&
    content[2] === 0xff
  ) {
    return "jpeg";
  }
  const pngSignature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (
    content.length >= pngSignature.length &&
    pngSignature.every((byte, index) => content[index] === byte)
  ) {
    return "png";
  }
  if (
    content.length >= 12 &&
    content[0] === 0x52 &&
    content[1] === 0x49 &&
    content[2] === 0x46 &&
    content[3] === 0x46 &&
    content[8] === 0x57 &&
    content[9] === 0x45 &&
    content[10] === 0x42 &&
    content[11] === 0x50
  ) {
    return "webp";
  }
  return null;
}

export function validateImageUploadEnvelope(input: {
  content: Uint8Array;
  purpose: StoredFilePurpose;
  originalName: string;
  claimedMimeType: string;
}): ValidatedImageUpload {
  if (input.content.byteLength === 0) {
    throw new InvalidStoredFileError("O arquivo está vazio.");
  }
  if (input.content.byteLength > MAX_PRIVATE_FILE_BYTES) {
    throw new InvalidStoredFileError("A imagem deve ter no máximo 15 MB.");
  }

  const originalName = safeOriginalName(input.originalName);
  const suppliedExtension = extname(originalName).toLowerCase();
  const inputFormat = formatFromMagicBytes(input.content);
  if (!inputFormat) {
    throw new InvalidStoredFileError(
      "Use uma imagem JPEG/JPG, PNG ou WebP válida.",
    );
  }
  const format = formats[inputFormat];
  if (!format.extensions.has(suppliedExtension)) {
    throw new InvalidStoredFileError(
      "A extensão não corresponde ao conteúdo da imagem.",
    );
  }
  if (input.claimedMimeType.toLowerCase() !== format.mimeType) {
    throw new InvalidStoredFileError(
      "O tipo MIME não corresponde ao conteúdo da imagem.",
    );
  }

  return {
    content: input.content,
    purpose: input.purpose,
    originalName,
    inputFormat,
    claimedMimeType: format.mimeType,
    originalByteSize: input.content.byteLength,
  };
}

function videoFormatFromMagicBytes(
  content: Uint8Array,
): keyof typeof videoFormats | null {
  if (
    content.length >= 12 &&
    content[4] === 0x66 &&
    content[5] === 0x74 &&
    content[6] === 0x79 &&
    content[7] === 0x70
  ) {
    const brand = String.fromCharCode(...content.slice(8, 12));
    if (new Set(["isom", "iso2", "mp41", "mp42", "avc1", "M4V "]).has(brand)) {
      return "mp4";
    }
  }
  if (
    content.length >= 4 &&
    content[0] === 0x1a &&
    content[1] === 0x45 &&
    content[2] === 0xdf &&
    content[3] === 0xa3
  ) {
    return "webm";
  }
  return null;
}

export function validateVideoUploadEnvelope(input: {
  content: Uint8Array;
  purpose: StoredFilePurpose;
  originalName: string;
  claimedMimeType: string;
}): ValidatedVideoUpload {
  if (input.purpose !== "attachment") {
    throw new InvalidStoredFileError("Vídeos só podem ser usados como anexo.");
  }
  if (input.content.byteLength === 0) {
    throw new InvalidStoredFileError("O arquivo está vazio.");
  }
  if (input.content.byteLength > MAX_VIDEO_UPLOAD_BYTES) {
    throw new InvalidStoredFileError("O vídeo deve ter no máximo 100 MB.");
  }
  const originalName = safeOriginalName(input.originalName);
  const suppliedExtension = extname(originalName).toLowerCase();
  const inputFormat = videoFormatFromMagicBytes(input.content);
  if (!inputFormat) {
    throw new InvalidStoredFileError("Use um vídeo MP4 ou WebM válido.");
  }
  const format = videoFormats[inputFormat];
  if (!format.extensions.has(suppliedExtension)) {
    throw new InvalidStoredFileError(
      "A extensão não corresponde ao conteúdo do vídeo.",
    );
  }
  if (input.claimedMimeType.toLowerCase() !== format.mimeType) {
    throw new InvalidStoredFileError(
      "O tipo MIME não corresponde ao conteúdo do vídeo.",
    );
  }
  return {
    content: input.content,
    purpose: "attachment",
    originalName,
    inputFormat,
    claimedMimeType: format.mimeType,
    originalByteSize: input.content.byteLength,
    extension: inputFormat === "mp4" ? ".mp4" : ".webm",
  };
}

/** Compatibilidade: a decodificação real ocorre no ImageProcessor. */
export const validateUploadedImage = validateImageUploadEnvelope;
