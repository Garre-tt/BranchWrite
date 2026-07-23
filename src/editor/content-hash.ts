import { createHash } from "node:crypto";

import { canonicalizeStructuredContent } from "./canonical-json";

export function hashStructuredContent(input: unknown): string {
  return createHash("sha256")
    .update(canonicalizeStructuredContent(input), "utf8")
    .digest("hex");
}
