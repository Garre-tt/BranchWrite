// @vitest-environment jsdom

import { describe, expect, it } from "vitest";

import { pastedHtmlWasSimplified } from "../../src/editor/paste-normalization";

describe("paste simplification detection", () => {
  it("does not flag content composed only of supported markup", () => {
    expect(
      pastedHtmlWasSimplified(
        '<h2>Heading</h2><p><strong>Bold</strong> and <a href="https://example.com">linked</a>.</p>',
      ),
    ).toBe(false);
  });

  it("flags unsupported structures, styling, and unsafe links", () => {
    expect(
      pastedHtmlWasSimplified(
        '<table><tr><td>Cell</td></tr></table><p style="color:red">Text</p>',
      ),
    ).toBe(true);
    expect(
      pastedHtmlWasSimplified(
        '<p><a href="javascript:alert(1)">Unsafe</a></p>',
      ),
    ).toBe(true);
  });
});
