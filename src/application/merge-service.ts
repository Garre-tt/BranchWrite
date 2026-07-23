import { randomUUID } from "node:crypto";

import { domainError, type DomainErrorCode } from "@/application/errors";
import { err, ok, type Result } from "@/application/result";
import {
  applyBlockMerge,
  applySectionMerge,
  applySentenceMerge,
} from "@/domain/merge/merge-transforms";
import type {
  MergeCommand,
  MergeResult,
  RevertResult,
} from "@/domain/merge/merge-types";
import { hashReviewBlock } from "@/domain/review/diff-service";
import {
  REVIEW_ALGORITHM_VERSION,
  type DiffSnapshot,
} from "@/domain/review/review-types";
import { hashStructuredContent } from "@/editor/content-hash";
import { SCHEMA_VERSION } from "@/editor/schema-version";
import { validateStructuredContent } from "@/editor/content-validation";
import type { DatabaseConnection } from "@/persistence/db";
import { DocumentRepository } from "@/persistence/repositories/document-repository";

class MergeFailure extends Error {
  constructor(
    readonly code: DomainErrorCode,
    message: string,
  ) {
    super(message);
  }
}

type Row = Record<string, unknown>;
const text = (row: Row, key: string) => String(row[key]);
const number = (row: Row, key: string) => Number(row[key]);

export class MergeService {
  constructor(private readonly connection: DatabaseConnection) {}

  merge(
    command: MergeCommand,
  ): Result<MergeResult, ReturnType<typeof domainError>> {
    try {
      const eventId = randomUUID();
      const affected = this.connection.client.transaction(() => {
        const document = this.connection.client
          .prepare("select * from documents where id = ?")
          .get(command.documentId) as Row | undefined;
        const alternative = this.connection.client
          .prepare(
            "select a.*, p.scope_block_ids_json from alternatives a join proposals p on p.id = a.proposal_id where a.id = ? and a.document_id = ?",
          )
          .get(command.alternativeId, command.documentId) as Row | undefined;
        const snapshotRow = this.connection.client
          .prepare(
            "select * from diff_snapshots where id = ? and alternative_id = ?",
          )
          .get(command.diffSnapshotId, command.alternativeId) as
          Row | undefined;
        if (!document || !alternative || !snapshotRow)
          throw new MergeFailure(
            "INVALID_REVIEW",
            "The Review is unavailable.",
          );
        if (
          text(snapshotRow, "status") !== "current" ||
          text(snapshotRow, "algorithm_version") !== REVIEW_ALGORITHM_VERSION
        )
          throw new MergeFailure(
            "INVALID_REVIEW",
            "Recalculate Review before accepting.",
          );
        if (
          text(alternative, "content_hash") !==
          text(snapshotRow, "alternative_content_hash")
        )
          throw new MergeFailure(
            "STALE_ALTERNATIVE",
            "The Alternative changed.",
          );

        const payload = JSON.parse(text(snapshotRow, "hunks_json")) as Pick<
          DiffSnapshot,
          "blocks"
        >;
        const scopeIds = JSON.parse(
          text(alternative, "scope_block_ids_json"),
        ) as string[];
        const blocks =
          command.acceptanceKind === "section"
            ? payload.blocks
            : payload.blocks.filter((block) =>
                command.hunkIds.includes(
                  command.acceptanceKind === "sentence"
                    ? (block.sentenceReplacement?.id ?? "")
                    : block.blockHunkId,
                ),
              );
        const expectedHunkIds =
          command.acceptanceKind === "section"
            ? payload.blocks.map((block) => block.blockHunkId)
            : command.hunkIds;
        const exactSectionHunks =
          command.acceptanceKind !== "section" ||
          (command.hunkIds.length === expectedHunkIds.length &&
            expectedHunkIds.every((id) => command.hunkIds.includes(id)));
        if (
          !blocks.length ||
          (command.acceptanceKind !== "section" && blocks.length !== 1) ||
          (command.acceptanceKind === "section" &&
            (!command.sectionReviewAcknowledged ||
              blocks.length !== scopeIds.length)) ||
          !exactSectionHunks ||
          new Set(command.hunkIds).size !== command.hunkIds.length ||
          command.expectedTargets.length !== blocks.length ||
          new Set(command.expectedTargets.map((target) => target.blockId))
            .size !== command.expectedTargets.length
        )
          throw new MergeFailure(
            "INVALID_ACCEPTANCE_UNIT",
            "That acceptance is not valid.",
          );

        const current = validateStructuredContent(
          JSON.parse(text(document, "current_content_json")),
        ).json;
        const expectations = new Map(
          command.expectedTargets.map((target) => [
            target.blockId,
            target.beforeHash,
          ]),
        );
        for (const block of blocks) {
          const target = current.content.find(
            (node) => node.attrs?.id === block.id,
          );
          if (
            !target ||
            expectations.get(block.id) !== block.expectedTargetHash ||
            hashReviewBlock(target) !== block.expectedTargetHash
          )
            throw new MergeFailure(
              "STALE_TARGET",
              "My Draft changed at this target.",
            );
        }

        const next =
          command.acceptanceKind === "section"
            ? applySectionMerge(current, blocks)
            : command.acceptanceKind === "sentence"
              ? applySentenceMerge(current, blocks[0]!)
              : applyBlockMerge(current, blocks[0]!);
        const nextHash = hashStructuredContent(next);
        const now = new Date().toISOString();
        let before = this.connection.client
          .prepare(
            "select * from draft_revisions where document_id = ? and content_hash = ? order by created_at desc limit 1",
          )
          .get(command.documentId, text(document, "current_content_hash")) as
          Row | undefined;
        if (!before) {
          const parent = this.connection.client
            .prepare(
              "select id from draft_revisions where document_id = ? order by created_at desc limit 1",
            )
            .get(command.documentId) as Row | undefined;
          const id = randomUUID();
          this.connection.client
            .prepare(
              "insert into draft_revisions values (?, ?, ?, ?, ?, ?, 'proposal_base', ?)",
            )
            .run(
              id,
              command.documentId,
              parent ? text(parent, "id") : null,
              text(document, "current_content_json"),
              text(document, "current_content_hash"),
              SCHEMA_VERSION,
              now,
            );
          before = { id };
        }
        const afterId = randomUUID();
        this.connection.client
          .prepare(
            "insert into draft_revisions values (?, ?, ?, ?, ?, ?, 'merge', ?)",
          )
          .run(
            afterId,
            command.documentId,
            text(before, "id"),
            JSON.stringify(next),
            nextHash,
            SCHEMA_VERSION,
            now,
          );
        const nextVersion = number(document, "current_version") + 1;
        this.connection.client
          .prepare(
            "insert into merge_events values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
          )
          .run(
            eventId,
            command.documentId,
            command.alternativeId,
            command.diffSnapshotId,
            JSON.stringify(command.hunkIds),
            text(before, "id"),
            afterId,
            JSON.stringify(command.expectedTargets),
            command.acceptanceKind,
            nextVersion,
            now,
          );
        const updated = this.connection.client
          .prepare(
            "update documents set current_content_json = ?, current_content_hash = ?, current_version = ?, updated_at = ? where id = ? and current_version = ? and current_content_hash = ?",
          )
          .run(
            JSON.stringify(next),
            nextHash,
            nextVersion,
            now,
            command.documentId,
            number(document, "current_version"),
            text(document, "current_content_hash"),
          );
        if (updated.changes !== 1)
          throw new MergeFailure(
            "STALE_TARGET",
            "My Draft changed during acceptance.",
          );
        this.connection.client
          .prepare("update diff_snapshots set status = 'stale' where id = ?")
          .run(command.diffSnapshotId);
        return blocks.map((block) => block.id);
      })();
      const document = new DocumentRepository(this.connection).findById(
        command.documentId,
      )!;
      return ok({
        document,
        mergeEventId: eventId,
        affectedBlockIds: affected,
        revertEligible: true,
      });
    } catch (error) {
      const failure =
        error instanceof MergeFailure
          ? error
          : new MergeFailure(
              "PERSISTENCE_FAILURE",
              "BranchWrite could not apply this acceptance.",
            );
      return err(domainError(failure.code, failure.message));
    }
  }

