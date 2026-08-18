import {
  mkdir,
  readFile,
  readdir,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { dirname, relative, resolve, sep } from "node:path";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import type { ServerEnvironment } from "../config/env-schema";
import type { StoredFileBackend } from "../db/schema";

export type StoredObject = {
  key: string;
  content: Uint8Array;
  contentType: string;
};

export type StoredObjectMetadata = {
  key: string;
  byteSize: number;
  lastModified: Date;
  contentType?: string;
};

export interface PrivateFileStorage {
  readonly backend: StoredFileBackend;
  upload(object: StoredObject): Promise<void>;
  get(key: string): Promise<Uint8Array>;
  delete(key: string): Promise<void>;
  exists(key: string): Promise<boolean>;
  getMetadata(key: string): Promise<StoredObjectMetadata | null>;
  list(prefix: string): Promise<StoredObjectMetadata[]>;
}

export function assertStorageKey(key: string): void {
  if (!/^[a-z0-9][a-z0-9/_-]*\.[a-z0-9]{1,15}$/u.test(key)) {
    throw new Error("Chave de armazenamento inválida.");
  }
}

function assertStoragePrefix(prefix: string): void {
  if (!/^[a-z0-9][a-z0-9/_-]*\/?$/u.test(prefix) || prefix.includes("..")) {
    throw new Error("Prefixo de armazenamento inválido.");
  }
}

export class LocalPrivateFileStorage implements PrivateFileStorage {
  readonly backend = "local" as const;
  private readonly root: string;

  constructor(root: string) {
    this.root = resolve(root);
  }

  private path(key: string): string {
    assertStorageKey(key);
    const target = resolve(this.root, ...key.split("/"));
    if (target !== this.root && !target.startsWith(`${this.root}${sep}`)) {
      throw new Error("Chave de armazenamento fora do diretório privado.");
    }
    return target;
  }

  async upload(object: StoredObject): Promise<void> {
    const target = this.path(object.key);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, object.content, { flag: "wx", mode: 0o600 });
  }

  async get(key: string): Promise<Uint8Array> {
    return Uint8Array.from(await readFile(this.path(key)));
  }

  async delete(key: string): Promise<void> {
    await rm(this.path(key), { force: true });
  }

  async exists(key: string): Promise<boolean> {
    return (await this.getMetadata(key)) !== null;
  }

  async getMetadata(key: string): Promise<StoredObjectMetadata | null> {
    try {
      const value = await stat(this.path(key));
      return { key, byteSize: value.size, lastModified: value.mtime };
    } catch (cause) {
      if ((cause as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw cause;
    }
  }

  async list(prefix: string): Promise<StoredObjectMetadata[]> {
    assertStoragePrefix(prefix);
    const start = resolve(this.root, ...prefix.replace(/\/$/u, "").split("/"));
    if (!start.startsWith(`${this.root}${sep}`)) {
      throw new Error("Prefixo fora do diretório privado.");
    }
    const result: StoredObjectMetadata[] = [];
    const walk = async (directory: string): Promise<void> => {
      let entries;
      try {
        entries = await readdir(directory, { withFileTypes: true });
      } catch (cause) {
        if ((cause as NodeJS.ErrnoException).code === "ENOENT") return;
        throw cause;
      }
      for (const entry of entries) {
        const target = resolve(directory, entry.name);
        if (entry.isDirectory()) await walk(target);
        if (entry.isFile()) {
          const value = await stat(target);
          result.push({
            key: relative(this.root, target).split(sep).join("/"),
            byteSize: value.size,
            lastModified: value.mtime,
          });
        }
      }
    };
    await walk(start);
    return result;
  }
}

export class S3PrivateFileStorage implements PrivateFileStorage {
  readonly backend = "s3" as const;
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor(environment: ServerEnvironment) {
    if (
      !environment.S3_ENDPOINT ||
      !environment.S3_REGION ||
      !environment.S3_BUCKET ||
      !environment.S3_ACCESS_KEY_ID ||
      !environment.S3_SECRET_ACCESS_KEY
    ) {
      throw new Error("Configuração S3 incompleta.");
    }
    this.bucket = environment.S3_BUCKET;
    this.client = new S3Client({
      endpoint: environment.S3_ENDPOINT,
      region: environment.S3_REGION,
      forcePathStyle: environment.S3_FORCE_PATH_STYLE,
      credentials: {
        accessKeyId: environment.S3_ACCESS_KEY_ID,
        secretAccessKey: environment.S3_SECRET_ACCESS_KEY,
      },
    });
  }

  async upload(object: StoredObject): Promise<void> {
    assertStorageKey(object.key);
    if (await this.exists(object.key)) {
      throw new Error("A chave de armazenamento já existe.");
    }
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: object.key,
        IfNoneMatch: "*",
        Body: object.content,
        ContentType: object.contentType,
      }),
    );
  }

  async get(key: string): Promise<Uint8Array> {
    assertStorageKey(key);
    const result = await this.client.send(
      new GetObjectCommand({ Bucket: this.bucket, Key: key }),
    );
    if (!result.Body) throw new Error("Objeto não encontrado no storage.");
    return result.Body.transformToByteArray();
  }

  async delete(key: string): Promise<void> {
    assertStorageKey(key);
    await this.client.send(
      new DeleteObjectCommand({ Bucket: this.bucket, Key: key }),
    );
  }

  async exists(key: string): Promise<boolean> {
    return (await this.getMetadata(key)) !== null;
  }

  async getMetadata(key: string): Promise<StoredObjectMetadata | null> {
    assertStorageKey(key);
    try {
      const value = await this.client.send(
        new HeadObjectCommand({ Bucket: this.bucket, Key: key }),
      );
      return {
        key,
        byteSize: value.ContentLength ?? 0,
        lastModified: value.LastModified ?? new Date(0),
        contentType: value.ContentType,
      };
    } catch (cause) {
      const status = (cause as { $metadata?: { httpStatusCode?: number } })
        .$metadata?.httpStatusCode;
      if (status === 404) return null;
      throw cause;
    }
  }

  async list(prefix: string): Promise<StoredObjectMetadata[]> {
    assertStoragePrefix(prefix);
    const result: StoredObjectMetadata[] = [];
    let continuationToken: string | undefined;
    do {
      const page = await this.client.send(
        new ListObjectsV2Command({
          Bucket: this.bucket,
          Prefix: prefix,
          ContinuationToken: continuationToken,
        }),
      );
      for (const object of page.Contents ?? []) {
        if (!object.Key) continue;
        result.push({
          key: object.Key,
          byteSize: object.Size ?? 0,
          lastModified: object.LastModified ?? new Date(0),
        });
      }
      continuationToken = page.IsTruncated
        ? page.NextContinuationToken
        : undefined;
    } while (continuationToken);
    return result;
  }
}

export function createPrivateFileStorage(
  environment: ServerEnvironment,
): PrivateFileStorage {
  return environment.FILE_STORAGE_DRIVER === "s3"
    ? new S3PrivateFileStorage(environment)
    : new LocalPrivateFileStorage(environment.FILE_STORAGE_PATH);
}
