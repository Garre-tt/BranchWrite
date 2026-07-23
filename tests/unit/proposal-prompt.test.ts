import { describe, expect, it } from "vitest";

import {
  mapPromptToTransformation,
  normalizePrompt,
} from "@/domain/proposal/prompt";

describe("Proposal prompt mapping", () => {
  it("normalizes Unicode and whitespace deterministically", () => {
    expect(normalizePrompt("  ＭＡＫＥ\t concise \n")).toBe("make concise");
  });

  it("maps exact quick actions", () => {
    expect(mapPromptToTransformation("Improve clarity")).toMatchObject({
      transformation: "clarity",
      label: "Improve clarity",
    });
  });

  it("uses the first keyword match and rewrite fallback", () => {
    expect(
      mapPromptToTransformation("Make this professional and concise"),
    ).toMatchObject({ transformation: "concise" });
    expect(mapPromptToTransformation("Try something different")).toMatchObject({
      transformation: "rewrite",
    });
  });
});
