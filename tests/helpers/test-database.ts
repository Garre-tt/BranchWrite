import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  openDatabase,
  type DatabaseConnection,
} from "../../src/persistence/db";
import { migrateDatabase } from "../../src/persistence/migrate";

export type TestDatabase = DatabaseConnection & {
  directory: string;
  cleanup: () => void;
};

export function createTestDatabase(): TestDatabase {
  const directory = mkdtempSync(path.join(os.tmpdir(), "branchwrite-test-"));
  const databasePath = path.join(directory, "branchwrite.test.db");
  const connection = openDatabase(databasePath);

  try {
    migrateDatabase(connection);
  } catch (error) {
    connection.close();
    rmSync(directory, { force: true, recursive: true });
    throw error;
  }

  return {
    ...connection,
    directory,
    cleanup: () => {
      if (connection.client.open) {
        connection.close();
      }
      rmSync(directory, { force: true, recursive: true });
    },
  };
}
