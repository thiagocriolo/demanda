import { describe, expect, it } from "vitest";
import { parseServerEnvironment } from "./env-schema";

const validUrl = "mysql://demanda:segredo@localhost:3306/demanda";

describe("parseServerEnvironment", () => {
  it("aplica limites seguros por padrão", () => {
    expect(parseServerEnvironment({ DATABASE_URL: validUrl })).toEqual({
      DATABASE_URL: validUrl,
      APP_ORIGIN: "http://localhost:5190",
      DATABASE_POOL_MAX: 10,
      DATABASE_CONNECT_TIMEOUT_MS: 5_000,
      DATABASE_IDLE_TIMEOUT_MS: 10_000,
      FILE_STORAGE_DRIVER: "local",
      FILE_STORAGE_PATH: ".data/uploads",
      S3_FORCE_PATH_STYLE: true,
    });
  });

  it("aceita somente uma origem HTTP confiável para links do servidor", () => {
    expect(
      parseServerEnvironment({
        DATABASE_URL: validUrl,
        APP_ORIGIN: "https://demanda.example",
      }).APP_ORIGIN,
    ).toBe("https://demanda.example");

    expect(() =>
      parseServerEnvironment({
        DATABASE_URL: validUrl,
        APP_ORIGIN: "https://demanda.example/caminho",
      }),
    ).toThrow("Revise: APP_ORIGIN");
  });

  it("converte inteiros configurados como texto", () => {
    const environment = parseServerEnvironment({
      DATABASE_URL: validUrl,
      DATABASE_POOL_MAX: "4",
      DATABASE_CONNECT_TIMEOUT_MS: "2000",
      DATABASE_IDLE_TIMEOUT_MS: "30000",
    });

    expect(environment.DATABASE_POOL_MAX).toBe(4);
    expect(environment.DATABASE_CONNECT_TIMEOUT_MS).toBe(2_000);
    expect(environment.DATABASE_IDLE_TIMEOUT_MS).toBe(30_000);
  });

  it.each([
    undefined,
    "",
    "https://usuario:segredo@example.com/demanda",
    "mysql://localhost",
  ])("rejeita DATABASE_URL inválida (%s)", (DATABASE_URL) => {
    expect(() => parseServerEnvironment({ DATABASE_URL })).toThrow(
      "Revise: DATABASE_URL",
    );
  });

  it("não inclui segredos na mensagem de erro", () => {
    const secret = "senha-que-nao-pode-vazar";
    let message = "";

    try {
      parseServerEnvironment({
        DATABASE_URL: `https://usuario:${secret}@example.com/demanda`,
      });
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }

    expect(message).not.toContain(secret);
    expect(message).toContain("DATABASE_URL");
  });

  it("rejeita limites fora do contrato", () => {
    expect(() =>
      parseServerEnvironment({
        DATABASE_URL: validUrl,
        DATABASE_POOL_MAX: "51",
      }),
    ).toThrow("Revise: DATABASE_POOL_MAX");
  });

  it("exige configuração S3 completa sem vazar credenciais", () => {
    expect(() =>
      parseServerEnvironment({
        DATABASE_URL: validUrl,
        FILE_STORAGE_DRIVER: "s3",
        S3_ENDPOINT: "https://storage.example",
      }),
    ).toThrow("S3_REGION");
  });

  it("aceita storage S3 compatível configurado", () => {
    const environment = parseServerEnvironment({
      DATABASE_URL: validUrl,
      FILE_STORAGE_DRIVER: "s3",
      S3_ENDPOINT: "https://storage.example",
      S3_REGION: "us-east-1",
      S3_BUCKET: "demanda-private",
      S3_ACCESS_KEY_ID: "access",
      S3_SECRET_ACCESS_KEY: "secret",
      S3_FORCE_PATH_STYLE: "false",
    });
    expect(environment).toMatchObject({
      FILE_STORAGE_DRIVER: "s3",
      S3_ENDPOINT: "https://storage.example",
      S3_FORCE_PATH_STYLE: false,
    });
  });
});
