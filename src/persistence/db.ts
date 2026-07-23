import { mkdirSync } from "node:fs";
import path from "node:path";

import BetterSqlite3 from "better-sqlite3";
import {
  drizzle,
  type BetterSQLite3Database,
} from "drizzle-orm/better-sqlite3";

import * as schema from "./schema";

const DEFAULT_BUSY_TIMEOUT_MS = 5_000;

export type BranchWriteDatabase = BetterSQLite3Database<typeof schema>;

export type DatabaseConnection = {
  client: BetterSqlite3.Database;
  db: BranchWriteDatabase;
  path: string;
  close: () => void;
};

export function resolveDatabasePath(): string {
  return path.resolve(
    process.env.BRANCHWRITE_DATABASE_PATH ??
      path.join(process.cwd(), "data", "branchwrite.db"),
  );
}

export function openDatabase(
  databasePath = resolveDatabasePath(),
): DatabaseConnection {
  const resolvedPath = path.resolve(databasePath);
  mkdirSync(path.dirname(resolvedPath), { recursive: true });

  const client = new BetterSqlite3(resolvedPath, {
    timeout: DEFAULT_BUSY_TIMEOUT_MS,
  });
  client.pragma("foreign_keys = ON");
  client.pragma("journal_mode = WAL");
  client.pragma(`busy_timeout = ${DEFAULT_BUSY_TIMEOUT_MS}`);

  return {
    client,
    db: drizzle(client, { schema }),
    path: resolvedPath,
    close: () => client.close(),
  };
}
