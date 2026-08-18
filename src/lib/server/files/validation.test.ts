import sharp from "sharp";
import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { IMAGE_UPLOAD_POLICY } from "./config";
import { ImageProcessor } from "./image-processor";
import {
  InvalidStoredFileError,
  MAX_PRIVATE_FILE_BYTES,
  validateImageUploadEnvelope,
  validateVideoUploadEnvelope,
} from "./validation";

async function image(
  format: "png" | "jpeg" | "webp" = "png",
  width = 128,
  height = 128,
  channels: 3 | 4 = 3,
): Promise<Uint8Array> {
  return sharp({
    create: {
      width,
      height,
      channels,
      background:
        channels === 4 ? { r: 46, g: 86, b: 255, alpha: 0.4 } : "#2e56ff",
    },
  })
    [format]()
    .toBuffer();
}

function envelope(
  content: Uint8Array,
  originalName = "perfil.png",
  claimedMimeType = "image/png",
) {
  return validateImageUploadEnvelope({
    content,
    purpose: "profile_avatar",
    originalName,
    claimedMimeType,
  });
}

describe("validação de uploads de imagem", () => {
  it.each([
    ["foto.jpg", "image/jpeg"],
    ["foto.jpeg", "image/jpeg"],
  ])("aceita JPEG real com nome %s", async (name, mime) => {
    expect(envelope(await image("jpeg"), name, mime)).toMatchObject({
      inputFormat: "jpeg",
      claimedMimeType: "image/jpeg",
    });
  });

  it("aceita PNG real", async () => {
    expect(envelope(await image())).toMatchObject({ inputFormat: "png" });
  });

  it.each([
    ["foto.gif", "image/gif", new Uint8Array([0x47, 0x49, 0x46, 0x38])],
    ["foto.svg", "image/svg+xml", new TextEncoder().encode("<svg></svg>")],
  ])("rejeita formato não permitido: %s", (name, mime, content) => {
    expect(() => envelope(content, name, mime)).toThrow(InvalidStoredFileError);
  });

  it("aceita WebP real", async () => {
    const content = await image("webp");
    expect(envelope(content, "foto.webp", "image/webp")).toMatchObject({
      inputFormat: "webp",
      claimedMimeType: "image/webp",
    });
  });

  it.each([
    ["foto.jpg", "image/png", "extensão"],
    ["foto.png", "image/jpeg", "MIME"],
  ])("rejeita nome ou MIME forjado: %s", async (name, mime, message) => {
    const content = await image();
    expect(() => envelope(content, name, mime)).toThrow(message);
  });

  it("rejeita bytes falsos e arquivo acima de 15 MB", () => {
    expect(() =>
      envelope(new TextEncoder().encode("não é uma imagem")),
    ).toThrow(InvalidStoredFileError);
    expect(() => envelope(new Uint8Array(MAX_PRIVATE_FILE_BYTES + 1))).toThrow(
      "15 MB",
    );
  });
});

describe("validação de uploads de vídeo", () => {
  const validateVideo = (
    content: Uint8Array,
    originalName: string,
    claimedMimeType: string,
  ) =>
    validateVideoUploadEnvelope({
      content,
      purpose: "attachment",
      originalName,
      claimedMimeType,
    });

  it("aceita a assinatura de um MP4", () => {
    const content = new Uint8Array([
      0, 0, 0, 24, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d,
    ]);
    expect(validateVideo(content, "video.mp4", "video/mp4")).toMatchObject({
      inputFormat: "mp4",
      extension: ".mp4",
    });
  });

  it("aceita a assinatura de um WebM", () => {
    const content = new Uint8Array([0x1a, 0x45, 0xdf, 0xa3]);
    expect(validateVideo(content, "video.webm", "video/webm")).toMatchObject({
      inputFormat: "webm",
      extension: ".webm",
    });
  });

  it("rejeita formato, extensão ou MIME divergente", () => {
    const content = new Uint8Array([
      0, 0, 0, 24, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d,
    ]);
    expect(() => validateVideo(content, "video.webm", "video/mp4")).toThrow(
      "extensão",
    );
    expect(() => validateVideo(content, "video.mp4", "video/webm")).toThrow(
      "MIME",
    );
    expect(() =>
      validateVideo(new Uint8Array([1, 2, 3, 4]), "video.mp4", "video/mp4"),
    ).toThrow("MP4 ou WebM");
  });
});

