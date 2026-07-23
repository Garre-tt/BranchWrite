import { describe, expect, it } from "vitest";

import { DeterministicMockProposalGenerator } from "@/domain/proposal/mock-proposal-generator";
import { normalizePrompt } from "@/domain/proposal/prompt";
import type { GenerateProposalRequest } from "@/domain/proposal/proposal-types";
import { topLevelSignature } from "@/domain/proposal/topology";
import { validateStructuredContent } from "@/editor/content-validation";

const scopeContent = validateStructuredContent({
  type: "doc",
  content: [
    {
      type: "paragraph",
      attrs: { id: "a" },
      content: [
        { type: "text", text: "We utilize 12 reports in order to plan." },
      ],
    },
  ],
}).json;

function request(prompt: string): GenerateProposalRequest {
  return {
    documentId: "doc",
    baseRevisionId: "revision",
    baseRevisionHash: "hash",
    scope: { blockIds: ["a"], content: scopeContent },
    prompt,
    normalizedPrompt: normalizePrompt(prompt),
  };
}

describe("Deterministic mock Proposal generator", () => {
  it("returns identical detached output for identical input", async () => {
    const generator = new DeterministicMockProposalGenerator(0);
    const first = await generator.generate(
      request("Improve clarity"),
      new AbortController().signal,
    );
    const second = await generator.generate(
      request("Improve clarity"),
      new AbortController().signal,
    );
    expect(first).toEqual(second);
    expect(first.content).not.toBe(scopeContent);
    expect(first.content.content[0]).not.toBe(scopeContent.content[0]);
    expect(first.content.content[0]?.content?.[0]?.text).toBe(
      "We use 12 reports to plan.",
    );
  });

  it("preserves top-level topology", async () => {
    const result = await new DeterministicMockProposalGenerator(0).generate(
      request("Expand"),
      new AbortController().signal,
    );
    expect(topLevelSignature(result.content)).toEqual(
      topLevelSignature(scopeContent),
    );
  });

  it("cancels before and during generation", async () => {
    const generator = new DeterministicMockProposalGenerator(30);
    const before = new AbortController();
    before.abort();
    await expect(
      generator.generate(request("Expand"), before.signal),
    ).rejects.toMatchObject({ name: "AbortError" });

    const during = new AbortController();
    const generation = generator.generate(request("Expand"), during.signal);
    during.abort();
    await expect(generation).rejects.toMatchObject({ name: "AbortError" });
  });
});
