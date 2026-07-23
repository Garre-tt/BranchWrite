import {
  QUICK_ACTIONS,
  type QuickAction,
} from "@/domain/proposal/proposal-types";

export const PROMPT_MAPPING_VERSION = "prompt-map-v1";

export type ProposalTransformation =
  "clarity" | "concise" | "professional" | "persuasive" | "rewrite" | "expand";

const ACTION_TRANSFORMATIONS: Readonly<
  Record<QuickAction, ProposalTransformation>
> = {
  "Improve clarity": "clarity",
  "Make concise": "concise",
  "Make more professional": "professional",
  "Make more persuasive": "persuasive",
  "Rewrite while preserving meaning": "rewrite",
  Expand: "expand",
};

export const ORDERED_PROMPT_KEYWORDS: readonly Readonly<{
  keywords: readonly string[];
  transformation: ProposalTransformation;
  label: QuickAction;
}>[] = [
  {
    keywords: ["concise", "shorten", "shorter", "brief"],
    transformation: "concise",
    label: "Make concise",
  },
  {
    keywords: ["professional", "formal", "business"],
    transformation: "professional",
    label: "Make more professional",
  },
  {
    keywords: ["persuasive", "convincing", "compelling"],
    transformation: "persuasive",
    label: "Make more persuasive",
  },
  {
    keywords: ["expand", "elaborate", "more detail"],
    transformation: "expand",
    label: "Expand",
  },
  {
    keywords: ["clarity", "clearer", "clarify"],
    transformation: "clarity",
    label: "Improve clarity",
  },
  {
    keywords: ["rewrite", "rephrase", "preserve meaning"],
    transformation: "rewrite",
    label: "Rewrite while preserving meaning",
  },
] as const;

export function normalizePrompt(prompt: string): string {
  return prompt.normalize("NFKC").trim().replace(/\s+/gu, " ").toLowerCase();
}

export function mapPromptToTransformation(prompt: string): {
  normalizedPrompt: string;
  transformation: ProposalTransformation;
  label: QuickAction;
} {
  const normalizedPrompt = normalizePrompt(prompt);
  const exactAction = QUICK_ACTIONS.find(
    (action) => normalizePrompt(action) === normalizedPrompt,
  );
  if (exactAction) {
    return {
      normalizedPrompt,
      transformation: ACTION_TRANSFORMATIONS[exactAction],
      label: exactAction,
    };
  }

  const match = ORDERED_PROMPT_KEYWORDS.find(({ keywords }) =>
    keywords.some((keyword) => normalizedPrompt.includes(keyword)),
  );
  return {
    normalizedPrompt,
    transformation: match?.transformation ?? "rewrite",
    label: match?.label ?? "Rewrite while preserving meaning",
  };
}
