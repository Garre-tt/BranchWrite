import { EditorState } from "@tiptap/pm/state";
import { describe, expect, it } from "vitest";

import { assignMissingTopLevelBlockIds } from "../../src/editor/block-id-extension";
import { createEditorSchema } from "../../src/editor/schema";

describe("top-level block IDs", () => {
  it("assigns IDs to missing and duplicate blocks while preserving the first ID", () => {
    const schema = createEditorSchema();
    const document = schema.nodeFromJSON({
      type: "doc",
      content: [
        {
          type: "paragraph",
          attrs: { id: "stable" },
          content: [{ type: "text", text: "First" }],
        },
        {
          type: "heading",
          attrs: { id: "stable", level: 2 },
          content: [{ type: "text", text: "Duplicate" }],
        },
        {
          type: "blockquote",
          attrs: { id: null },
          content: [
            {
              type: "paragraph",
              content: [{ type: "text", text: "Missing" }],
            },
          ],
        },
      ],
    });
    const transaction = EditorState.create({ schema, doc: document }).tr;
    const generatedIds = ["generated-heading", "generated-quote"];

    expect(
      assignMissingTopLevelBlockIds(
        transaction,
        () => generatedIds.shift() ?? "fallback",
      ),
    ).toBe(true);

    const ids: unknown[] = [];
    transaction.doc.forEach((block) => ids.push(block.attrs.id));
    expect(ids).toEqual(["stable", "generated-heading", "generated-quote"]);
  });

  it("does not churn valid existing IDs", () => {
    const schema = createEditorSchema();
    const document = schema.nodeFromJSON({
      type: "doc",
      content: [
        {
          type: "paragraph",
          attrs: { id: "first" },
          content: [{ type: "text", text: "First" }],
        },
        {
          type: "paragraph",
          attrs: { id: "second" },
          content: [{ type: "text", text: "Second" }],
        },
      ],
    });
    const transaction = EditorState.create({ schema, doc: document }).tr;

    expect(assignMissingTopLevelBlockIds(transaction, () => "unused")).toBe(
      false,
    );
    expect(transaction.docChanged).toBe(false);
  });
});
