import { z } from "zod";

const databaseUrl = z
  .string()
  .min(1)
  .superRefine((value, context) => {
    try {
      const parsed = new URL(value);
      if (!["postgres:", "postgresql:"].includes(parsed.protocol)) {
        context.addIssue({
          code: "custom",
          message: "deve usar o protocolo postgres ou postgresql",
        });
      }
      if (!parsed.hostname || !parsed.pathname || parsed.pathname === "/") {
        context.addIssue({
          code: "custom",
          message: "deve informar host e banco",
        });
      }
    } catch {
      context.addIssue({
        code: "custom",
        message: "deve ser uma URL PostgreSQL válida",
      });
    }
  });

const integerFromEnvironment = (fallback: number, maximum: number) =>
  z.preprocess(
    (value) => (value === undefined || value === "" ? fallback : value),
    z.coerce.number().int().positive().max(maximum),
  );

const applicationOrigin = z.preprocess(
  (value) =>
    value === undefined || value === "" ? "http://localhost:5190" : value,
  z
    .string()
    .url()
    .superRefine((value, context) => {
      const parsed = new URL(value);
      if (!["http:", "https:"].includes(parsed.protocol)) {
        context.addIssue({
          code: "custom",
          message: "deve usar HTTP ou HTTPS",
        });
      }
      if (parsed.origin !== value.replace(/\/$/, "")) {
        context.addIssue({
          code: "custom",
          message: "deve conter somente a origem, sem caminho ou credenciais",
        });
      }
    }),
);

const optionalEnvironmentValue = z.preprocess(
  (value) => (value === "" ? undefined : value),
  z.string().min(1).optional(),
);

const optionalHttpUrl = z.preprocess(
  (value) => (value === "" ? undefined : value),
  z
    .string()
    .url()
    .refine((value) => ["http:", "https:"].includes(new URL(value).protocol))
    .optional(),
);

export const serverEnvironmentSchema = z
  .object({
    DATABASE_URL: databaseUrl,
    APP_ORIGIN: applicationOrigin.transform((value) =>
      value.replace(/\/$/, ""),
    ),
    DATABASE_POOL_MAX: integerFromEnvironment(10, 50),
    DATABASE_CONNECT_TIMEOUT_MS: integerFromEnvironment(5_000, 60_000),
    DATABASE_IDLE_TIMEOUT_MS: integerFromEnvironment(10_000, 300_000),
    FILE_STORAGE_DRIVER: z.enum(["local", "s3"]).default("local"),
    FILE_STORAGE_PATH: z.string().min(1).default(".data/uploads"),
    S3_ENDPOINT: optionalHttpUrl,
    S3_REGION: optionalEnvironmentValue,
    S3_BUCKET: optionalEnvironmentValue,
    S3_ACCESS_KEY_ID: optionalEnvironmentValue,
    S3_SECRET_ACCESS_KEY: optionalEnvironmentValue,
    S3_FORCE_PATH_STYLE: z
      .enum(["true", "false"])
      .default("true")
      .transform((value) => value === "true"),
  })
  .superRefine((value, context) => {
    if (value.FILE_STORAGE_DRIVER !== "s3") return;
    for (const field of [
      "S3_ENDPOINT",
      "S3_REGION",
      "S3_BUCKET",
      "S3_ACCESS_KEY_ID",
      "S3_SECRET_ACCESS_KEY",
    ] as const) {
      if (!value[field]) {
        context.addIssue({
          code: "custom",
          path: [field],
          message: "é obrigatório quando FILE_STORAGE_DRIVER=s3",
        });
      }
    }
  });

export type ServerEnvironment = z.infer<typeof serverEnvironmentSchema>;

/** Valida somente nomes de campos; valores potencialmente secretos não vazam. */
export function parseServerEnvironment(
  source: Record<string, string | undefined>,
): ServerEnvironment {
  const result = serverEnvironmentSchema.safeParse(source);
  if (result.success) return result.data;

  const fields = [
    ...new Set(
      result.error.issues.map((issue) => issue.path.join(".") || "ambiente"),
    ),
  ].join(", ");
  throw new Error(`Configuração privada inválida. Revise: ${fields}.`);
}
