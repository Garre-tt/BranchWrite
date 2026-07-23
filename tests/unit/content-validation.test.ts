import { describe, expect, it } from "vitest";

import {
  StructuredContentValidationError,
  validateStructuredContent,
} from "../../src/editor/content-validation";
import { allSupportedContentFixture } from "../fixtures/all-supported-content";

describe("validateStructuredContent", () => {
  it("accepts a fixture containing every supported block and mark", () => {
    const result = validateStructuredContent(allSupportedContentFixture);

    expect(result.json.type).toBe("doc");
    expect(result.node.childCount).toBe(7);
    expect(result.node.textContent).toContain("bold");
    expect(result.node.textContent).toContain("An ordered list item");
  });

  it("rejects unsupported nodes before persistence", () => {
    const unsupported = {
      type: "doc",
      content: [
        {
          type: "table",
          attrs: { id: "unsupported-table" },
        },
      ],
    };

    expect(() => validateStructuredContent(unsupported)).toThrow(
      StructuredContentValidationError,
    );
  });

  it("rejects unsupported attributes and unsafe links", () => {
    const arbitraryAttribute = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          attrs: { id: "paragraph", class: "external-style" },
          content: [{ type: "text", text: "Styled" }],
        },
      ],
    };
    const unsafeLink = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          attrs: { id: "paragraph" },
          content: [
            {
              type: "text",
              text: "Unsafe",
              marks: [
                {
                  type: "link",
                  attrs: { href: "javascript:alert(1)" },
                },
              ],
            },
          ],
        },
      ],
    };

    expect(() => validateStructuredContent(arbitraryAttribute)).toThrow(
      StructuredContentValidationError,
    );
    expect(() => validateStructuredContent(unsafeLink)).toThrow(
      /Unsupported link protocol/,
    );
  });

  it("requires unique stable IDs on every top-level block", () => {
    const missingId = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "Missing an ID" }],
        },
      ],
    };
    const duplicateIds = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          attrs: { id: "same-id" },
          content: [{ type: "text", text: "First" }],
        },
        {
          type: "blockquote",
          attrs: { id: "same-id" },
          content: [
            {
              type: "paragraph",
              content: [{ type: "text", text: "Second" }],
            },
          ],
        },
      ],
    };

    expect(() => validateStructuredContent(missingId)).toThrow(
      /requires a stable ID/,
    );
    expect(() => validateStructuredContent(duplicateIds)).toThrow(
      /Duplicate top-level block ID/,
    );
  });

  it("rejects headings outside levels one through three", () => {
    const levelFour = {
      type: "doc",
      content: [
        {
          type: "heading",
          attrs: { id: "heading", level: 4 },
          content: [{ type: "text", text: "Unsupported heading" }],
        },
      ],
    };

    expect(() => validateStructuredContent(levelFour)).toThrow(
      StructuredContentValidationError,
    );
  });
});
