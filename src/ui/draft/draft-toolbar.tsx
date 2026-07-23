"use client";

import type { Editor } from "@tiptap/core";
import { useEditorState } from "@tiptap/react";
import { useState } from "react";

type DraftToolbarProps = {
  editor: Editor;
  allowBlockStyles?: boolean;
};

function isSafeLink(href: string): boolean {
  try {
    return ["http:", "https:", "mailto:"].includes(new URL(href).protocol);
  } catch {
    return false;
  }
}

export function DraftToolbar({
  editor,
  allowBlockStyles = true,
}: DraftToolbarProps) {
  const [linkInputVisible, setLinkInputVisible] = useState(false);
  const [linkValue, setLinkValue] = useState("");
  const [linkError, setLinkError] = useState<string | null>(null);
  const editorState = useEditorState({
    editor,
    selector: ({ editor: currentEditor }) => ({
      isBold: currentEditor.isActive("bold"),
      isItalic: currentEditor.isActive("italic"),
      isLink: currentEditor.isActive("link"),
      isBulletList: currentEditor.isActive("bulletList"),
      isOrderedList: currentEditor.isActive("orderedList"),
      isBlockquote: currentEditor.isActive("blockquote"),
      headingLevel: ([1, 2, 3] as const).find((level) =>
        currentEditor.isActive("heading", { level }),
      ),
      canUndo: currentEditor.can().chain().focus().undo().run(),
      canRedo: currentEditor.can().chain().focus().redo().run(),
    }),
  });

  const blockValue = editorState.headingLevel
    ? `heading-${editorState.headingLevel}`
    : editorState.isBulletList
      ? "bullet-list"
      : editorState.isOrderedList
        ? "ordered-list"
        : editorState.isBlockquote
          ? "blockquote"
          : "paragraph";

  function applyBlockType(value: string) {
    const chain = editor.chain().focus();
    switch (value) {
      case "heading-1":
        chain.toggleHeading({ level: 1 }).run();
        break;
      case "heading-2":
        chain.toggleHeading({ level: 2 }).run();
        break;
      case "heading-3":
        chain.toggleHeading({ level: 3 }).run();
        break;
      case "bullet-list":
        chain.toggleBulletList().run();
        break;
      case "ordered-list":
        chain.toggleOrderedList().run();
        break;
      case "blockquote":
        chain.toggleBlockquote().run();
        break;
      default:
        chain.setParagraph().run();
    }
  }

  function openLinkInput() {
    const currentHref = editor.getAttributes("link").href;
    setLinkValue(typeof currentHref === "string" ? currentHref : "https://");
    setLinkError(null);
    setLinkInputVisible(true);
  }

  function applyLink() {
    const href = linkValue.trim();
    if (!isSafeLink(href)) {
      setLinkError("Use an http, https, or mailto link.");
      return;
    }

    editor.chain().focus().extendMarkRange("link").setLink({ href }).run();
    setLinkInputVisible(false);
    setLinkError(null);
  }

  return (
    <div className="draft-toolbar" aria-label="Draft formatting">
      {allowBlockStyles ? (
        <>
          <label className="sr-only" htmlFor="block-style">
            Block style
          </label>
          <select
            id="block-style"
            value={blockValue}
            onChange={(event) => applyBlockType(event.target.value)}
            aria-label="Block style"
          >
            <option value="paragraph">Paragraph</option>
            <option value="heading-1">Heading 1</option>
            <option value="heading-2">Heading 2</option>
            <option value="heading-3">Heading 3</option>
            <option value="bullet-list">Bullet list</option>
            <option value="ordered-list">Numbered list</option>
            <option value="blockquote">Blockquote</option>
          </select>
          <span className="toolbar-divider" aria-hidden="true" />
        </>
      ) : null}
      <button
        type="button"
        aria-label="Bold"
        aria-pressed={editorState.isBold}
        onClick={() => editor.chain().focus().toggleBold().run()}
      >
        <strong>B</strong>
      </button>
      <button
        type="button"
        aria-label="Italic"
        aria-pressed={editorState.isItalic}
        onClick={() => editor.chain().focus().toggleItalic().run()}
      >
        <em>I</em>
      </button>
      <button
        type="button"
        aria-label="Link"
        aria-pressed={editorState.isLink}
        onClick={openLinkInput}
      >
        Link
      </button>
      {editorState.isLink ? (
        <button
          type="button"
          onClick={() => editor.chain().focus().unsetLink().run()}
        >
          Remove link
        </button>
      ) : null}
      <span className="toolbar-spacer" />
      <button
        type="button"
        aria-label="Undo"
        disabled={!editorState.canUndo}
        onClick={() => editor.chain().focus().undo().run()}
      >
        Undo
      </button>
      <button
        type="button"
        aria-label="Redo"
        disabled={!editorState.canRedo}
        onClick={() => editor.chain().focus().redo().run()}
      >
        Redo
      </button>
      {linkInputVisible ? (
        <div className="link-editor">
          <label htmlFor="link-destination">Link destination</label>
          <input
            id="link-destination"
            value={linkValue}
            onChange={(event) => setLinkValue(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                applyLink();
              }
              if (event.key === "Escape") {
                setLinkInputVisible(false);
              }
            }}
          />
          <button type="button" onClick={applyLink}>
            Apply
          </button>
          <button type="button" onClick={() => setLinkInputVisible(false)}>
            Cancel
          </button>
          {linkError ? <p role="alert">{linkError}</p> : null}
        </div>
      ) : null}
    </div>
  );
}
