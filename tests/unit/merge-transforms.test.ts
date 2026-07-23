import { describe, expect, it } from "vitest";

import { applySentenceMerge } from "@/domain/merge/merge-transforms";
import { DeterministicDiffService } from "@/domain/review/diff-service";
import { validateStructuredContent } from "@/editor/content-validation";

describe("sentence Merge transform", () => {
  it("transfers the reviewed sentence with its supported marks", () => {
    const before = validateStructuredContent({
      type: "doc",
      content: [
        {
          type: "paragraph",
          attrs: { id: "a" },
          content: [{ type: "text", text: "Old sentence." }],
        },
      ],
    }).json;
    const after = validateStructuredContent({
      type: "doc",
      content: [
        {
          type: "paragraph",
          attrs: { id: "a" },
          content: [
            {
              type: "text",
              text: "New sentence.",
              marks: [{ type: "bold" }],
            },
          ],
        },
      ],
    }).json;
    const snapshot = new DeterministicDiffService().compare({
      snapshotId: "s",
      alternativeId: "a",
      documentId: "d",
      baseRevision: {
        id: "r",
        documentId: "d",
        parentRevisionId: null,
        content: before,
        contentHash: "h",
        schemaVersion: "branchwrite-schema-v1",
        cause: "proposal_base",
        createdAt: "2026-01-01T00:00:00.000Z",
      },
      scopeBlockIds: ["a"],
      alternativeContent: after,
      alternativeContentHash: "ah",
      status: "current",
      staleReason: null,
      createdAt: "2026-01-01T00:00:00.000Z",
    });
    const merged = applySentenceMerge(before, snapshot.blocks[0]!);
    expect(merged.content[0]?.content?.[0]?.marks).toEqual([{ type: "bold" }]);
  });
});