describe("processamento de imagem", () => {
  it("decodifica, converte conteúdo opaco para JPEG e calcula metadados finais", async () => {
    const result = await new ImageProcessor().process(envelope(await image()));
    expect(result).toMatchObject({
      extension: ".jpg",
      mimeType: "image/jpeg",
      width: 128,
      height: 128,
      originalWidth: 128,
      originalHeight: 128,
    });
    expect(result.sha256).toMatch(/^[0-9a-f]{64}$/u);
    expect(result.byteSize).toBe(result.content.byteLength);
  });

  it("preserva PNG quando há transparência relevante", async () => {
    const result = await new ImageProcessor().process(
      envelope(await image("png", 128, 128, 4)),
    );
    expect(result.mimeType).toBe("image/png");
    expect((await sharp(result.content).metadata()).hasAlpha).toBe(true);
  });

  it("não amplia imagem pequena e preserva a proporção ao reduzir", async () => {
    const processor = new ImageProcessor();
    const small = await processor.process(
      envelope(await image("jpeg", 900, 600), "foto.jpg", "image/jpeg"),
    );
    expect([small.width, small.height]).toEqual([900, 600]);
    const large = await processor.process(
      envelope(await image("jpeg", 3_000, 5_000), "foto.jpg", "image/jpeg"),
    );
    expect(large.height).toBe(2_048);
    expect(large.width / large.height).toBeCloseTo(3 / 5, 2);
  });

  it("corrige orientação EXIF e remove os metadados na saída", async () => {
    const oriented = await sharp({
      create: { width: 120, height: 80, channels: 3, background: "#123456" },
    })
      .jpeg()
      .withMetadata({ orientation: 6 })
      .toBuffer();
    const result = await new ImageProcessor().process(
      envelope(oriented, "orientada.jpg", "image/jpeg"),
    );
    expect([result.width, result.height]).toEqual([80, 120]);
    const outputMetadata = await sharp(result.content).metadata();
    expect(outputMetadata.orientation).toBeUndefined();
    expect(outputMetadata.exif).toBeUndefined();
  });

  it("rejeita arquivo com assinatura válida mas conteúdo corrompido", async () => {
    const corrupt = new Uint8Array([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3,
    ]);
    await expect(
      new ImageProcessor().process(envelope(corrupt)),
    ).rejects.toThrow("corrompido");
  });

  it("rejeita uma imagem que ultrapassa o limite configurado de pixels antes da decodificação pesada", async () => {
    expect(IMAGE_UPLOAD_POLICY.maxInputPixels).toBe(50_000_000);
    const content = await image("png", 101, 100);
    const limited = new ImageProcessor({
      ...IMAGE_UPLOAD_POLICY,
      maxInputPixels: 10_000,
    });
    await expect(limited.process(envelope(content))).rejects.toThrow(
      "50 megapixels",
    );
  });

  it("aceita resultado real entre 700 KiB e 1 MiB sem reduzir abaixo da qualidade mínima", async () => {
    const edge = 1_150;
    const pixels = randomBytes(edge * edge * 3);
    const content = await sharp(pixels, {
      raw: { width: edge, height: edge, channels: 3 },
    })
      .jpeg({ quality: 100 })
      .toBuffer();
    const processor = new ImageProcessor({
      ...IMAGE_UPLOAD_POLICY,
      minimumJpegQuality: 85,
    });
    const result = await processor.process(
      envelope(content, "ruido.jpg", "image/jpeg"),
    );
    expect(result.byteSize).toBeGreaterThan(700 * 1_024);
    expect(result.byteSize).toBeLessThanOrEqual(1_024 * 1_024);
  });

  it("otimiza uma tentativa inicialmente acima do teto por qualidade progressiva", async () => {
    const pixels = randomBytes(512 * 512 * 3);
    const noisy = await sharp(pixels, {
      raw: { width: 512, height: 512, channels: 3 },
    })
      .jpeg({ quality: 100 })
      .toBuffer();
    const processor = new ImageProcessor({
      ...IMAGE_UPLOAD_POLICY,
      targetStoredBytes: 100_000,
      maxStoredBytes: 140_000,
    });
    const result = await processor.process(
      envelope(noisy, "ruido.jpg", "image/jpeg"),
    );
    expect(result.attempts).toBeGreaterThan(1);
    expect(result.byteSize).toBeLessThanOrEqual(140_000);
  });

  it("nunca devolve conteúdo acima do teto e falha de modo controlado", async () => {
    const strict = new ImageProcessor({
      maxUploadBytes: MAX_PRIVATE_FILE_BYTES,
      maxInputPixels: 50_000_000,
      targetStoredBytes: 1,
      maxStoredBytes: 1,
      targetMaxEdge: 2_048,
      minimumOutputEdge: 640,
      maximumProcessingAttempts: 1,
      maximumConcurrentProcessing: 2,
      minimumJpegQuality: 62,
      temporaryObjectMaxAgeMs: 1,
    });
    await expect(strict.process(envelope(await image()))).rejects.toThrow(
      "1 MB",
    );
  });
});
