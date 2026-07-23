import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "sqlite",
  schema: "./src/persistence/schema.ts",
  out: "./drizzle",
  dbCredentials: {
    url: process.env.BRANCHWRITE_DATABASE_PATH ?? "./data/branchwrite.db",
  },
  strict: true,
  verbose: true,
});
