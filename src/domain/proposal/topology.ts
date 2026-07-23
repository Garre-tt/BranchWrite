import type { StructuredDocumentJson } from "@/editor/structured-content";
import { validateStructuredContent } from "@/editor/content-validation";

export class InvalidProposalTopologyError extends Error {
  constructor(
    message = "Generated content changed the Proposal scope topology.",
  ) {
    super(message);
    this.name = "InvalidProposalTopologyError";
  }
}

export type TopLevelSignature = readonly Readonly<{
  id: string;
  type: string;
}>[];

export function topLevelSignature(
  content: StructuredDocumentJson,
): TopLevelSignature {
  const validated = validateStructuredContent(content).json;
  return validated.content.map((block) => {
    const id = block.attrs?.id;
    if (typeof id !== "string") {
      throw new InvalidProposalTopologyError();
    }
    return { id, type: block.type };
  });
}

export function assertMatchingTopLevelTopology(
  expected: StructuredDocumentJson,
  candidate: StructuredDocumentJson,
): void {
  const expectedSignature = topLevelSignature(expected);
  const candidateSignature = topLevelSignature(candidate);
  if (
    expectedSignature.length !== candidateSignature.length ||
    expectedSignature.some(
      (block, index) =>
        candidateSignature[index]?.id !== block.id ||
        candidateSignature[index]?.type !== block.type,
    )
  ) {
    throw new InvalidProposalTopologyError();
  }
}
