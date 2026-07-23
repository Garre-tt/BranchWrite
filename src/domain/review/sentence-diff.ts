import type { StructuredNodeJson } from "@/editor/structured-content";
import type { SentenceReplacement } from "@/domain/review/review-types";
import { diffWords } from "@/domain/review/text-diff";

type Sentence = { text: string; from: number; to: number };
const AMBIGUOUS_ABBREVIATION = /\b(?:mr|mrs|ms|dr|prof|sr|jr|e\.g|i\.e)\.$/iu;

export function segmentSentences(text: string): Sentence[] | null {
  if (/[…]|[!?]{2,}|\.\.\./u.test(text)) return null;
  const result: Sentence[] = [];
  let start = 0;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (!".!?".includes(character ?? "")) continue;
    const next = text[index + 1];
    if (next !== undefined && !/\s/u.test(next)) continue;
    const candidate = text.slice(start, index + 1).trim();
    if (AMBIGUOUS_ABBREVIATION.test(candidate)) return null;
    if (candidate) {
      const actualStart = text.indexOf(candidate, start);
      result.push({
        text: candidate,
        from: actualStart,
        to: actualStart + candidate.length,
      });
    }
    start = index + 1;
  }
  const remainder = text.slice(start).trim();
  if (remainder) {
    const actualStart = text.indexOf(remainder, start);
    result.push({
      text: remainder,
      from: actualStart,
      to: actualStart + remainder.length,
    });
  }
  return result.length ? result : [{ text: "", from: 0, to: 0 }];
}

function plainTextOnly(block: StructuredNodeJson): boolean {
  return (block.content ?? []).every((node) => node.type === "text");
}

function normalized(sentence: Sentence): string {
  return sentence.text.trim().replace(/\s+/gu, " ").toLowerCase();
}

export function eligibleSentenceReplacement(
  beforeBlock: StructuredNodeJson,
  afterBlock: StructuredNodeJson,
  beforeText: string,
  afterText: string,
): SentenceReplacement | null {
  if (
    beforeBlock.type !== "paragraph" ||
    afterBlock.type !== "paragraph" ||
    !plainTextOnly(beforeBlock) ||
    !plainTextOnly(afterBlock)
  ) {
    return null;
  }
  const before = segmentSentences(beforeText);
  const after = segmentSentences(afterText);
  if (!before || !after) return null;

  let prefix = 0;
  while (
    prefix < before.length &&
    prefix < after.length &&
    normalized(before[prefix]!) === normalized(after[prefix]!)
  ) {
    prefix += 1;
  }
  let suffix = 0;
  while (
    suffix < before.length - prefix &&
    suffix < after.length - prefix &&
    normalized(before[before.length - 1 - suffix]!) ===
      normalized(after[after.length - 1 - suffix]!)
  ) {
    suffix += 1;
  }
  const changedBefore = before.slice(prefix, before.length - suffix);
  const changedAfter = after.slice(prefix, after.length - suffix);
  if (changedBefore.length !== 1 || changedAfter.length !== 1) return null;

  const singleSentence = before.length === 1 && after.length === 1;
  const anchors = [
    ...before.slice(0, prefix),
    ...before.slice(before.length - suffix),
  ];
  const anchorsUnique = anchors.every(
    (anchor) =>
      before.filter((item) => normalized(item) === normalized(anchor))
        .length === 1 &&
      after.filter((item) => normalized(item) === normalized(anchor)).length ===
        1,
  );
  if (!singleSentence && (!anchors.length || !anchorsUnique)) return null;

  return {
    before: changedBefore[0]!.text,
    after: changedAfter[0]!.text,
    beforeFrom: changedBefore[0]!.from,
    beforeTo: changedBefore[0]!.to,
    wordChanges: diffWords(changedBefore[0]!.text, changedAfter[0]!.text),
  };
}
