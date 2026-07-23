import { createHash } from "node:crypto";
import { canonicalize } from "json-canonicalize";

import type { GenerateProposalRequest } from "@/domain/proposal/proposal-types";

export function hashProposalInput(
  request: GenerateProposalRequest,
  generatorVersion: string,
): string {
  return createHash("sha256")
    .update(
      canonicalize({
        generatorVersion,
        normalizedPrompt: request.normalizedPrompt,
        baseRevisionId: request.baseRevisionId,
        baseRevisionHash: request.baseRevisionHash,
        scopeBlockIds: request.scope.blockIds,
        scopeContent: request.scope.content,
      }),
      "utf8",
    )
    .digest("hex");
}
