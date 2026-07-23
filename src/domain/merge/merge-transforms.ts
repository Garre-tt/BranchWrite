import type { ReviewBlock } from "@/domain/review/review-types";
import { validateStructuredContent } from "@/editor/content-validation";
import type {
  StructuredDocumentJson,
  StructuredNodeJson,
} from "@/editor/structured-content";

function indexOf(content: StructuredDocumentJson, id: string) {
  const index = content.content.findIndex((block) => block.attrs?.id === id);
  if (index < 0) throw new Error("Missing Merge target.");
  return index;
}

export function applyBlockMerge(
  document: StructuredDocumentJson,
  block: ReviewBlock,
) {
  const next = structuredClone(document);
  next.content[indexOf(next, block.id)] = structuredClone(block.after);
  return validateStructuredContent(next).json;
}

export function applySentenceMerge(
  document: StructuredDocumentJson,
  block: ReviewBlock,
) {
  const sentence = block.sentenceReplacement;
  if (!sentence || block.type !== "paragraph")
    throw new Error("Invalid sentence acceptance.");
  const next = structuredClone(document);
  const target = next.content[indexOf(next, block.id)]!;
  const before: StructuredNodeJson[] = [];
  const after: StructuredNodeJson[] = [];
  let offset = 0;
  for (const node of target.content ?? []) {
    const text = node.text ?? "";
    const end = offset + text.length;
    const prefix = text.slice(0, Math.max(0, sentence.beforeFrom - offset));
    const suffix = text.slice(Math.max(0, sentence.beforeTo - offset));
    if (offset < sentence.beforeFrom && prefix)
      before.push({ ...structuredClone(node), text: prefix });
    if (end > sentence.beforeTo && suffix)
      after.push({ ...structuredClone(node), text: suffix });
    offset = end;
  }
  target.content = [
    ...before,
    ...structuredClone(sentence.afterContent),
    ...after,
  ];
  return validateStructuredContent(next).json;
}

export function applySectionMerge(
  document: StructuredDocumentJson,
  blocks: readonly ReviewBlock[],
) {
  let next = structuredClone(document);
  for (const block of blocks) next = applyBlockMerge(next, block);
  return next;
}
