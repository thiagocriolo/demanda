export const KIBIBYTE = 1024;
export const MEBIBYTE = 1024 * KIBIBYTE;
export const MAX_VIDEO_UPLOAD_BYTES = 100 * MEBIBYTE;

export type ImageUploadPolicy = Readonly<{
  maxUploadBytes: number;
  maxInputPixels: number;
  targetStoredBytes: number;
  maxStoredBytes: number;
  targetMaxEdge: number;
  minimumOutputEdge: number;
  maximumProcessingAttempts: number;
  maximumConcurrentProcessing: number;
  minimumJpegQuality: number;
  temporaryObjectMaxAgeMs: number;
}>;

export const IMAGE_UPLOAD_POLICY: ImageUploadPolicy = Object.freeze({
  maxUploadBytes: 15 * MEBIBYTE,
  maxInputPixels: 50_000_000,
  targetStoredBytes: 700 * KIBIBYTE,
  maxStoredBytes: MEBIBYTE,
  targetMaxEdge: 2_048,
  minimumOutputEdge: 640,
  maximumProcessingAttempts: 40,
  maximumConcurrentProcessing: 2,
  minimumJpegQuality: 62,
  temporaryObjectMaxAgeMs: 24 * 60 * 60 * 1_000,
});
