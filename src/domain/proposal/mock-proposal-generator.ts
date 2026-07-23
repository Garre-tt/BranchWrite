import type { StructuredNodeJson } from "@/editor/structured-content";
import type {
  GenerateProposalRequest,
  ProposalGenerationResult,
  ProposalGenerator,
} from "@/domain/proposal/proposal-types";
import {
  mapPromptToTransformation,
  PROMPT_MAPPING_VERSION,
  type ProposalTransformation,
} from "@/domain/proposal/prompt";
import { assertMatchingTopLevelTopology } from "@/domain/proposal/topology";
import { validateStructuredContent } from "@/editor/content-validation";

export const MOCK_GENERATOR_VERSION = `deterministic-mock-v1+${PROMPT_MAPPING_VERSION}`;

const REPLACEMENTS: Readonly<
  Record<ProposalTransformation, readonly (readonly [RegExp, string])[]>
> = {
  clarity: [
    [/\bin order to\b/giu, "to"],
    [/\bdue to the fact that\b/giu, "because"],
    [/\butilize\b/giu, "use"],
  ],
  concise: [
    [/\bat this point in time\b/giu, "now"],
    [/\bfor the purpose of\b/giu, "to"],
    [/\bin the event that\b/giu, "if"],
    [/\bvery\b/giu, ""],
  ],
  professional: [
    [/\bcan't\b/giu, "cannot"],
    [/\bwon't\b/giu, "will not"],
    [/\bdon't\b/giu, "do not"],
    [/\ba lot of\b/giu, "many"],
  ],
  persuasive: [],
  rewrite: [],
  expand: [],
};

function replaceOutsideQuotes(
  text: string,
  replacements: readonly (readonly [RegExp, string])[],
): string {
  return text
    .split(/(["“”])/u)
    .map((part, index) => {
      if (index % 4 === 2) return part;
      return replacements.reduce(
        (current, [pattern, replacement]) =>
          current.replace(pattern, replacement),
        part,
      );
    })
    .join("")
    .replace(/ {2,}/gu, " ");
}

function textNodes(node: StructuredNodeJson): StructuredNodeJson[] {
  if (node.type === "text") return [node];
  return (node.content ?? []).flatMap(textNodes);
}

function transformBlock(
  block: StructuredNodeJson,
  transformation: ProposalTransformation,
): void {
  const leaves = textNodes(block);
  for (const leaf of leaves) {
    if (leaf.text) {
      leaf.text = replaceOutsideQuotes(leaf.text, REPLACEMENTS[transformation]);
    }
  }
  const first = leaves.find((leaf) => Boolean(leaf.text));
  const last = [...leaves].reverse().find((leaf) => Boolean(leaf.text));
  if (transformation === "persuasive" && first?.text) {
    first.text = `Importantly, ${first.text}`;
  } else if (transformation === "rewrite" && first?.text) {
    first.text = `In other words, ${first.text}`;
  } else if (transformation === "expand" && last?.text) {
    last.text = `${last.text} This point deserves careful consideration.`;
  }
}

function abortError(): DOMException {
  return new DOMException("Proposal generation was cancelled.", "AbortError");
}

async function abortableDelay(
  milliseconds: number,
  signal: AbortSignal,
): Promise<void> {
  if (milliseconds <= 0) return;
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(resolve, milliseconds);
    signal.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(abortError());
      },
      { once: true },
    );
  });
}

export class DeterministicMockProposalGenerator implements ProposalGenerator {
  constructor(private readonly latencyMs = 650) {}

  async generate(
    request: GenerateProposalRequest,
    signal: AbortSignal,
  ): Promise<ProposalGenerationResult> {
    if (signal.aborted) throw abortError();
    const mapping = mapPromptToTransformation(request.normalizedPrompt);
    await abortableDelay(this.latencyMs, signal);
    if (signal.aborted) throw abortError();

    const content = structuredClone(request.scope.content);
    for (const block of content.content) {
      transformBlock(block, mapping.transformation);
    }
    const validated = validateStructuredContent(content).json;
    assertMatchingTopLevelTopology(request.scope.content, validated);
    if (signal.aborted) throw abortError();
    return {
      content: validated,
      label: mapping.label,
      generatorVersion: MOCK_GENERATOR_VERSION,
    };
  }
}
