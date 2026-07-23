import { rmSync } from "node:fs";

import { afterEach, describe, expect, it } from "vitest";

import { openDatabase } from "../../src/persistence/db";
import {
  createTestDatabase,
  type TestDatabase,
} from "../helpers/test-database";

let testDatabase: TestDatabase | undefined;

afterEach(() => {
  testDatabase?.cleanup();
  testDatabase = undefined;
});

describe("SQLite foundation", () => {
  it("applies the checked-in migration to an isolated on-disk database", () => {
    testDatabase = createTestDatabase();

    const tables = testDatabase.client
      .prepare(
        "select name from sqlite_master where type = 'table' order by name",
      )
      .all() as Array<{ name: string }>;

    expect(tables.map(({ name }) => name)).toEqual(
      expect.arrayContaining([
        "__drizzle_migrations",
        "alternatives",
        "diff_snapshots",
        "documents",
        "draft_revisions",
        "merge_events",
        "proposals",
      ]),
    );
    expect(testDatabase.client.pragma("foreign_keys", { simple: true })).toBe(
      1,
    );
    expect(testDatabase.client.pragma("journal_mode", { simple: true })).toBe(
      "wal",
    );
  });

  it("can reopen a migrated database from a new connection", () => {
    testDatabase = createTestDatabase();
    const databasePath = testDatabase.path;
    const databaseDirectory = testDatabase.directory;

    testDatabase.close();
    const reopened = openDatabase(databasePath);

    try {
      const migrationCount = reopened.client
        .prepare("select count(*) as count from __drizzle_migrations")
        .get() as { count: number };

      expect(migrationCount.count).toBeGreaterThan(0);
    } finally {
      reopened.close();
      testDatabase = undefined;
      rmSync(databaseDirectory, { force: true, recursive: true });
    }
  });
});
