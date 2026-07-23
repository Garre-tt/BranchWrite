"use client";

import { EditorContent, useEditor } from "@tiptap/react";
import { useCallback, useEffect, useRef, useState } from "react";

import { useDraftAutosave } from "@/client/use-draft-autosave";
import type { DraftDocument } from "@/domain/document/document-types";
import { pastedHtmlWasSimplified } from "@/editor/paste-normalization";
import {
  readCurrentEditorScope,
  ScopeDecorationExtension,
} from "@/editor/scope-decoration-extension";
import { createEditorExtensions } from "@/editor/schema";
import type { StructuredDocumentJson } from "@/editor/structured-content";
import { DraftToolbar } from "@/ui/draft/draft-toolbar";

export type SaveBarrier = () => Promise<boolean>;
export type GenerationSource = {
  prepareGeneration: () => Promise<{
    documentVersion: number;
    scopeBlockIds: readonly string[];
  } | null>;
};

type DraftEditorProps = {
  document: DraftDocument;
  onSaved: (document: DraftDocument) => void;
  registerSaveBarrier: (barrier: SaveBarrier | null) => void;
  registerGenerationSource: (source: GenerationSource | null) => void;
  onScopeChange: (blockIds: readonly string[]) => void;
};

const SAVE_STATUS_COPY = {
  clean: "Saved",
  dirty: "Unsaved changes",
  saving: "Saving…",
  error: "Save failed",
} as const;

export function DraftEditor({
  document: draftDocument,
  onSaved,
  registerSaveBarrier,
  registerGenerationSource,
  onScopeChange,
}: DraftEditorProps) {
  const [pasteNoticeVisible, setPasteNoticeVisible] = useState(false);
  const saveErrorRef = useRef<HTMLDivElement>(null);
  const stableOnSaved = useCallback(
    (saved: DraftDocument) => onSaved(saved),
    [onSaved],
  );
  const { controller, snapshot } = useDraftAutosave(
    draftDocument,
    stableOnSaved,
  );
  const editor = useEditor({
    immediatelyRender: false,
    extensions: createEditorExtensions([
      ScopeDecorationExtension.configure({
        onScopeChange: (scope) => onScopeChange(scope.blockIds),
      }),
    ]),
    content: draftDocument.content,
    editorProps: {
      attributes: {
        class: "draft-editor-content",
        "aria-label": "My Draft editor",
        "aria-multiline": "true",
        role: "textbox",
      },
      handlePaste: (_view, event) => {
        const html = event.clipboardData?.getData("text/html") ?? "";
        if (pastedHtmlWasSimplified(html)) {
          setPasteNoticeVisible(true);
        }
        return false;
      },
    },
    onUpdate: ({ editor: currentEditor }) => {
      controller.markDirty(currentEditor.getJSON() as StructuredDocumentJson);
    },
    onBlur: () => {
      void controller.flush();
    },
  });

  useEffect(() => {
    registerSaveBarrier(async () => {
      const saved = await controller.flush();
      if (!saved) {
        saveErrorRef.current?.focus();
      }
      return saved;
    });

    return () => registerSaveBarrier(null);
  }, [controller, registerSaveBarrier]);

  useEffect(() => {
    if (!editor) return;
    registerGenerationSource({
      prepareGeneration: async () => {
        const before = readCurrentEditorScope(editor.state).blockIds;
        const saved = await controller.flush();
        if (!saved) {
          saveErrorRef.current?.focus();
          return null;
        }
        const after = readCurrentEditorScope(editor.state).blockIds;
        if (
          before.length !== after.length ||
          before.some((id, index) => id !== after[index])
        ) {
          return null;
        }
        return {
          documentVersion: controller.getSnapshot().version,
          scopeBlockIds: after,
        };
      },
    });
    return () => registerGenerationSource(null);
  }, [controller, editor, registerGenerationSource]);

  useEffect(() => {
    const flushWhenHidden = () => {
      if (window.document.visibilityState === "hidden") {
        void controller.flush();
      }
    };
    const flushOnPageHide = () => {
      void controller.flush();
    };

    window.addEventListener("pagehide", flushOnPageHide);
    window.document.addEventListener("visibilitychange", flushWhenHidden);
    return () => {
      window.removeEventListener("pagehide", flushOnPageHide);
      window.document.removeEventListener("visibilitychange", flushWhenHidden);
    };
  }, [controller]);

  if (!editor) {
    return <div className="editor-loading">Preparing your draft…</div>;
  }

  return (
    <div className="draft-editor-shell">
      <DraftToolbar editor={editor} />
      {pasteNoticeVisible ? (
        <div className="inline-notice" role="status">
          <span>Some pasted formatting was simplified.</span>
          <button
            type="button"
            onClick={() => setPasteNoticeVisible(false)}
            aria-label="Dismiss formatting notice"
          >
            Dismiss
          </button>
        </div>
      ) : null}
      {snapshot.status === "error" ? (
        <div
          className="save-error"
          role="alert"
          tabIndex={-1}
          ref={saveErrorRef}
        >
          <div>
            <strong>Your changes are still in this editor.</strong>
            <p>{snapshot.errorMessage}</p>
          </div>
          <button type="button" onClick={() => void controller.flush()}>
            Retry save
          </button>
        </div>
      ) : null}
      <EditorContent editor={editor} />
      <div
        className={`save-status save-status-${snapshot.status}`}
        role="status"
        aria-live="polite"
      >
        <span aria-hidden="true" className="save-status-dot" />
        {SAVE_STATUS_COPY[snapshot.status]}
      </div>
    </div>
  );
}
