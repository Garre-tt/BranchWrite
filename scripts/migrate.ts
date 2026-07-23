import { openDatabase } from "../src/persistence/db";
import { migrateDatabase } from "../src/persistence/migrate";

const connection = openDatabase();

try {
  migrateDatabase(connection);
  console.log(`Applied migrations to ${connection.path}`);
} finally {
  connection.close();
}
