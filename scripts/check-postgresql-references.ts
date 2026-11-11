import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

const forbidden = /\bfrom\s+["']pg["']|\bpg\.Pool\b|\bapp\.|\bpg_advisory\b|::(?:uuid|text|int|jsonb|bigint)\b/iu;

async function files(path: string): Promise<string[]> {
  const entries = await readdir(path, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".ts"))
    .map((entry) => join(path, entry.name));
}

async function main(): Promise<void> {
  const matches: string[] = [];
  for (const file of await files(join(process.cwd(), "scripts"))) {
    const source = await readFile(file, "utf8");
    if (forbidden.test(source)) matches.push(file.replace(`${process.cwd()}\\`, ""));
  }
  if (matches.length) {
    throw new Error(`Referências PostgreSQL restantes: ${matches.join(", ")}`);
  }
  console.log("Scripts sem referências PostgreSQL detectadas.");
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
