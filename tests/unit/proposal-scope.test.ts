import { describe, expect, it } from "vitest";

import {
  resolveEditorScope,
  resolvePersistedScope,
} from "@/domain/proposal/scope";
import { validateStructuredContent } from "@/editor/content-validation";

const content = validateStructuredContent({
  type: "doc",
  content: [
    {
      type: "paragraph",
      attrs: { id: "a" },
      content: [{ type: "text", text: "One" }],
    },
    {
      type: "paragraph",
      attrs: { id: "b" },
      content: [{ type: "text", text: "Two" }],
    },
    {
      type: "heading",
      attrs: { id: "c", level: 2 },
      content: [{ type: "text", text: "Three" }],
    },
  ],
});

describe("Proposal scope resolution", () => {
  it("resolves cursor and selections to complete top-level blocks", () => {
    expect(resolveEditorScope(content.node, 2, 2).blockIds).toEqual(["a"]);
    expect(resolveEditorScope(content.node, 2, 8).blockIds).toEqual(["a", "b"]);
  });

  it("does not include the next block at an exact end boundary", () => {
    const firstEnd = content.node.child(0).nodeSize;
    expect(resolveEditorScope(content.node, 2, firstEnd).blockIds).toEqual([
      "a",
    ]);
  });

  it("naturally resolves Select All and the document-end cursor", () => {
    expect(
      resolveEditorScope(content.node, 0, content.node.content.size).blockIds,
    ).toEqual(["a", "b", "c"]);
    expect(
      resolveEditorScope(
        content.node,
        content.node.content.size,
        content.node.content.size,
      ).blockIds,
    ).toEqual(["c"]);
  });

  it("re-resolves an exact contiguous scope from persisted content", () => {
    expect(resolvePersistedScope(content.json, ["b", "c"]).blockIds).toEqual([
      "b",
      "c",
    ]);
    expect(() => resolvePersistedScope(content.json, ["a", "c"])).toThrow();
  });
});
