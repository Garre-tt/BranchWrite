import type { DraftDocument } from "@/domain/document/document-types";

export type AcceptanceKind = "sentence" | "block" | "section";
export type MergeCommand = Readonly<{
  documentId: string;
  alternativeId: string;
  diffSnapshotId: string;
  hunkIds: readonly string[];
  expectedTargets: readonly Readonly<{
    blockId: string;
    beforeHash: string;
  }>[];
  acceptanceKind: AcceptanceKind;
  sectionReviewAcknowledged: boolean;
}>;
export type MergeResult = Readonly<{
  document: DraftDocument;
  mergeEventId: string;
  affectedBlockIds: readonly string[];
  revertEligible: boolean;
}>;
export type RevertResult = Readonly<{
  document: DraftDocument;
  revertedMergeEventId: string;
  affectedBlockIds: readonly string[];
}>;
