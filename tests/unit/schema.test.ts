import { describe, expect, it } from "vitest";

import { createEditorSchema } from "../../src/editor/schema";

describe("fixed editor schema", () => {
  it("contains exactly the supported nodes and marks", () => {
    const schema = createEditorSchema();

    expect(Object.keys(schema.nodes).sort()).toEqual(
      [
        "blockquote",
        "bulletList",
        "doc",
        "heading",
        "listItem",
        "orderedList",
        "paragraph",
        "text",
      ].sort(),
    );
    expect(Object.keys(schema.marks).sort()).toEqual(
      ["bold", "italic", "link"].sort(),
    );
  });
});
