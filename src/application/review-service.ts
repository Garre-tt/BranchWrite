import { randomUUID } from "node:crypto";

import { domainError, type DomainError } from "@/application/errors";
import { err, ok, type Result } from "@/application/result";
import {
  DeterministicDiffService,
  hashReviewBlock,
} from "@/domain/review/diff-service";
import type { DiffSnapshot } from "@/domain/review/review-types";
import type { DocumentRepository } from "@/persistence/repositories/document-repository";
import type { ProposalRepository } from "@/persistence/repositories/proposal-repository";
import type { ReviewRepository } from "@/persistence/repositories/review-repository";

export class ReviewService {
  constructor(
    private readonly reviews: ReviewRepository,
    private readonly proposals: ProposalRepository,
    private readonly documents: DocumentRepository,
    private readonly diff = new DeterministicDiffService(),
  ) {}

  create(input: {
    alternativeId: string;
    againstCurrentDraft: boolean;
    expectedDocumentVersion?: number;
  }): Result<DiffSnapshot, DomainError> {
    try {
      const alternative = this.proposals.findAlternativeById(
        input.alternativeId,
      );
      if (!alternative) {
        return err(
          domainError("NOT_FOUND", "That Alternative could not be found."),
        );
      }
      const document = this.documents.findById(alternative.documentId);
      if (!document) {
        return err(
          domainError("NOT_FOUND", "That document could not be found."),
        );
      }
      const originalBase = this.reviews.findRevision(
        alternative.proposal.baseRevisionId,
      );
      if (!originalBase) {
        return err(
          domainError("INVALID_REVIEW", "The Proposal base is unavailable."),
        );
      }

      let baseRevision = originalBase;
      let missing = false;
      if (input.againstCurrentDraft) {
        const currentIds = new Set(
          document.content.content.map((block) => String(block.attrs?.id)),
        );
        missing = alternative.proposal.scopeBlockIds.some(
          (id) => !currentIds.has(id),
        );
        if (!missing) {
          const result = this.proposals.createOrReuseBaseRevision({
            documentId: document.id,
            expectedDocumentVersion: input.expectedDocumentVersion!,
            revisionId: randomUUID(),
            createdAt: new Date().toISOString(),
          });
          if (result.kind === "stale") {
            return err(
              domainError("STALE_WRITE", "My Draft changed. Save and retry."),
            );
          }
          if (result.kind !== "ready") {
            return err(
              domainError("NOT_FOUND", "That document could not be found."),
            );
          }
          baseRevision = result.revision;
        }
      }

      const baseById = new Map(
        baseRevision.content.content.map((block) => [
          String(block.attrs?.id),
          block,
        ]),
      );
      const currentById = new Map(
        document.content.content.map((block) => [
          String(block.attrs?.id),
          block,
        ]),
      );
      let staleReason: DiffSnapshot["staleReason"] = missing
        ? "missing-target"
        : null;
      if (!staleReason) {
        for (const id of alternative.proposal.scopeBlockIds) {
          const base = baseById.get(id);
          const current = currentById.get(id);
          if (!base || !current) {
            staleReason = "missing-target";
            break;
          }
          if (hashReviewBlock(base) !== hashReviewBlock(current)) {
            staleReason = "changed-target";
            break;
          }
        }
      }
      const snapshot = this.diff.compare({
        snapshotId: randomUUID(),
        alternativeId: alternative.id,
        documentId: alternative.documentId,
        baseRevision,
        scopeBlockIds: alternative.proposal.scopeBlockIds,
        alternativeContent: alternative.content,
        alternativeContentHash: alternative.contentHash,
        status: staleReason ? "stale" : "current",
        staleReason,
        createdAt: new Date().toISOString(),
      });
      return ok(this.reviews.insert(snapshot));
    } catch {
      return err(
        domainError(
          "INVALID_REVIEW",
          "BranchWrite could not calculate this Review.",
        ),
      );
    }
  }

  latest(alternativeId: string): Result<DiffSnapshot, DomainError> {
    try {
      const snapshot = this.reviews.findLatest(alternativeId);
      return snapshot
        ? ok(snapshot)
        : err(domainError("NOT_FOUND", "No Review is available yet."));
    } catch {
      return err(
        domainError(
          "PERSISTENCE_FAILURE",
          "BranchWrite could not load this Review.",
        ),
      );
    }
  }
}
