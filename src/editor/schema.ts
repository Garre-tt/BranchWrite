import { getSchema, type Extensions } from "@tiptap/core";
import Blockquote from "@tiptap/extension-blockquote";
import Bold from "@tiptap/extension-bold";
import BulletList from "@tiptap/extension-bullet-list";
import Document from "@tiptap/extension-document";
import Heading from "@tiptap/extension-heading";
import History from "@tiptap/extension-history";
import Italic from "@tiptap/extension-italic";
import Link from "@tiptap/extension-link";
import ListItem from "@tiptap/extension-list-item";
import OrderedList from "@tiptap/extension-ordered-list";
import Paragraph from "@tiptap/extension-paragraph";
import Text from "@tiptap/extension-text";

import { BlockIdExtension } from "./block-id-extension";
import { HISTORY_DEPTH, HISTORY_NEW_GROUP_DELAY_MS } from "./history-config";

const blockIdAttribute = {
  default: null,
  parseHTML: (element: HTMLElement) => element.getAttribute("data-block-id"),
  renderHTML: (attributes: Record<string, unknown>) => {
    const id = attributes.id;

    return typeof id === "string" && id.length > 0
      ? { "data-block-id": id }
      : {};
  },
};

const BranchWriteParagraph = Paragraph.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      id: blockIdAttribute,
    };
  },
});

const BranchWriteHeading = Heading.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      id: blockIdAttribute,
    };
  },
}).configure({ levels: [1, 2, 3] });

const BranchWriteBulletList = BulletList.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      id: blockIdAttribute,
    };
  },
});

const BranchWriteOrderedList = OrderedList.extend({
  addAttributes() {
    return {
      start: {
        default: 1,
        parseHTML: (element: HTMLElement) =>
          element.hasAttribute("start")
            ? Number.parseInt(element.getAttribute("start") ?? "1", 10)
            : 1,
      },
      id: blockIdAttribute,
    };
  },
});

const BranchWriteBlockquote = Blockquote.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      id: blockIdAttribute,
    };
  },
});

const BranchWriteLink = Link.extend({
  addAttributes() {
    return {
      href: {
        default: null,
      },
    };
  },
}).configure({
  autolink: false,
  linkOnPaste: false,
  openOnClick: false,
  protocols: ["http", "https", "mailto"],
});

export function createEditorExtensions(
  additional: Extensions = [],
): Extensions {
  return [
    Document,
    BranchWriteParagraph,
    Text,
    BranchWriteHeading,
    BranchWriteBulletList,
    BranchWriteOrderedList,
    ListItem,
    BranchWriteBlockquote,
    Bold,
    Italic,
    BranchWriteLink,
    History.configure({
      depth: HISTORY_DEPTH,
      newGroupDelay: HISTORY_NEW_GROUP_DELAY_MS,
    }),
    BlockIdExtension,
    ...additional,
  ];
}

export function createEditorSchema() {
  return getSchema(createEditorExtensions());
}
