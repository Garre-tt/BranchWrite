import { describe, expect, it } from "vitest";

import { domainError } from "../../src/application/errors";
import { err, ok } from "../../src/application/result";

describe("domain result conventions", () => {
  it("represents success without an error channel", () => {
    expect(ok({ id: "document-1" })).toEqual({
      ok: true,
      value: { id: "document-1" },
    });
  });

  it("represents typed failures with stable codes", () => {
    const failure = domainError(
      "STALE_WRITE",
      "The document changed before this save completed.",
      { expectedVersion: 1, actualVersion: 2 },
    );

    expect(err(failure)).toEqual({ ok: false, error: failure });
  });
});
