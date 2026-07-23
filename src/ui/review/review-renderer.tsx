"use client";

import type { DiffSnapshot, ReviewBlock } from "@/domain/review/review-types";

const LABELS = {
  unchanged: "Unchanged",
  addition: "Added text",
  deletion: "Deleted text",
  replacement: "Changed",
  "formatting-only": "Formatting changed",
} as const;

function WordChanges({ block }: { block: ReviewBlock }) {
  if (!block.wordChanges.length) {
    return (
      <div className="review-samples">
        <p>
          <span>Before</span>
          {block.beforeText || "Empty block"}
        </p>
        <p>
          <span>After</span>
          {block.afterText || "Empty block"}
        </p>
      </div>
    );
  }
  return (
    <p
      className="word-diff"
      aria-label={`Before: ${block.beforeText}. After: ${block.afterText}.`}
    >
      {block.wordChanges.map((change, index) =>
        change.kind === "delete" ? (
          <del key={index}>{change.text}</del>
        ) : change.kind === "insert" ? (
          <ins key={index}>{change.text}</ins>
        ) : (
          <span key={index}>{change.text}</span>
        ),
      )}
    </p>
  );
}

export function ReviewRenderer({
  snapshot,
  onReviewCurrent,
  onAccept,
  onAcceptSection,
}: {
  snapshot: DiffSnapshot;
  onReviewCurrent: () => void;
  onAccept: (block: ReviewBlock, kind: "block" | "sentence") => void;
  onAcceptSection: () => void;
}) {
  if (snapshot.status === "stale") {
    return (
      <div className="stale-review" role="alert">
        <strong>Review is stale</strong>
        <p>
          {snapshot.staleReason === "missing-target"
            ? "An original target block no longer exists. BranchWrite will not relocate the Alternative."
            : "A reviewed target changed in My Draft."}
        </p>
        <button type="button" onClick={onReviewCurrent}>
          Review against current draft
        </button>
      </div>
    );
  }
  return (
    <div className="review-list" aria-label="Alternative Review">
      {snapshot.blocks.map((block) => (
        <article
          key={block.id}
          className={`review-block review-${block.classification}`}
        >
          <header>
            <strong>{LABELS[block.classification]}</strong>
            <span>{block.type}</span>
          </header>
          <WordChanges block={block} />
          {block.classification !== "unchanged" ? (
            <div className="review-acceptance">
              <button type="button" onClick={() => onAccept(block, "block")}>
                Accept block
              </button>
              {block.sentenceReplacement ? (
                <button
                  type="button"
                  onClick={() => onAccept(block, "sentence")}
                >
                  Accept sentence
                </button>
              ) : null}
            </div>
          ) : null}
        </article>
      ))}
      <button
        type="button"
        className="accept-section-button"
        onClick={onAcceptSection}
      >
        Review and accept section
      </button>
    </div>
  );
}
