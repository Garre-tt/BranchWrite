"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";

import {
  applyMerge,
  createReview,
  generateProposal,
  listAlternatives,
  loadAlternative,
  revertLatestMerge,
} from "@/client/api-client";
import { alternativeKeys } from "@/client/query-keys";
import {
  QUICK_ACTIONS,
  type Alternative,
} from "@/domain/proposal/proposal-types";
import type { DiffSnapshot } from "@/domain/review/review-types";
import type { ReviewBlock } from "@/domain/review/review-types";
import type { DraftDocument } from "@/domain/document/document-types";
import type { GenerationSource } from "@/ui/draft/draft-editor";
import {
  AlternativeEditor,
  type AlternativeSaveBarrier,
} from "@/ui/proposal/alternative-editor";
import { ReviewRenderer } from "@/ui/review/review-renderer";

type GenerationState =
  | { kind: "idle"; message: null }
  | { kind: "generating"; message: null }
  | { kind: "error" | "cancelled"; message: string };

export function ProposalWorkspace({
  documentId,
  scopeBlockIds,
  getGenerationSource,
  registerSaveBarrier,
  document,
  onAuthoritativeDocument,
}: {
  documentId: string;
  scopeBlockIds: readonly string[];
  getGenerationSource: () => GenerationSource | undefined;
  registerSaveBarrier: (barrier: AlternativeSaveBarrier | null) => void;
  document: DraftDocument;
  onAuthoritativeDocument: (
    document: DraftDocument,
    affectedBlockIds: readonly string[],
  ) => void;
}) {
  const queryClient = useQueryClient();
  const [prompt, setPrompt] = useState("");
  const [selected, setSelected] = useState<Alternative | null>(null);
  const [mode, setMode] = useState<"review" | "edit">("review");
  const [review, setReview] = useState<DiffSnapshot | null>(null);
  const [reviewStatus, setReviewStatus] = useState<
    "idle" | "updating" | "error"
  >("idle");
  const reviewRequestRef = useRef(0);
  const [mergeError, setMergeError] = useState<string | null>(null);
  const [sectionOpen, setSectionOpen] = useState(false);
  const [sectionAcknowledged, setSectionAcknowledged] = useState(false);
  const [revertEligible, setRevertEligible] = useState(false);
  const [revertHash, setRevertHash] = useState<string | null>(null);
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

  const calculateReview = useCallback(
    async (
      alternative: Alternative,
      againstCurrentDraft = false,
      expectedDocumentVersion?: number,
    ) => {
      const requestId = ++reviewRequestRef.current;
      setReviewStatus("updating");
      try {
        const snapshot = await createReview(alternative.id, {
          againstCurrentDraft,
          ...(expectedDocumentVersion === undefined
            ? {}
            : { expectedDocumentVersion }),
        });
        if (reviewRequestRef.current === requestId) {
          setReview(snapshot);
          setReviewStatus("idle");
        }
      } catch {
        if (reviewRequestRef.current === requestId) setReviewStatus("error");
      }
    },
    [],
  );

  useEffect(() => {
    if (!selected) return;
    const timer = window.setTimeout(() => void calculateReview(selected), 0);
    return () => window.clearTimeout(timer);
  }, [calculateReview, selected]);

  async function accept(
    blocks: readonly ReviewBlock[],
    kind: "block" | "sentence" | "section",
  ) {
    if (!selected || !review) return;
    setMergeError(null);
    const alternativeSaved =
      !alternativeBarrierRef.current || (await alternativeBarrierRef.current());
    const draftPrepared =
      alternativeSaved && (await getGenerationSource()?.prepareGeneration());
    if (!draftPrepared) {
      setMergeError("Save My Draft and the Alternative before accepting.");
      return;
    }
    try {
      const result = await applyMerge({
        documentId,
        alternativeId: selected.id,
        diffSnapshotId: review.id,
        hunkIds:
          kind === "section"
            ? blocks.map((block) => block.blockHunkId)
            : [
                kind === "sentence"
                  ? blocks[0]!.sentenceReplacement!.id
                  : blocks[0]!.blockHunkId,
              ],
        expectedTargets: blocks.map((block) => ({
          blockId: block.id,
          beforeHash: block.expectedTargetHash,
        })),
        acceptanceKind: kind,
        sectionReviewAcknowledged: kind === "section" && sectionAcknowledged,
      });
      onAuthoritativeDocument(result.document, result.affectedBlockIds);
      setRevertEligible(result.revertEligible);
      setRevertHash(result.document.contentHash);
      setSectionOpen(false);
      setSectionAcknowledged(false);
      await calculateReview(selected, true, result.document.currentVersion);
    } catch (error) {
      setMergeError(
        error instanceof Error ? error.message : "Acceptance failed safely.",
      );
      await calculateReview(selected);
    }
  }

  async function revertMerge() {
    try {
      const result = await revertLatestMerge(documentId, document.contentHash);
      onAuthoritativeDocument(result.document, result.affectedBlockIds);
      setRevertEligible(false);
      setRevertHash(null);
      if (selected) await calculateReview(selected);
    } catch (error) {
      setMergeError(error instanceof Error ? error.message : "Revert failed.");
      setRevertEligible(false);
    }
  }

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
      setMode("review");
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
      setMode("review");
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
          {revertEligible && revertHash === document.contentHash ? (
            <button
              type="button"
              className="button-secondary"
              onClick={() => void revertMerge()}
            >
              Revert Merge
            </button>
          ) : null}
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
            <div className="proposal-mode-switch">
              <button
                type="button"
                aria-pressed={mode === "review"}
                onClick={() => {
                  void (async () => {
                    if (
                      !alternativeBarrierRef.current ||
                      (await alternativeBarrierRef.current())
                    ) {
                      setMode("review");
                      await calculateReview(selected);
                    }
                  })();
                }}
              >
                Review
              </button>
              <button
                type="button"
                aria-pressed={mode === "edit"}
                onClick={() => setMode("edit")}
              >
                Edit Alternative
              </button>
            </div>
          </div>
          {mode === "edit" ? (
            <AlternativeEditor
              key={selected.id}
              alternative={selected}
              onSaved={handleAlternativeSaved}
              onDirty={() => {
                reviewRequestRef.current += 1;
                setReviewStatus("updating");
              }}
              registerSaveBarrier={(barrier) => {
                alternativeBarrierRef.current = barrier;
                registerSaveBarrier(barrier);
              }}
            />
          ) : reviewStatus === "updating" ? (
            <div className="review-status" role="status">
              Updating Review…
            </div>
          ) : reviewStatus === "error" || !review ? (
            <div className="review-status" role="alert">
              Review could not be calculated.
              <button
                type="button"
                onClick={() => void calculateReview(selected)}
              >
                Retry
              </button>
            </div>
          ) : (
            <ReviewRenderer
              snapshot={review}
              onAccept={(block, kind) => void accept([block], kind)}
              onAcceptSection={() => {
                setSectionAcknowledged(false);
                setSectionOpen(true);
              }}
              onReviewCurrent={() => {
                void (async () => {
                  const prepared =
                    await getGenerationSource()?.prepareGeneration();
                  if (prepared) {
                    await calculateReview(
                      selected,
                      true,
                      prepared.documentVersion,
                    );
                  }
                })();
              }}
            />
          )}
          {mergeError ? (
            <div className="generation-error" role="alert">
              {mergeError}
            </div>
          ) : null}
          {sectionOpen && review ? (
            <div
              className="section-review-overlay"
              role="dialog"
              aria-modal="true"
            >
              <div className="section-review-dialog">
                <h3>Review the complete section</h3>
                <ul>
                  {review.blocks.map((block) => (
                    <li key={block.id}>
                      <strong>{block.classification}</strong> ·{" "}
                      {block.afterText || "Empty block"}
                    </li>
                  ))}
                </ul>
                <label>
                  <input
                    type="checkbox"
                    checked={sectionAcknowledged}
                    onChange={(event) =>
                      setSectionAcknowledged(event.target.checked)
                    }
                  />
                  I reviewed all changes in this section.
                </label>
                <div className="dialog-actions">
                  <button type="button" onClick={() => setSectionOpen(false)}>
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={!sectionAcknowledged}
                    onClick={() => void accept(review.blocks, "section")}
                  >
                    Accept section changes
                  </button>
                </div>
              </div>
            </div>
          ) : null}
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
