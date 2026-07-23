import { and, desc, eq } from "drizzle-orm";

import { PersistedDocumentError } from "@/domain/document/document-errors";
import type {
  DocumentSummary,
  DraftDocument,
  SaveDocumentContentInput,
  SaveDocumentContentResult,
} from "@/domain/document/document-types";
import { validateStructuredContent } from "@/editor/content-validation";
import { SCHEMA_VERSION } from "@/editor/schema-version";
import type { StructuredDocumentJson } from "@/editor/structured-content";
import type { DatabaseConnection } from "@/persistence/db";
import { documents, draftRevisions } from "@/persistence/schema";

type DocumentRow = typeof documents.$inferSelect;

export type CreateDocumentRecord = {
  id: string;
  title: string;
  content: StructuredDocumentJson;
  contentHash: string;
  revisionId: string;
  createdAt: string;
};

function toDocumentSummary(row: DocumentRow): DocumentSummary {
  return {
    id: row.id,
    title: row.title,
    currentVersion: row.currentVersion,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function toDraftDocument(row: DocumentRow): DraftDocument {
  if (row.schemaVersion !== SCHEMA_VERSION) {
    throw new PersistedDocumentError(
      `Document "${row.id}" uses unsupported schema version "${row.schemaVersion}".`,
    );
  }

  try {
    const content = validateStructuredContent(
      JSON.parse(row.currentContentJson),
    ).json;

    return {
      ...toDocumentSummary(row),
      content,
      contentHash: row.currentContentHash,
      schemaVersion: row.schemaVersion,
    };
  } catch (error) {
    throw new PersistedDocumentError(
      `Document "${row.id}" contains invalid structured content.`,
      { cause: error },
    );
  }
}

export class DocumentRepository {
  constructor(private readonly connection: DatabaseConnection) {}

  list(): DocumentSummary[] {
    return this.connection.db
      .select()
      .from(documents)
      .orderBy(desc(documents.updatedAt), desc(documents.createdAt))
      .all()
      .map(toDocumentSummary);
  }

  findById(documentId: string): DraftDocument | null {
    const row = this.connection.db
      .select()
      .from(documents)
      .where(eq(documents.id, documentId))
      .get();

    return row ? toDraftDocument(row) : null;
  }

  createWithInitialRevision(record: CreateDocumentRecord): DraftDocument {
    const contentJson = JSON.stringify(record.content);

    this.connection.db.transaction((transaction) => {
      transaction
        .insert(documents)
        .values({
          id: record.id,
          title: record.title,
          currentContentJson: contentJson,
          currentContentHash: record.contentHash,
          currentVersion: 0,
          schemaVersion: SCHEMA_VERSION,
          createdAt: record.createdAt,
          updatedAt: record.createdAt,
        })
        .run();

      transaction
        .insert(draftRevisions)
        .values({
          id: record.revisionId,
          documentId: record.id,
          parentRevisionId: null,
          contentJson,
          contentHash: record.contentHash,
          schemaVersion: SCHEMA_VERSION,
          cause: "initial",
          createdAt: record.createdAt,
        })
        .run();
    });

    const created = this.findById(record.id);
    if (!created) {
      throw new PersistedDocumentError(
        `Document "${record.id}" was not available after creation.`,
      );
    }

    return created;
  }

  rename(
    documentId: string,
    title: string,
    updatedAt: string,
  ): DraftDocument | null {
    const result = this.connection.db
      .update(documents)
      .set({ title, updatedAt })
      .where(eq(documents.id, documentId))
      .run();

    if (result.changes === 0) {
      return null;
    }

    return this.findById(documentId);
  }

  saveContent(input: SaveDocumentContentInput): SaveDocumentContentResult {
    return this.connection.db.transaction((transaction) => {
      const existing = transaction
        .select()
        .from(documents)
        .where(eq(documents.id, input.documentId))
        .get();

      if (!existing) {
        return { kind: "not_found" } as const;
      }

      if (existing.currentVersion !== input.expectedVersion) {
        return {
          kind: "stale",
          actualVersion: existing.currentVersion,
        } as const;
      }

      if (existing.currentContentHash === input.contentHash) {
        return {
          kind: "saved",
          document: toDraftDocument(existing),
        } as const;
      }

      const nextVersion = existing.currentVersion + 1;
      const updateResult = transaction
        .update(documents)
        .set({
          currentContentJson: JSON.stringify(input.content),
          currentContentHash: input.contentHash,
          currentVersion: nextVersion,
          updatedAt: input.updatedAt,
        })
        .where(
          and(
            eq(documents.id, input.documentId),
            eq(documents.currentVersion, input.expectedVersion),
          ),
        )
        .run();

      if (updateResult.changes !== 1) {
        const current = transaction
          .select({ currentVersion: documents.currentVersion })
          .from(documents)
          .where(eq(documents.id, input.documentId))
          .get();

        return current
          ? ({ kind: "stale", actualVersion: current.currentVersion } as const)
          : ({ kind: "not_found" } as const);
      }

      const saved = transaction
        .select()
        .from(documents)
        .where(eq(documents.id, input.documentId))
        .get();

      if (!saved) {
        throw new PersistedDocumentError(
          `Document "${input.documentId}" disappeared during save.`,
        );
      }

      return {
        kind: "saved",
        document: toDraftDocument(saved),
      } as const;
    });
  }
}
