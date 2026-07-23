import { randomUUID } from "node:crypto";

import { domainError, type DomainError } from "@/application/errors";
import { err, ok, type Result } from "@/application/result";
import { hashProposalInput } from "@/domain/proposal/input-hash";
import { normalizePrompt } from "@/domain/proposal/prompt";
import {
  InvalidProposalScopeError,
  resolvePersistedScope,
} from "@/domain/proposal/scope";
import {
  InvalidProposalTopologyError,
  assertMatchingTopLevelTopology,
} from "@/domain/proposal/topology";
import type {
  Alternative,
  AlternativeSummary,
  ProposalGenerator,
} from "@/domain/proposal/proposal-types";
import {
  StructuredContentValidationError,
  validateStructuredContent,
} from "@/editor/content-validation";
import { hashStructuredContent } from "@/editor/content-hash";
import type { ProposalRepository } from "@/persistence/repositories/proposal-repository";

type ProposalResult<Value> = Result<Value, DomainError>;

export class ProposalService {
  constructor(
    private readonly repository: ProposalRepository,
    private readonly generator: ProposalGenerator,
  ) {}

  async generate(
    input: {
      documentId: string;
      expectedDocumentVersion: number;
      scopeBlockIds: readonly string[];
      prompt: string;
    },
    signal: AbortSignal,
  ): Promise<ProposalResult<Alternative>> {
    const originalPrompt = input.prompt.trim();
    if (!originalPrompt) {
      return err(
        domainError("VALIDATION_ERROR", "Enter an instruction to generate."),
      );
    }

    try {
      const baseResult = this.repository.createOrReuseBaseRevision({
        documentId: input.documentId,
        expectedDocumentVersion: input.expectedDocumentVersion,
        revisionId: randomUUID(),
        createdAt: new Date().toISOString(),
      });
      if (baseResult.kind === "not_found") {
        return err(
          domainError("NOT_FOUND", "That document could not be found."),
        );
      }
      if (baseResult.kind === "stale") {
        return err(
          domainError(
            "STALE_WRITE",
            "My Draft changed after saving. Save it again before generating.",
            { actualVersion: baseResult.actualVersion },
          ),
        );
      }

      const scope = resolvePersistedScope(
        baseResult.revision.content,
        input.scopeBlockIds,
      );
      const normalizedPrompt = normalizePrompt(originalPrompt);
      const request = {
        documentId: input.documentId,
        baseRevisionId: baseResult.revision.id,
        baseRevisionHash: baseResult.revision.contentHash,
        scope,
        prompt: originalPrompt,
        normalizedPrompt,
      };
      const generated = await this.generator.generate(request, signal);
      if (signal.aborted) {
        return err(
          domainError(
            "GENERATION_CANCELLED",
            "Proposal generation was cancelled.",
          ),
        );
      }
      const content = validateStructuredContent(generated.content).json;
      assertMatchingTopLevelTopology(scope.content, content);
      const now = new Date().toISOString();
      return ok(
        this.repository.createCompletedPair({
          proposalId: randomUUID(),
          alternativeId: randomUUID(),
          documentId: input.documentId,
          baseRevisionId: baseResult.revision.id,
          scopeBlockIds: scope.blockIds,
          prompt: originalPrompt,
          normalizedPrompt,
          generatorVersion: generated.generatorVersion,
          inputHash: hashProposalInput(request, generated.generatorVersion),
          content,
          contentHash: hashStructuredContent(content),
          label: generated.label,
          createdAt: now,
        }),
      );
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        return err(
          domainError(
            "GENERATION_CANCELLED",
            "Proposal generation was cancelled.",
          ),
        );
      }
      if (
        error instanceof InvalidProposalTopologyError ||
        error instanceof StructuredContentValidationError
      ) {
        return err(
          domainError(
            "INVALID_GENERATOR_OUTPUT",
            "Demo generation returned invalid structured content. My Draft was not changed.",
          ),
        );
      }
      if (error instanceof InvalidProposalScopeError) {
        return err(
          domainError(
            "STALE_TARGET",
            "The selected draft blocks changed. Select the scope again.",
          ),
        );
      }
      return err(
        domainError(
          "GENERATION_FAILED",
          "Proposal generation failed. My Draft was not changed.",
        ),
      );
    }
  }

  getAlternative(alternativeId: string): ProposalResult<Alternative> {
    try {
      const alternative = this.repository.findAlternativeById(alternativeId);
      return alternative
        ? ok(alternative)
        : err(domainError("NOT_FOUND", "That Alternative could not be found."));
    } catch {
      return err(
        domainError(
          "PERSISTENCE_FAILURE",
          "BranchWrite could not open this Alternative.",
        ),
      );
    }
  }

  listAlternatives(documentId: string): ProposalResult<AlternativeSummary[]> {
    try {
      return ok(this.repository.listAlternatives(documentId));
    } catch {
      return err(
        domainError(
          "PERSISTENCE_FAILURE",
          "BranchWrite could not load Alternatives.",
        ),
      );
    }
  }

  saveAlternative(input: {
    alternativeId: string;
    content: unknown;
    expectedVersion: number;
  }): ProposalResult<Alternative> {
    try {
      const existing = this.repository.findAlternativeById(input.alternativeId);
      if (!existing) {
        return err(
          domainError("NOT_FOUND", "That Alternative could not be found."),
        );
      }
      const content = validateStructuredContent(input.content).json;
      assertMatchingTopLevelTopology(existing.proposal.content, content);
      const contentHash = hashStructuredContent(content);
      const result = this.repository.saveAlternative({
        alternativeId: input.alternativeId,
        expectedVersion: input.expectedVersion,
        content,
        contentHash,
        isEdited: contentHash !== existing.proposal.contentHash,
        updatedAt: new Date().toISOString(),
      });
      if (result.kind === "not_found") {
        return err(
          domainError("NOT_FOUND", "That Alternative could not be found."),
        );
      }
      if (result.kind === "stale") {
        return err(
          domainError(
            "STALE_ALTERNATIVE",
            "This Alternative changed in another session. Reopen it before editing.",
            { actualVersion: result.actualVersion },
          ),
        );
      }
      return ok(result.alternative);
    } catch (error) {
      if (
        error instanceof StructuredContentValidationError ||
        error instanceof InvalidProposalTopologyError
      ) {
        return err(
          domainError(
            "VALIDATION_ERROR",
            "Alternative edits must preserve the selected block structure.",
          ),
        );
      }
      return err(
        domainError(
          "PERSISTENCE_FAILURE",
          "BranchWrite could not save this Alternative.",
        ),
      );
    }
  }
}
