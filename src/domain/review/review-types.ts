import type { StructuredNodeJson } from "@/editor/structured-content";

export const REVIEW_ALGORITHM_VERSION = "branchwrite-review-v1";

export type WordChange = Readonly<{
  kind: "equal" | "delete" | "insert";
  text: string;
}>;

export type SentenceReplacement = Readonly<{
  before: string;
  after: string;
  beforeFrom: number;
  beforeTo: number;
  wordChanges: readonly WordChange[];
}>;

export type ReviewBlockClassification =
  "unchanged" | "addition" | "deletion" | "replacement" | "formatting-only";

export type ReviewBlock = Readonly<{
  id: string;
  type: string;
  classification: ReviewBlockClassification;
  expectedTargetHash: string;
  before: StructuredNodeJson;
  after: StructuredNodeJson;
  beforeText: string;
  afterText: string;
  wordChanges: readonly WordChange[];
  sentenceReplacement: SentenceReplacement | null;
}>;

export type DiffSnapshot = Readonly<{
  id: string;
  alternativeId: string;
  documentId: string;
  baseRevisionId: string;
  baseScopeHash: string;
  alternativeContentHash: string;
  algorithmVersion: typeof REVIEW_ALGORITHM_VERSION;
  status: "current" | "stale";
  staleReason: "missing-target" | "changed-target" | null;
  blocks: readonly ReviewBlock[];
  createdAt: string;
}>;
