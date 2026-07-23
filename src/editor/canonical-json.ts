import { canonicalize } from "json-canonicalize";

import { validateStructuredContent } from "./content-validation";
import { SCHEMA_VERSION } from "./schema-version";

export const CONTENT_HASH_KIND = "branchwrite-content" as const;

export function canonicalizeStructuredContent(input: unknown): string {
  const { json } = validateStructuredContent(input);

  return canonicalize({
    kind: CONTENT_HASH_KIND,
    schemaVersion: SCHEMA_VERSION,
    content: json,
  });
}
