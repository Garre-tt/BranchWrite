import { rmSync } from "node:fs";

import { afterEach, describe, expect, it } from "vitest";

import { DocumentService } from "../../src/domain/document/document-service";
import { openDatabase } from "../../src/persistence/db";
import { DocumentRepository } from "../../src/persistence/repositories/document-repository";
import { draftRevisions } from "../../src/persistence/schema";
import { allSupportedContentFixture } from "../fixtures/all-supported-content";
import {
  createTestDatabase,
  type TestDatabase,
} from "../helpers/test-database";

let testDatabase: TestDatabase | undefined;

afterEach(() => {
  testDatabase?.cleanup();
  testDatabase = undefined;
});

function createService(database: TestDatabase) {
  return new DocumentService(new DocumentRepository(database));
}

describe("DocumentService", () => {
  it("creates a document and its initial revision atomically", () => {
    testDatabase = createTestDatabase();
    const service = createService(testDatabase);

    const result = service.createDocument();
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.value.title).toBe("Untitled document");
    expect(result.value.currentVersion).toBe(0);
    expect(result.value.content.content[0]?.attrs?.id).toEqual(
      expect.any(String),
    );

    const revisions = testDatabase.db.select().from(draftRevisions).all();
    expect(revisions).toHaveLength(1);
    expect(revisions[0]).toMatchObject({
      documentId: result.value.id,
      cause: "initial",
      parentRevisionId: null,
      contentHash: result.value.contentHash,
    });
  });

  it("persists every supported format and restores it after reopening", () => {
    testDatabase = createTestDatabase();
    const service = createService(testDatabase);
    const created = service.createDocument("Formatting fixture");
    if (!created.ok) {
      throw new Error(created.error.message);
    }

    const saved = service.saveDocumentContent({
      documentId: created.value.id,
      content: allSupportedContentFixture,
      expectedVersion: 0,
    });
    expect(saved.ok).toBe(true);
    if (!saved.ok) {
      return;
    }
    expect(saved.value.currentVersion).toBe(1);

    const databasePath = testDatabase.path;
    const databaseDirectory = testDatabase.directory;
    testDatabase.close();
    const reopened = openDatabase(databasePath);

    try {
      const restored = new DocumentService(
        new DocumentRepository(reopened),
      ).getDocument(created.value.id);
      expect(restored.ok).toBe(true);
      if (restored.ok) {
        expect(restored.value.content).toEqual(saved.value.content);
        expect(restored.value.contentHash).toBe(saved.value.contentHash);
      }
    } finally {
      reopened.close();
      testDatabase = undefined;
      rmSync(databaseDirectory, { force: true, recursive: true });
    }
  });

  it("rejects stale saves and leaves the persisted draft unchanged", () => {
    testDatabase = createTestDatabase();
    const service = createService(testDatabase);
    const created = service.createDocument();
    if (!created.ok) {
      throw new Error(created.error.message);
    }

    const firstContent = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          attrs: { id: "target" },
          content: [{ type: "text", text: "First save" }],
        },
      ],
    };
    const staleContent = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          attrs: { id: "target" },
          content: [{ type: "text", text: "Stale overwrite" }],
        },
      ],
    };

    const firstSave = service.saveDocumentContent({
      documentId: created.value.id,
      content: firstContent,
      expectedVersion: 0,
    });
    expect(firstSave.ok).toBe(true);

    const staleSave = service.saveDocumentContent({
      documentId: created.value.id,
      content: staleContent,
      expectedVersion: 0,
    });
    expect(staleSave).toMatchObject({
      ok: false,
      error: { code: "STALE_WRITE" },
    });

    const restored = service.getDocument(created.value.id);
    expect(restored.ok && restored.value.content).toEqual(
      firstSave.ok && firstSave.value.content,
    );
  });

  it("treats same-hash saves and renames as content-version no-ops", () => {
    testDatabase = createTestDatabase();
    const service = createService(testDatabase);
    const created = service.createDocument();
    if (!created.ok) {
      throw new Error(created.error.message);
    }

    const noOp = service.saveDocumentContent({
      documentId: created.value.id,
      content: created.value.content,
      expectedVersion: 0,
    });
    expect(noOp.ok && noOp.value.currentVersion).toBe(0);

    const renamed = service.renameDocument(created.value.id, "New title");
    expect(renamed.ok && renamed.value.title).toBe("New title");
    expect(renamed.ok && renamed.value.currentVersion).toBe(0);
  });

  it("rejects unsupported content before it reaches SQLite", () => {
    testDatabase = createTestDatabase();
    const service = createService(testDatabase);
    const created = service.createDocument();
    if (!created.ok) {
      throw new Error(created.error.message);
    }

    const result = service.saveDocumentContent({
      documentId: created.value.id,
      content: {
        type: "doc",
        content: [{ type: "table", attrs: { id: "table" } }],
      },
      expectedVersion: 0,
    });

    expect(result).toMatchObject({
      ok: false,
      error: { code: "VALIDATION_ERROR" },
    });
    const restored = service.getDocument(created.value.id);
    expect(restored.ok && restored.value.currentVersion).toBe(0);
  });
});
