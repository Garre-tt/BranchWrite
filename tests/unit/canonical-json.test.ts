import { describe, expect, it } from "vitest";

import { canonicalizeStructuredContent } from "../../src/editor/canonical-json";
import { hashStructuredContent } from "../../src/editor/content-hash";

describe("canonical structured content", () => {
  it("produces the same canonical JSON and hash regardless of object key order", () => {
    const first = {
      type: "doc",
      content: [
        {
          type: "heading",
          attrs: { id: "opening", level: 2 },
          content: [{ type: "text", text: "Opening" }],
        },
      ],
    };
    const equivalent = {
      content: [
        {
          content: [{ text: "Opening", type: "text" }],
          attrs: { level: 2, id: "opening" },
          type: "heading",
        },
      ],
      type: "doc",
    };

    expect(canonicalizeStructuredContent(first)).toBe(
      canonicalizeStructuredContent(equivalent),
    );
    expect(hashStructuredContent(first)).toBe(
      hashStructuredContent(equivalent),
    );
  });

  it("normalizes omitted schema defaults before hashing", () => {
    const omittedDefault = {
      type: "doc",
      content: [
        {
          type: "orderedList",
          attrs: { id: "steps" },
          content: [
            {
              type: "listItem",
              content: [
                {
                  type: "paragraph",
                  content: [{ type: "text", text: "First step" }],
                },
              ],
            },
          ],
        },
      ],
    };
    const explicitDefault = {
      type: "doc",
      content: [
        {
          type: "orderedList",
          attrs: { start: 1, id: "steps" },
          content: [
            {
              type: "listItem",
              content: [
                {
                  type: "paragraph",
                  attrs: { id: null },
                  content: [{ type: "text", text: "First step" }],
                },
              ],
            },
          ],
        },
      ],
    };

    expect(hashStructuredContent(omittedDefault)).toBe(
      hashStructuredContent(explicitDefault),
    );
  });

  it("changes the SHA-256 hash when supported content changes", () => {
    const original = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          attrs: { id: "body" },
          content: [{ type: "text", text: "Original" }],
        },
      ],
    };
    const changed = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          attrs: { id: "body" },
          content: [{ type: "text", text: "Changed" }],
        },
      ],
    };

    expect(hashStructuredContent(original)).toMatch(/^[a-f0-9]{64}$/);
    expect(hashStructuredContent(original)).not.toBe(
      hashStructuredContent(changed),
    );
  });
});
