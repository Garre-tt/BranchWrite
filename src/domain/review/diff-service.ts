import { canonicalize } from "json-canonicalize";
import { createHash } from "node:crypto";

import type { DraftRevision } from "@/domain/proposal/proposal-types";
import type { DiffSnapshot, ReviewBlock } from "@/domain/review/review-types";
import { REVIEW_ALGORITHM_VERSION } from "@/domain/review/review-types";
import { eligibleSentenceReplacement } from "@/domain/review/sentence-diff";
import { diffWords } from "@/domain/review/text-diff";
import type {
  StructuredDocumentJson,
  StructuredNodeJson,
} from "@/editor/structured-content";

export interface DiffService {
  compare(input: {
    snapshotId: string;
    alternativeId: string;
    documentId: string;
    baseRevision: DraftRevision;
    scopeBlockIds: readonly string[];
    alternativeContent: StructuredDocumentJson;
    alternativeContentHash: string;
    status: "current" | "stale";
    staleReason: DiffSnapshot["staleReason"];
    createdAt: string;
  }): DiffSnapshot;
}

export function textContent(node: StructuredNodeJson): string {
  if (node.type === "text") return node.text ?? "";
  return (node.content ?? []).map(textContent).join("");
}

export function hashReviewBlock(block: StructuredNodeJson): string {
  return createHash("sha256").update(canonicalize(block), "utf8").digest("hex");
}

function scopeHash(blocks: readonly StructuredNodeJson[]): string {
  return createHash("sha256")
    .update(canonicalize(blocks), "utf8")
    .digest("hex");
}

function classify(before: StructuredNodeJson, after: StructuredNodeJson) {
  if (canonicalize(before) === canonicalize(after)) return "unchanged" as const;
  const beforeText = textContent(before);
  const afterText = textContent(after);
  if (beforeText === afterText) return "formatting-only" as const;
  if (!beforeText && afterText) return "addition" as const;
  if (beforeText && !afterText) return "deletion" as const;
  return "replacement" as const;
}

export class DeterministicDiffService implements DiffService {
  compare(input: Parameters<DiffService["compare"]>[0]): DiffSnapshot {
    const baseById = new Map(
      input.baseRevision.content.content.map((block) => [
        String(block.attrs?.id),
        block,
      ]),
    );
    const alternativeById = new Map(
      input.alternativeContent.content.map((block) => [
        String(block.attrs?.id),
        block,
      ]),
    );
    const blocks: ReviewBlock[] = input.scopeBlockIds.map((id) => {
      const before = baseById.get(id);
      const after = alternativeById.get(id);
      if (!before || !after || before.type !== after.type) {
        throw new Error(`Review topology is invalid for block "${id}".`);
      }
      const beforeText = textContent(before);
      const afterText = textContent(after);
      const classification = classify(before, after);
      return {
        id,
        type: before.type,
        classification,
        blockHunkId: `block:${id}`,
        expectedTargetHash: hashReviewBlock(before),
        before: structuredClone(before),
        after: structuredClone(after),
        beforeText,
        afterText,
        wordChanges:
          classification === "replacement" ||
          classification === "addition" ||
          classification === "deletion"
            ? diffWords(beforeText, afterText)
            : [],
        sentenceReplacement:
          classification === "replacement"
            ? eligibleSentenceReplacement(
                id,
                before,
                after,
                beforeText,
                afterText,
              )
            : null,
      };
    });
    return {
      id: input.snapshotId,
      alternativeId: input.alternativeId,
      documentId: input.documentId,
      baseRevisionId: input.baseRevision.id,
      baseScopeHash: scopeHash(blocks.map((block) => block.before)),
      alternativeContentHash: input.alternativeContentHash,
      algorithmVersion: REVIEW_ALGORITHM_VERSION,
      status: input.status,
      staleReason: input.staleReason,
      blocks,
      createdAt: input.createdAt,
    };
  }
}
