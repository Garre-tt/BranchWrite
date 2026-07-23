import { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { z } from "zod";

import { createEditorSchema } from "./schema";
import type { StructuredDocumentJson } from "./structured-content";

const TOP_LEVEL_TYPES = new Set([
  "paragraph",
  "heading",
  "bulletList",
  "orderedList",
  "blockquote",
]);

const rawMarkSchema = z
  .object({
    type: z.string(),
    attrs: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();

const rawNodeSchema: z.ZodType = z.lazy(() =>
  z
    .object({
      type: z.string(),
      attrs: z.record(z.string(), z.unknown()).optional(),
      content: z.array(rawNodeSchema).optional(),
      marks: z.array(rawMarkSchema).optional(),
      text: z.string().optional(),
    })
    .strict(),
);

const optionalIdAttributesSchema = z
  .object({
    id: z.string().trim().min(1).nullable().optional(),
  })
  .strict()
  .optional();

const headingAttributesSchema = z
  .object({
    id: z.string().trim().min(1).nullable().optional(),
    level: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  })
  .strict();

const orderedListAttributesSchema = z
  .object({
    id: z.string().trim().min(1).nullable().optional(),
    start: z.number().int().positive().optional(),
  })
  .strict()
  .optional();

const linkMarkSchema = z
  .object({
    type: z.literal("link"),
    attrs: z
      .object({
        href: z.string().trim().min(1),
      })
      .strict(),
  })
  .strict();

const plainMarkSchema = z
  .object({
    type: z.union([z.literal("bold"), z.literal("italic")]),
  })
  .strict();

type RawMark = z.infer<typeof rawMarkSchema>;

type RawNode = {
  type: string;
  attrs?: Record<string, unknown>;
  content?: RawNode[];
  marks?: RawMark[];
  text?: string;
};

export class StructuredContentValidationError extends Error {
  readonly causeDetails: unknown;

  constructor(message: string, causeDetails?: unknown) {
    super(message);
    this.name = "StructuredContentValidationError";
    this.causeDetails = causeDetails;
  }
}

export type ValidatedStructuredContent = {
  json: StructuredDocumentJson;
  node: ProseMirrorNode;
};

function hasSafeLinkProtocol(href: string): boolean {
  try {
    const url = new URL(href);
    return ["http:", "https:", "mailto:"].includes(url.protocol);
  } catch {
    return false;
  }
}

function assertMarks(marks: RawMark[] | undefined): void {
  for (const mark of marks ?? []) {
    if (mark.type === "link") {
      const link = linkMarkSchema.parse(mark);
      if (!hasSafeLinkProtocol(link.attrs.href)) {
        throw new StructuredContentValidationError(
          `Unsupported link protocol in "${link.attrs.href}".`,
        );
      }
      continue;
    }

    plainMarkSchema.parse(mark);
  }
}

function assertNodeShape(node: RawNode): void {
  switch (node.type) {
    case "doc":
    case "listItem":
    case "text":
      z.undefined().parse(node.attrs);
      break;
    case "paragraph":
    case "bulletList":
    case "blockquote":
      optionalIdAttributesSchema.parse(node.attrs);
      break;
    case "heading":
      headingAttributesSchema.parse(node.attrs);
      break;
    case "orderedList":
      orderedListAttributesSchema.parse(node.attrs);
      break;
    default:
      throw new StructuredContentValidationError(
        `Unsupported node type "${node.type}".`,
      );
  }

  if (node.type === "text") {
    z.string().min(1).parse(node.text);
    z.undefined().parse(node.content);
    assertMarks(node.marks);
  } else {
    z.undefined().parse(node.text);
    z.undefined().parse(node.marks);
  }

  for (const child of node.content ?? []) {
    assertNodeShape(child);
  }
}

function assertTopLevelBlockIds(document: ProseMirrorNode): void {
  const ids = new Set<string>();

  document.forEach((block) => {
    if (!TOP_LEVEL_TYPES.has(block.type.name)) {
      throw new StructuredContentValidationError(
        `Unsupported top-level block type "${block.type.name}".`,
      );
    }

    const id: unknown = block.attrs.id;
    if (typeof id !== "string" || id.trim().length === 0) {
      throw new StructuredContentValidationError(
        "Every top-level block requires a stable ID.",
      );
    }

    if (ids.has(id)) {
      throw new StructuredContentValidationError(
        `Duplicate top-level block ID "${id}".`,
      );
    }

    ids.add(id);
  });
}

export function validateStructuredContent(
  input: unknown,
): ValidatedStructuredContent {
  try {
    const transportNode = rawNodeSchema.parse(input) as RawNode;
    assertNodeShape(transportNode);

    if (transportNode.type !== "doc") {
      throw new StructuredContentValidationError(
        'Structured content root must be a "doc" node.',
      );
    }

    const node = ProseMirrorNode.fromJSON(createEditorSchema(), transportNode);
    node.check();
    assertTopLevelBlockIds(node);

    return {
      json: node.toJSON() as StructuredDocumentJson,
      node,
    };
  } catch (error) {
    if (error instanceof StructuredContentValidationError) {
      throw error;
    }

    throw new StructuredContentValidationError(
      "Structured content does not match the BranchWrite schema.",
      error,
    );
  }
}
