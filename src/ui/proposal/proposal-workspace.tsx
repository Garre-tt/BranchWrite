"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useRef, useState } from "react";

import {
  generateProposal,
  listAlternatives,
  loadAlternative,
} from "@/client/api-client";
import { alternativeKeys } from "@/client/query-keys";
import {
  QUICK_ACTIONS,
  type Alternative,
} from "@/domain/proposal/proposal-types";
import type { GenerationSource } from "@/ui/draft/draft-editor";
import {
  AlternativeEditor,
  type AlternativeSaveBarrier,
} from "@/ui/proposal/alternative-editor";

type GenerationState =
  | { kind: "idle"; message: null }
  | { kind: "generating"; message: null }
  | { kind: "error" | "cancelled"; message: string };

export function ProposalWorkspace({
  documentId,
  scopeBlockIds,
  getGenerationSource,
  registerSaveBarrier,
}: {
  documentId: string;
  scopeBlockIds: readonly string[];
  getGenerationSource: () => GenerationSource | undefined;
  registerSaveBarrier: (barrier: AlternativeSaveBarrier | null) => void;
}) {
  const queryClient = useQueryClient();
  const [prompt, setPrompt] = useState("");
  const [selected, setSelected] = useState<Alternative | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [generationState, setGenerationState] = useState<GenerationState>({
    kind: "idle",
    message: null,
  });
  const [selectionError, setSelectionError] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const alternativeBarrierRef = useRef<AlternativeSaveBarrier | null>(null);
  const alternativesQuery = useQuery({
    queryKey: alternativeKeys.list(documentId),
    queryFn: () => listAlternatives(documentId),
  });

  const handleAlternativeSaved = useCallback(
    (saved: Alternative) => {
      setSelected(saved);
      queryClient.setQueryData(alternativeKeys.detail(saved.id), saved);
      void queryClient.invalidateQueries({
        queryKey: alternativeKeys.list(documentId),
      });
    },
    [documentId, queryClient],
  );

  async function runGeneration() {
    if (
      alternativeBarrierRef.current &&
      !(await alternativeBarrierRef.current())
    ) {
      setGenerationState({
        kind: "error",
        message:
          "Save the current Alternative successfully before generating another.",
      });
      return;
    }
    const source = getGenerationSource();
    if (!source) {
      setGenerationState({
        kind: "error",
        message: "My Draft is not ready for generation.",
      });
      return;
    }
    setGenerationState({ kind: "generating", message: null });
    const prepared = await source.prepareGeneration();
    if (!prepared) {
      setGenerationState({
        kind: "error",
        message:
          "Generation is blocked until My Draft saves successfully and the scope remains selected.",
      });
      return;
    }

    const controller = new AbortController();
    abortControllerRef.current = controller;
    try {
      const alternative = await generateProposal(
        {
          documentId,
          expectedDocumentVersion: prepared.documentVersion,
          scopeBlockIds: prepared.scopeBlockIds,
          prompt,
        },
        controller.signal,
      );
      setSelected(alternative);
      queryClient.setQueryData(
        alternativeKeys.detail(alternative.id),
        alternative,
      );
      await queryClient.invalidateQueries({
        queryKey: alternativeKeys.list(documentId),
      });
      setGenerationState({ kind: "idle", message: null });
    } catch (error) {
      if (controller.signal.aborted) {
        setGenerationState({
          kind: "cancelled",
          message:
            "Generation was cancelled. The current Alternative and My Draft were not changed.",
        });
      } else {
        setGenerationState({
          kind: "error",
          message:
            error instanceof Error
              ? error.message
              : "Generation failed. My Draft was not changed.",
        });
      }
    } finally {
      if (abortControllerRef.current === controller) {
        abortControllerRef.current = null;
      }
    }
  }

  async function selectAlternative(alternativeId: string) {
    setSelectionError(null);
    if (alternativeBarrierRef.current) {
      const saved = await alternativeBarrierRef.current();
      if (!saved) {
        setSelectionError(
          "Save this Alternative successfully before opening another.",
        );
        return;
      }
    }
    try {
      const alternative = await queryClient.fetchQuery({
        queryKey: alternativeKeys.detail(alternativeId),
        queryFn: () => loadAlternative(alternativeId),
      });
      setSelected(alternative);
      setDrawerOpen(false);
    } catch (error) {
      setSelectionError(
        error instanceof Error
          ? error.message
          : "This Alternative could not be opened.",
      );
    }
  }

  return (
    <section className="proposal-panel" aria-labelledby="proposal-heading">
      <div className="panel-heading proposal-panel-heading">
        <div>
          <p className="panel-kicker">Separate workspace</p>
          <h2 id="proposal-heading">Proposal Workspace</h2>
        </div>
        <div className="proposal-heading-actions">
          <span className="demo-badge">Demo mode</span>
          <button
            type="button"
            className="button-secondary"
            aria-expanded={drawerOpen}
            onClick={() => setDrawerOpen((open) => !open)}
          >
            Alternatives ({alternativesQuery.data?.length ?? 0})
          </button>
        </div>
      </div>

      <div className="prompt-composer">
        <div className="scope-summary" aria-live="polite">
          <strong>Scope</strong>
          <span>
            {scopeBlockIds.length === 1
              ? "1 complete block"
              : `${scopeBlockIds.length} complete blocks`}
          </span>
        </div>
        <label htmlFor={`proposal-prompt-${documentId}`}>Instruction</label>
        <textarea
          id={`proposal-prompt-${documentId}`}
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          placeholder="Describe how to rewrite the highlighted scope"
          disabled={generationState.kind === "generating"}
        />
        <div className="quick-actions" aria-label="Quick actions">
          {QUICK_ACTIONS.map((action) => (
            <button
              type="button"
              key={action}
              onClick={() => setPrompt(action)}
              disabled={generationState.kind === "generating"}
            >
              {action}
            </button>
          ))}
        </div>
        <div className="composer-actions">
          {generationState.kind === "generating" ? (
            <button
              type="button"
              className="button-danger"
              onClick={() => abortControllerRef.current?.abort()}
            >
              Cancel generation
            </button>
          ) : (
            <button
              type="button"
              className="button-primary"
              disabled={!prompt.trim() || scopeBlockIds.length === 0}
              onClick={() => void runGeneration()}
            >
              Generate Alternative
            </button>
          )}
          {generationState.kind === "generating" ? (
            <span role="status">Generating deterministic demo content…</span>
          ) : null}
        </div>
        {generationState.message ? (
          <div
            className={
              generationState.kind === "cancelled"
                ? "generation-notice"
                : "generation-error"
            }
            role="alert"
          >
            {generationState.message}
          </div>
        ) : null}
      </div>

      {drawerOpen ? (
        <aside
          className="alternatives-drawer"
          aria-label="Alternatives history"
        >
          <div className="drawer-heading">
            <div>
              <strong>Alternatives</strong>
              <small>Oldest to newest</small>
            </div>
            <button
              type="button"
              aria-label="Close Alternatives"
              onClick={() => setDrawerOpen(false)}
            >
              ×
            </button>
          </div>
          {alternativesQuery.isLoading ? (
            <p>Loading Alternatives…</p>
          ) : alternativesQuery.data?.length ? (
            <ol>
              {alternativesQuery.data.map((alternative) => (
                <li key={alternative.id}>
                  <button
                    type="button"
                    aria-current={
                      selected?.id === alternative.id ? "true" : undefined
                    }
                    onClick={() => void selectAlternative(alternative.id)}
                  >
                    <strong>{alternative.label}</strong>
                    <span>{alternative.prompt}</span>
                    <small>
                      {new Intl.DateTimeFormat(undefined, {
                        dateStyle: "medium",
                        timeStyle: "short",
                      }).format(new Date(alternative.createdAt))}
                      {alternative.isEdited ? " · Edited" : ""}
                    </small>
                  </button>
                </li>
              ))}
            </ol>
          ) : (
            <p>No completed Alternatives yet.</p>
          )}
          {selectionError ? <p role="alert">{selectionError}</p> : null}
        </aside>
      ) : null}

      {selected ? (
        <div className="alternative-workspace">
          <div className="alternative-context">
            <div>
              <span>Alternative</span>
              <strong>{selected.proposal.label}</strong>
            </div>
            <p title={selected.proposal.prompt}>{selected.proposal.prompt}</p>
            <span className="immutable-note">
              Proposal original is immutable
            </span>
          </div>
          <AlternativeEditor
            key={selected.id}
            alternative={selected}
            onSaved={handleAlternativeSaved}
            registerSaveBarrier={(barrier) => {
              alternativeBarrierRef.current = barrier;
              registerSaveBarrier(barrier);
            }}
          />
        </div>
      ) : (
        <div className="proposal-empty">
          <div className="proposal-empty-mark" aria-hidden="true">
            ↗
          </div>
          <h3>No Alternative selected</h3>
          <p>
            Generate from the highlighted scope or reopen a completed
            Alternative. My Draft remains authoritative.
          </p>
        </div>
      )}
    </section>
  );
}
