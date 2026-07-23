"use client";

import { useEffect, useState } from "react";

import {
  AutosaveController,
  type AutosaveSnapshot,
} from "@/client/autosave-controller";
import { saveDocumentContent } from "@/client/api-client";
import type { DraftDocument } from "@/domain/document/document-types";
import type { StructuredDocumentJson } from "@/editor/structured-content";

export function useDraftAutosave(
  document: DraftDocument,
  onSaved: (document: DraftDocument) => void,
) {
  const [controller] = useState(
    () =>
      new AutosaveController<StructuredDocumentJson>({
        initialVersion: document.currentVersion,
        initialContentHash: document.contentHash,
        debounceMs: 750,
        save: async (content, expectedVersion) => {
          const saved = await saveDocumentContent({
            documentId: document.id,
            content,
            expectedVersion,
          });
          onSaved(saved);
          return {
            version: saved.currentVersion,
            contentHash: saved.contentHash,
          };
        },
      }),
  );
  const [snapshot, setSnapshot] = useState<AutosaveSnapshot>(
    controller.getSnapshot(),
  );

  useEffect(() => {
    const unsubscribe = controller.subscribe(setSnapshot);
    return () => {
      unsubscribe();
      controller.dispose();
    };
  }, [controller]);

  return { controller, snapshot };
}
