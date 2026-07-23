import { describe, expect, it } from "vitest";

import { assertMatchingTopLevelTopology } from "@/domain/proposal/topology";
import { validateStructuredContent } from "@/editor/content-validation";

const original = validateStructuredContent({
  type: "doc",
  content: [
    {
      type: "paragraph",
      attrs: { id: "a" },
      content: [{ type: "text", text: "Before" }],
    },
  ],
}).json;

describe("Proposal topology validation", () => {
  it("allows content and mark edits", () => {
    const edited = structuredClone(original);
    edited.content[0]!.content = [
      { type: "text", text: "After", marks: [{ type: "bold" }] },
    ];
    expect(() =>
      assertMatchingTopLevelTopology(original, edited),
    ).not.toThrow();
  });

  it("rejects ID, type, count, and order changes", () => {
    const changedId = structuredClone(original);
    changedId.content[0]!.attrs!.id = "other";
    expect(() => assertMatchingTopLevelTopology(original, changedId)).toThrow();
  });
});
