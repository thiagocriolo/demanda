import { createHash } from "node:crypto";
import sharp, { type Metadata } from "sharp";
import { IMAGE_UPLOAD_POLICY, type ImageUploadPolicy } from "./config";
import {
  InvalidStoredFileError,
  MIN_PROFILE_IMAGE_DIMENSION,
  type ValidatedImageUpload,
} from "./validation";

export type ProcessedImage = {
  content: Uint8Array;
  extension: ".jpg" | ".png";
  mimeType: "image/jpeg" | "image/png";
  byteSize: number;
  width: number;
  height: number;
  originalWidth: number;
  originalHeight: number;
  sha256: string;
  attempts: number;
};

type OutputFormat = "jpeg" | "png";

let activeProcessing = 0;
const processingWaiters: Array<() => void> = [];

async function acquireProcessingSlot(): Promise<void> {
  if (activeProcessing < IMAGE_UPLOAD_POLICY.maximumConcurrentProcessing) {
    activeProcessing += 1;
    return;
  }
  await new Promise<void>((resolve) => processingWaiters.push(resolve));
}

function releaseProcessingSlot(): void {
  const next = processingWaiters.shift();
  if (next) next();
  else activeProcessing -= 1;
}

export class ImageProcessingError extends InvalidStoredFileError {
  constructor(message: string) {
    super(message);
    this.name = "ImageProcessingError";
  }
}

function dimensions(metadata: Metadata): { width: number; height: number } {
  const width = metadata.width ?? 0;
  const height = metadata.height ?? 0;
  if (width <= 0 || height <= 0) {
    throw new ImageProcessingError(
      "Não foi possível ler as dimensões da imagem.",
    );
  }
  return { width, height };
}

function edgeCandidates(
  maxInputEdge: number,
  policy: ImageUploadPolicy,
): number[] {
  const configured = [
    policy.targetMaxEdge,
    1_920,
    1_800,
    1_600,
    1_440,
    1_280,
    1_024,
    896,
    768,
    policy.minimumOutputEdge,
  ];
  return [
    ...new Set(
      configured
        .map((edge) => Math.min(edge, maxInputEdge))
        .filter((edge) => edge > 0),
    ),
  ].sort((a, b) => b - a);
}

async function encode(
  content: Uint8Array,
  format: OutputFormat,
  maxEdge: number,
  quality: number | null,
  policy: ImageUploadPolicy,
): Promise<Buffer> {
  let pipeline = sharp(content, {
    failOn: "error",
    limitInputPixels: policy.maxInputPixels,
  })
    .rotate()
    .resize({
      width: maxEdge,
      height: maxEdge,
      fit: "inside",
      withoutEnlargement: true,
    });

  if (format === "jpeg") {
    pipeline = pipeline.jpeg({
      quality: quality ?? 85,
      mozjpeg: true,
      chromaSubsampling: "4:2:0",
    });
  } else {
    pipeline = pipeline.png(
      quality === null
        ? { compressionLevel: 9, adaptiveFiltering: true, effort: 10 }
        : {
            compressionLevel: 9,
            adaptiveFiltering: true,
            effort: 10,
            palette: true,
            quality,
          },
    );
  }
  // Sharp removes metadata by default when withMetadata/keepMetadata is not used.
  return pipeline.toBuffer();
}

export class ImageProcessor {
  constructor(
    private readonly policy: ImageUploadPolicy = IMAGE_UPLOAD_POLICY,
  ) {}

  async process(input: ValidatedImageUpload): Promise<ProcessedImage> {
    await acquireProcessingSlot();
    try {
      return await this.processWithSlot(input);
    } finally {
      releaseProcessingSlot();
    }
  }

