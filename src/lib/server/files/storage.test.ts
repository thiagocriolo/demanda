import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { LocalPrivateFileStorage } from "./storage";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true })),
  );
});

describe("storage privado local", () => {
  it("persiste entre instâncias e exclui pelo identificador opaco", async () => {
    const root = await mkdtemp(join(tmpdir(), "demanda-files-"));
    roots.push(root);
    const first = new LocalPrivateFileStorage(root);
    const key = "workspace/arquivo.png";
    const content = new Uint8Array([1, 2, 3]);
    await first.upload({ key, content, contentType: "image/png" });
    expect(await first.exists(key)).toBe(true);
    expect((await first.getMetadata(key))?.byteSize).toBe(3);
    const second = new LocalPrivateFileStorage(root);
    expect(await second.get(key)).toEqual(content);
    await second.delete(key);
    await expect(first.get(key)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("bloqueia traversal de diretório", async () => {
    const root = await mkdtemp(join(tmpdir(), "demanda-files-"));
    roots.push(root);
    const storage = new LocalPrivateFileStorage(root);
    await expect(storage.get("../segredo.png")).rejects.toThrow(
      "Chave de armazenamento inválida",
    );
  });
});
