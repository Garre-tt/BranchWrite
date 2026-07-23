"use client";

import { useEffect, useState } from "react";

import { saveAlternativeContent } from "@/client/api-client";
import {
  AutosaveController,
  type AutosaveSnapshot,
} from "@/client/autosave-controller";
import type { Alternative } from "@/domain/proposal/proposal-types";
import type { StructuredDocumentJson } from "@/editor/structured-content";

export function useAlternativeAutosave(
  alternative: Alternative,
  onSaved: (alternative: Alternative) => void,
) {
  const [controller] = useState(
    () =>
      new AutosaveController<StructuredDocumentJson>({
        initialVersion: alternative.contentVersion,
        initialContentHash: alternative.contentHash,
        debounceMs: 500,
        save: async (content, expectedVersion) => {
          const saved = await saveAlternativeContent({
            alternativeId: alternative.id,
            content,
            expectedVersion,
          });
          onSaved(saved);
          return {
            version: saved.contentVersion,
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
