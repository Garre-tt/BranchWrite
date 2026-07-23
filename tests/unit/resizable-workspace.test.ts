import { describe, expect, it } from "vitest";

import {
  DEFAULT_DRAFT_SHARE,
  MAX_DRAFT_SHARE,
  MIN_DRAFT_SHARE,
  clampDraftShare,
  draftShareFromKey,
  draftShareFromPointer,
} from "../../src/ui/workspace/resizable-workspace";

describe("resizable workspace proportions", () => {
  it("clamps pointer resizing so My Draft remains primary", () => {
    expect(draftShareFromPointer(100, 100, 1_000)).toBe(MIN_DRAFT_SHARE);
    expect(draftShareFromPointer(1_100, 100, 1_000)).toBe(MAX_DRAFT_SHARE);
    expect(draftShareFromPointer(750, 100, 1_000)).toBe(65);
    expect(draftShareFromPointer(100, 100, 0)).toBe(DEFAULT_DRAFT_SHARE);
  });

  it("supports keyboard resizing and clamps at both limits", () => {
    expect(draftShareFromKey(64, "ArrowLeft")).toBe(62);
    expect(draftShareFromKey(64, "ArrowRight")).toBe(66);
    expect(draftShareFromKey(64, "PageDown")).toBe(MIN_DRAFT_SHARE);
    expect(draftShareFromKey(64, "PageUp")).toBe(74);
    expect(draftShareFromKey(64, "Home")).toBe(MIN_DRAFT_SHARE);
    expect(draftShareFromKey(64, "End")).toBe(MAX_DRAFT_SHARE);
    expect(draftShareFromKey(64, "Enter")).toBeNull();
    expect(clampDraftShare(500)).toBe(MAX_DRAFT_SHARE);
  });
});
