"use client";

import { EditorContent, useEditor } from "@tiptap/react";
import { useCallback, useEffect, useState } from "react";

import { useAlternativeAutosave } from "@/client/use-alternative-autosave";
import type { Alternative } from "@/domain/proposal/proposal-types";
import { topLevelSignature } from "@/domain/proposal/topology";
import { createEditorExtensions } from "@/editor/schema";
import type { StructuredDocumentJson } from "@/editor/structured-content";
import { TopologyGuardExtension } from "@/editor/topology-guard-extension";
import { DraftToolbar } from "@/ui/draft/draft-toolbar";

export type AlternativeSaveBarrier = () => Promise<boolean>;

export function AlternativeEditor({
  alternative,
  onSaved,
  registerSaveBarrier,
  onDirty,
}: {
  alternative: Alternative;
  onSaved: (alternative: Alternative) => void;
  registerSaveBarrier: (barrier: AlternativeSaveBarrier | null) => void;
  onDirty: () => void;
}) {
  const [topologyNotice, setTopologyNotice] = useState(false);
  const stableOnSaved = useCallback(
    (saved: Alternative) => onSaved(saved),
    [onSaved],
  );
  const { controller, snapshot } = useAlternativeAutosave(
    alternative,
    stableOnSaved,
  );
  const editor = useEditor({
    immediatelyRender: false,
    extensions: createEditorExtensions([
      TopologyGuardExtension.configure({
        expected: topLevelSignature(alternative.proposal.content),
        onRejected: () => setTopologyNotice(true),
      }),
    ]),
    content: alternative.content,
    editorProps: {
      attributes: {
        class: "draft-editor-content alternative-editor-content",
        "aria-label": "Alternative editor",
        "aria-multiline": "true",
        role: "textbox",
      },
    },
    onUpdate: ({ editor: currentEditor }) => {
      onDirty();
      controller.markDirty(currentEditor.getJSON() as StructuredDocumentJson);
    },
    onBlur: () => void controller.flush(),
  });

  useEffect(() => {
    registerSaveBarrier(() => controller.flush());
    return () => registerSaveBarrier(null);
  }, [controller, registerSaveBarrier]);

  useEffect(() => {
    const flushWhenHidden = () => {
      if (window.document.visibilityState === "hidden") {
        void controller.flush();
      }
    };
    const flushOnPageHide = () => void controller.flush();
    window.addEventListener("pagehide", flushOnPageHide);
    window.document.addEventListener("visibilitychange", flushWhenHidden);
    return () => {
      window.removeEventListener("pagehide", flushOnPageHide);
      window.document.removeEventListener("visibilitychange", flushWhenHidden);
    };
  }, [controller]);

  if (!editor)
    return <div className="editor-loading">Opening Alternative…</div>;

  return (
    <div className="draft-editor-shell alternative-editor-shell">
      <DraftToolbar editor={editor} allowBlockStyles={false} />
      {topologyNotice ? (
        <div className="inline-notice" role="status">
          <span>
            Alternative editing keeps the selected block structure fixed.
          </span>
          <button type="button" onClick={() => setTopologyNotice(false)}>
            Dismiss
          </button>
        </div>
      ) : null}
      {snapshot.status === "error" ? (
        <div className="save-error" role="alert">
          <div>
            <strong>Your Alternative edits are still in this editor.</strong>
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
      >
        <span aria-hidden="true" className="save-status-dot" />
        {snapshot.status === "clean"
          ? alternative.isEdited || snapshot.version > 0
            ? "Edited · Saved"
            : "Saved"
          : snapshot.status === "dirty"
            ? "Edited · Unsaved"
            : snapshot.status === "saving"
              ? "Saving…"
              : "Save failed"}
      </div>
    </div>
  );
}