  revert(
    documentId: string,
    expectedHash: string,
  ): Result<RevertResult, ReturnType<typeof domainError>> {
    try {
      const result = this.connection.client.transaction(() => {
        const document = this.connection.client
          .prepare("select * from documents where id = ?")
          .get(documentId) as Row | undefined;
        const event = this.connection.client
          .prepare(
            "select * from merge_events where document_id = ? order by created_at desc, id desc limit 1",
          )
          .get(documentId) as Row | undefined;
        if (!document || !event)
          throw new MergeFailure(
            "INVALID_REVIEW",
            "There is no Merge to revert.",
          );
        const after = this.connection.client
          .prepare("select * from draft_revisions where id = ?")
          .get(text(event, "after_revision_id")) as Row;
        const before = this.connection.client
          .prepare("select * from draft_revisions where id = ?")
          .get(text(event, "before_revision_id")) as Row;
        if (
          expectedHash !== text(document, "current_content_hash") ||
          text(after, "content_hash") !== expectedHash ||
          number(document, "current_version") !==
            number(event, "document_version_after")
        )
          throw new MergeFailure(
            "STALE_TARGET",
            "My Draft changed after this Merge.",
          );
        const now = new Date().toISOString();
        this.connection.client
          .prepare(
            "insert into draft_revisions values (?, ?, ?, ?, ?, ?, 'revert', ?)",
          )
          .run(
            randomUUID(),
            documentId,
            text(after, "id"),
            text(before, "content_json"),
            text(before, "content_hash"),
            SCHEMA_VERSION,
            now,
          );
        const updated = this.connection.client
          .prepare(
            "update documents set current_content_json = ?, current_content_hash = ?, current_version = current_version + 1, updated_at = ? where id = ? and current_version = ? and current_content_hash = ?",
          )
          .run(
            text(before, "content_json"),
            text(before, "content_hash"),
            now,
            documentId,
            number(document, "current_version"),
            expectedHash,
          );
        if (updated.changes !== 1)
          throw new MergeFailure("STALE_TARGET", "My Draft changed.");
        return {
          eventId: text(event, "id"),
          affected: (
            JSON.parse(text(event, "target_expectations_json")) as Array<{
              blockId: string;
            }>
          ).map((item) => item.blockId),
        };
      })();
      return ok({
        document: new DocumentRepository(this.connection).findById(documentId)!,
        revertedMergeEventId: result.eventId,
        affectedBlockIds: result.affected,
      });
    } catch (error) {
      const failure =
        error instanceof MergeFailure
          ? error
          : new MergeFailure(
              "PERSISTENCE_FAILURE",
              "BranchWrite could not revert this Merge.",
            );
      return err(domainError(failure.code, failure.message));
    }
  }
}
