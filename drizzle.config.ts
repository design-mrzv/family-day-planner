import { defineConfig } from "drizzle-kit";

// Міграції йдуть через пряме (non-pooling) зʼєднання — pooled URL іноді не годиться
// для DDL-операцій drizzle-kit.
const url = process.env.POSTGRES_URL_NON_POOLING;
if (!url) throw new Error("POSTGRES_URL_NON_POOLING не налаштований");

export default defineConfig({
  schema: "./lib/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: { url },
});