  private async processWithSlot(
    input: ValidatedImageUpload,
  ): Promise<ProcessedImage> {
    let metadata: Metadata;
    try {
      metadata = await sharp(input.content, {
        failOn: "error",
        // metadata() only parses headers; pixel count is checked before decode.
        limitInputPixels: false,
      }).metadata();
      if (metadata.format !== input.inputFormat) {
        throw new ImageProcessingError(
          "A assinatura e o formato decodificado da imagem não correspondem.",
        );
      }
    } catch (cause) {
      if (cause instanceof InvalidStoredFileError) throw cause;
      throw new ImageProcessingError(
        "O conteúdo enviado está corrompido ou não é uma imagem válida.",
      );
    }

    const original = dimensions(metadata);
    if (original.width * original.height > this.policy.maxInputPixels) {
      throw new ImageProcessingError(
        "A imagem deve ter no máximo 50 megapixels.",
      );
    }
    if (
      input.purpose === "profile_avatar" &&
      (original.width < MIN_PROFILE_IMAGE_DIMENSION ||
        original.height < MIN_PROFILE_IMAGE_DIMENSION)
    ) {
      throw new ImageProcessingError(
        "A foto deve ter pelo menos 64 × 64 pixels.",
      );
    }

    let opaque: boolean;
    try {
      opaque = (
        await sharp(input.content, {
          failOn: "error",
          limitInputPixels: this.policy.maxInputPixels,
        }).stats()
      ).isOpaque;
    } catch {
      throw new ImageProcessingError(
        "O conteúdo enviado está corrompido ou não é uma imagem válida.",
      );
    }

    const format: OutputFormat = opaque ? "jpeg" : "png";
    const qualities =
      format === "jpeg"
        ? [...new Set([85, 82, 78, 74, 70, 66, 62])].filter(
            (quality) => quality >= this.policy.minimumJpegQuality,
          )
        : [null, 95, 90, 85, 80, 75];
    let attempts = 0;
    let acceptable: Buffer | null = null;

    for (const edge of edgeCandidates(
      Math.max(original.width, original.height),
      this.policy,
    )) {
      for (const quality of qualities) {
        attempts += 1;
        if (attempts > this.policy.maximumProcessingAttempts) break;
        let candidate: Buffer;
        try {
          candidate = await encode(
            input.content,
            format,
            edge,
            quality,
            this.policy,
          );
        } catch {
          throw new ImageProcessingError(
            "O conteúdo enviado está corrompido ou não pôde ser processado.",
          );
        }
        if (candidate.byteLength <= this.policy.targetStoredBytes) {
          return this.result(candidate, format, original, attempts);
        }
        if (candidate.byteLength <= this.policy.maxStoredBytes) {
          acceptable = candidate;
          const targetQualityFloor = format === "jpeg" ? 78 : 90;
          if (quality !== null && quality <= targetQualityFloor) {
            return this.result(acceptable, format, original, attempts);
          }
        }
      }
      if (acceptable)
        return this.result(acceptable, format, original, attempts);
      if (attempts >= this.policy.maximumProcessingAttempts) break;
    }

    throw new ImageProcessingError(
      "Não foi possível gerar uma imagem com no máximo 1 MB sem ultrapassar os limites de qualidade.",
    );
  }

  private async result(
    content: Buffer,
    format: OutputFormat,
    original: { width: number; height: number },
    attempts: number,
  ): Promise<ProcessedImage> {
    if (content.byteLength > this.policy.maxStoredBytes) {
      throw new ImageProcessingError(
        "A imagem processada ultrapassou o teto de 1 MB.",
      );
    }
    const output = dimensions(await sharp(content).metadata());
    return {
      content: Uint8Array.from(content),
      extension: format === "jpeg" ? ".jpg" : ".png",
      mimeType: format === "jpeg" ? "image/jpeg" : "image/png",
      byteSize: content.byteLength,
      width: output.width,
      height: output.height,
      originalWidth: original.width,
      originalHeight: original.height,
      sha256: createHash("sha256").update(content).digest("hex"),
      attempts,
    };
  }
}
