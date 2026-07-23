import { openDatabase, type DatabaseConnection } from "@/persistence/db";
import { migrateDatabase } from "@/persistence/migrate";

const globalDatabase = globalThis as typeof globalThis & {
  branchWriteDatabase?: DatabaseConnection;
};

export function getRuntimeDatabase(): DatabaseConnection {
  if (!globalDatabase.branchWriteDatabase) {
    const connection = openDatabase();
    migrateDatabase(connection);
    globalDatabase.branchWriteDatabase = connection;
  }

  return globalDatabase.branchWriteDatabase;
}
