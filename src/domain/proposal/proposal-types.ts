import type { StructuredDocumentJson } from "@/editor/structured-content";

export const QUICK_ACTIONS = [
  "Improve clarity",
  "Make concise",
  "Make more professional",
  "Make more persuasive",
  "Rewrite while preserving meaning",
  "Expand",
] as const;

export type QuickAction = (typeof QUICK_ACTIONS)[number];

export type ProposalScope = Readonly<{
  blockIds: readonly string[];
  content: StructuredDocumentJson;
}>;

export type DraftRevision = Readonly<{
  id: string;
  documentId: string;
  parentRevisionId: string | null;
  content: StructuredDocumentJson;
  contentHash: string;
  schemaVersion: string;
  cause: "initial" | "proposal_base" | "merge" | "revert";
  createdAt: string;
}>;

export type GenerateProposalRequest = Readonly<{
  documentId: string;
  baseRevisionId: string;
  baseRevisionHash: string;
  scope: ProposalScope;
  prompt: string;
  normalizedPrompt: string;
}>;

export type ProposalGenerationResult = Readonly<{
  content: StructuredDocumentJson;
  label: QuickAction;
  generatorVersion: string;
}>;

export interface ProposalGenerator {
  generate(
    request: GenerateProposalRequest,
    signal: AbortSignal,
  ): Promise<ProposalGenerationResult>;
}

export type CompletedProposal = Readonly<{
  id: string;
  documentId: string;
  baseRevisionId: string;
  scopeBlockIds: readonly string[];
  prompt: string;
  normalizedPrompt: string;
  generatorVersion: string;
  inputHash: string;
  content: StructuredDocumentJson;
  contentHash: string;
  label: QuickAction;
  status: "completed";
  createdAt: string;
  completedAt: string;
}>;

export type Alternative = Readonly<{
  id: string;
  documentId: string;
  proposalId: string;
  parentAlternativeId: string | null;
  content: StructuredDocumentJson;
  contentHash: string;
  contentVersion: number;
  isEdited: boolean;
  createdAt: string;
  updatedAt: string;
  proposal: CompletedProposal;
}>;

export type AlternativeSummary = Readonly<{
  id: string;
  proposalId: string;
  label: QuickAction;
  prompt: string;
  isEdited: boolean;
  createdAt: string;
}>;
