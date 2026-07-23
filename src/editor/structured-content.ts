export type StructuredMarkJson =
  | {
      type: "bold" | "italic";
    }
  | {
      type: "link";
      attrs: {
        href: string;
      };
    };

export type StructuredNodeJson = {
  type: string;
  attrs?: Record<string, unknown>;
  content?: StructuredNodeJson[];
  marks?: StructuredMarkJson[];
  text?: string;
};

export type StructuredDocumentJson = StructuredNodeJson & {
  type: "doc";
  content: StructuredNodeJson[];
};
