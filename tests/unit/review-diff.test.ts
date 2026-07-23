import { describe, expect, it } from "vitest";

import { DeterministicDiffService } from "@/domain/review/diff-service";
import {
  eligibleSentenceReplacement,
  segmentSentences,
} from "@/domain/review/sentence-diff";
import { diffWords } from "@/domain/review/text-diff";
import { validateStructuredContent } from "@/editor/content-validation";

function paragraph(id: string, text: string, bold = false) {
  return {
    type: "paragraph",
    attrs: { id },
    content: text
      ? [{ type: "text", text, ...(bold ? { marks: [{ type: "bold" }] } : {}) }]
      : undefined,
  };
}

function compare(beforeBlocks: unknown[], afterBlocks: unknown[]) {
  const before = validateStructuredContent({
    type: "doc",
    content: beforeBlocks,
  }).json;
  const after = validateStructuredContent({
    type: "doc",
    content: afterBlocks,
  }).json;
  return new DeterministicDiffService().compare({
    snapshotId: "snapshot",
    alternativeId: "alternative",
    documentId: "document",
    baseRevision: {
      id: "revision",
      documentId: "document",
      parentRevisionId: null,
      content: before,
      contentHash: "hash",
      schemaVersion: "branchwrite-schema-v1",
      cause: "proposal_base",
      createdAt: "2026-01-01T00:00:00.000Z",
    },
    scopeBlockIds: before.content.map((block) => String(block.attrs?.id)),
    alternativeContent: after,
    alternativeContentHash: "alternative-hash",
    status: "current",
    staleReason: null,
    createdAt: "2026-01-01T00:00:00.000Z",
  });
}

describe("Review diff", () => {
  it("classifies unchanged, formatting-only, additions, deletions, and replacements", () => {
    const result = compare(
      [
        paragraph("same", "Same"),
        paragraph("format", "Bold"),
        paragraph("add", ""),
        paragraph("delete", "Remove"),
        paragraph("replace", "Before"),
      ],
      [
        paragraph("same", "Same"),
        paragraph("format", "Bold", true),
        paragraph("add", "Added"),
        paragraph("delete", ""),
        paragraph("replace", "After"),
      ],
    );
    expect(result.blocks.map((block) => block.classification)).toEqual([
      "unchanged",
      "formatting-only",
      "addition",
      "deletion",
      "replacement",
    ]);
  });

  it("creates sentence acceptance only for an unambiguous one-to-one paragraph replacement", () => {
    const result = compare(
      [paragraph("a", "Keep this. Change this sentence. Keep that.")],
      [paragraph("a", "Keep this. Replace this sentence. Keep that.")],
    );
    expect(result.blocks[0]?.sentenceReplacement).toMatchObject({
      before: "Change this sentence.",
      after: "Replace this sentence.",
    });
    expect(
      eligibleSentenceReplacement(
        "a",
        paragraph("a", "Dr. Smith writes.") as never,
        paragraph("a", "Dr. Smith edits.") as never,
        "Dr. Smith writes.",
        "Dr. Smith edits.",
      ),
    ).toBeNull();
  });

  it("segments deterministically and emits semantic word operations", () => {
    expect(segmentSentences("One. Two?")).toHaveLength(2);
    expect(diffWords("clear draft", "concise draft")).toEqual([
      { kind: "delete", text: "clear" },
      { kind: "insert", text: "concise" },
      { kind: "equal", text: " draft" },
    ]);
  });
});
