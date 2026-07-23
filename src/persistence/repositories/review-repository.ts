import { desc, eq } from "drizzle-orm";

import type { DraftRevision } from "@/domain/proposal/proposal-types";
import type { DiffSnapshot } from "@/domain/review/review-types";
import { REVIEW_ALGORITHM_VERSION } from "@/domain/review/review-types";
import { validateStructuredContent } from "@/editor/content-validation";
import type { DatabaseConnection } from "@/persistence/db";
import { diffSnapshots, draftRevisions } from "@/persistence/schema";

export class ReviewRepository {
  constructor(private readonly connection: DatabaseConnection) {}

  findRevision(revisionId: string): DraftRevision | null {
    const row = this.connection.db
      .select()
      .from(draftRevisions)
      .where(eq(draftRevisions.id, revisionId))
      .get();
    if (!row) return null;
    return {
      id: row.id,
      documentId: row.documentId,
      parentRevisionId: row.parentRevisionId,
      content: validateStructuredContent(JSON.parse(row.contentJson)).json,
      contentHash: row.contentHash,
      schemaVersion: row.schemaVersion,
      cause: row.cause as DraftRevision["cause"],
      createdAt: row.createdAt,
    };
  }

  insert(snapshot: DiffSnapshot): DiffSnapshot {
    return this.connection.db.transaction((transaction) => {
      transaction
        .update(diffSnapshots)
        .set({ status: "stale" })
        .where(eq(diffSnapshots.alternativeId, snapshot.alternativeId))
        .run();
      transaction
        .insert(diffSnapshots)
        .values({
          id: snapshot.id,
          alternativeId: snapshot.alternativeId,
          baseRevisionId: snapshot.baseRevisionId,
          baseScopeHash: snapshot.baseScopeHash,
          alternativeContentHash: snapshot.alternativeContentHash,
          algorithmVersion: snapshot.algorithmVersion,
          hunksJson: JSON.stringify({
            documentId: snapshot.documentId,
            staleReason: snapshot.staleReason,
            blocks: snapshot.blocks,
          }),
          status: snapshot.status,
          createdAt: snapshot.createdAt,
        })
        .run();
      return structuredClone(snapshot);
    });
  }

  findLatest(alternativeId: string): DiffSnapshot | null {
    const row = this.connection.db
      .select()
      .from(diffSnapshots)
      .where(eq(diffSnapshots.alternativeId, alternativeId))
      .orderBy(desc(diffSnapshots.createdAt))
      .get();
    if (!row) return null;
    const payload = JSON.parse(row.hunksJson) as Pick<
      DiffSnapshot,
      "documentId" | "staleReason" | "blocks"
    >;
    return {
      id: row.id,
      alternativeId: row.alternativeId,
      documentId: payload.documentId,
      baseRevisionId: row.baseRevisionId,
      baseScopeHash: row.baseScopeHash,
      alternativeContentHash: row.alternativeContentHash,
      algorithmVersion: REVIEW_ALGORITHM_VERSION,
      status: row.status as DiffSnapshot["status"],
      staleReason: payload.staleReason,
      blocks: payload.blocks,
      createdAt: row.createdAt,
    };
  }
}
