import path from "node:path";

import { migrate } from "drizzle-orm/better-sqlite3/migrator";

import type { DatabaseConnection } from "./db";

export function migrateDatabase(
  connection: DatabaseConnection,
  migrationsFolder = path.resolve(process.cwd(), "drizzle"),
): void {
  migrate(connection.db, { migrationsFolder });
}
