import type { Node as ProseMirrorNode } from "@tiptap/pm/model";

import type { ProposalScope } from "@/domain/proposal/proposal-types";
import { validateStructuredContent } from "@/editor/content-validation";
import type { StructuredDocumentJson } from "@/editor/structured-content";

export class InvalidProposalScopeError extends Error {
  constructor(message = "The selected draft blocks are no longer available.") {
    super(message);
    this.name = "InvalidProposalScopeError";
  }
}

export type ResolvedEditorScope = Readonly<{
  blockIds: readonly string[];
  from: number;
  to: number;
}>;

type BlockPosition = {
  id: string;
  from: number;
  to: number;
};

function positionedBlocks(document: ProseMirrorNode): BlockPosition[] {
  const blocks: BlockPosition[] = [];
  document.forEach((block, offset) => {
    const id: unknown = block.attrs.id;
    if (typeof id !== "string" || !id) {
      throw new InvalidProposalScopeError(
        "Every selected block must have a stable ID.",
      );
    }
    blocks.push({ id, from: offset, to: offset + block.nodeSize });
  });
  return blocks;
}

export function resolveEditorScope(
  document: ProseMirrorNode,
  from: number,
  to: number,
): ResolvedEditorScope {
  const blocks = positionedBlocks(document);
  if (blocks.length === 0) throw new InvalidProposalScopeError();

  const startIndex = blocks.findIndex(
    (block) => block.from <= from && from < block.to,
  );
  const resolvedStart = startIndex === -1 ? blocks.length - 1 : startIndex;
  const collapsed = from === to;
  const endIndex = collapsed
    ? resolvedStart
    : blocks.findIndex((block) => block.from < to && to <= block.to);
  const resolvedEnd = endIndex === -1 ? blocks.length - 1 : endIndex;
  if (resolvedEnd < resolvedStart) throw new InvalidProposalScopeError();

  const selected = blocks.slice(resolvedStart, resolvedEnd + 1);
  const first = selected[0];
  const last = selected.at(-1);
  if (!first || !last) throw new InvalidProposalScopeError();
  return {
    blockIds: selected.map((block) => block.id),
    from: first.from,
    to: last.to,
  };
}

export function resolvePersistedScope(
  document: StructuredDocumentJson,
  requestedBlockIds: readonly string[],
): ProposalScope {
  if (
    requestedBlockIds.length === 0 ||
    new Set(requestedBlockIds).size !== requestedBlockIds.length
  ) {
    throw new InvalidProposalScopeError();
  }
  const validated = validateStructuredContent(document).json;
  const indexed = validated.content.map((block, index) => ({
    block,
    index,
    id: block.attrs?.id,
  }));
  const selected = requestedBlockIds.map((id) =>
    indexed.find((entry) => entry.id === id),
  );
  if (
    selected.some((entry) => !entry) ||
    selected.some(
      (entry, index) =>
        index > 0 && entry!.index !== selected[index - 1]!.index + 1,
    )
  ) {
    throw new InvalidProposalScopeError();
  }
  return {
    blockIds: [...requestedBlockIds],
    content: validateStructuredContent({
      type: "doc",
      content: selected.map((entry) => structuredClone(entry!.block)),
    }).json,
  };
}
