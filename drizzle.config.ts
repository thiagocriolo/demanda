import "dotenv/config";
import { defineConfig } from "drizzle-kit";
import { parseServerEnvironment } from "./src/lib/server/config/env-schema";

const environment = parseServerEnvironment(process.env);

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/lib/server/db/schema/index.ts",
  out: "./drizzle",
  dbCredentials: {
    url: environment.DATABASE_URL,
  },
  strict: true,
  verbose: true,
});
