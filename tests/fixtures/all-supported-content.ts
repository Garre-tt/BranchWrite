import type { StructuredDocumentJson } from "../../src/editor/structured-content";

export const allSupportedContentFixture: StructuredDocumentJson = {
  type: "doc",
  content: [
    {
      type: "heading",
      attrs: { id: "heading-one", level: 1 },
      content: [{ type: "text", text: "A supported document" }],
    },
    {
      type: "heading",
      attrs: { id: "heading-two", level: 2 },
      content: [{ type: "text", text: "Formatting" }],
    },
    {
      type: "heading",
      attrs: { id: "heading-three", level: 3 },
      content: [{ type: "text", text: "Marks" }],
    },
    {
      type: "paragraph",
      attrs: { id: "marked-paragraph" },
      content: [
        { type: "text", text: "Plain, " },
        { type: "text", text: "bold", marks: [{ type: "bold" }] },
        { type: "text", text: ", " },
        { type: "text", text: "italic", marks: [{ type: "italic" }] },
        { type: "text", text: ", and " },
        {
          type: "text",
          text: "linked",
          marks: [
            {
              type: "link",
              attrs: { href: "https://example.com/reference" },
            },
          ],
        },
        { type: "text", text: " text." },
      ],
    },
    {
      type: "bulletList",
      attrs: { id: "bullet-list" },
      content: [
        {
          type: "listItem",
          content: [
            {
              type: "paragraph",
              content: [{ type: "text", text: "A bullet list item" }],
            },
          ],
        },
      ],
    },
    {
      type: "orderedList",
      attrs: { id: "ordered-list", start: 3 },
      content: [
        {
          type: "listItem",
          content: [
            {
              type: "paragraph",
              content: [{ type: "text", text: "An ordered list item" }],
            },
          ],
        },
      ],
    },
    {
      type: "blockquote",
      attrs: { id: "blockquote" },
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "A supported quotation block." }],
        },
      ],
    },
  ],
};
