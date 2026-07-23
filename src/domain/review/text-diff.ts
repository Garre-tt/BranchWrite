import type { WordChange } from "@/domain/review/review-types";

function tokens(text: string): string[] {
  return text.match(/\s+|[\p{L}\p{N}_]+|[^\s\p{L}\p{N}_]/gu) ?? [];
}

export function diffWords(before: string, after: string): WordChange[] {
  const left = tokens(before);
  const right = tokens(after);
  const lengths = Array.from({ length: left.length + 1 }, () =>
    Array<number>(right.length + 1).fill(0),
  );
  for (let i = left.length - 1; i >= 0; i -= 1) {
    for (let j = right.length - 1; j >= 0; j -= 1) {
      lengths[i]![j] =
        left[i] === right[j]
          ? 1 + lengths[i + 1]![j + 1]!
          : Math.max(lengths[i + 1]![j]!, lengths[i]![j + 1]!);
    }
  }
  const changes: WordChange[] = [];
  const push = (kind: WordChange["kind"], text: string) => {
    const previous = changes.at(-1);
    if (previous?.kind === kind) {
      changes[changes.length - 1] = { kind, text: previous.text + text };
    } else {
      changes.push({ kind, text });
    }
  };
  let i = 0;
  let j = 0;
  while (i < left.length || j < right.length) {
    if (left[i] === right[j] && i < left.length && j < right.length) {
      push("equal", left[i]!);
      i += 1;
      j += 1;
    } else if (
      j >= right.length ||
      (i < left.length && lengths[i + 1]![j]! >= lengths[i]![j + 1]!)
    ) {
      push("delete", left[i]!);
      i += 1;
    } else {
      push("insert", right[j]!);
      j += 1;
    }
  }
  return changes;
}
