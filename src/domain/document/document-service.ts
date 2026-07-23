import { randomUUID } from "node:crypto";

import { domainError, type DomainError } from "@/application/errors";
import { err, ok, type Result } from "@/application/result";
import type {
  DocumentSummary,
  DraftDocument,
} from "@/domain/document/document-types";
import {
  StructuredContentValidationError,
  validateStructuredContent,
} from "@/editor/content-validation";
import { hashStructuredContent } from "@/editor/content-hash";
import type { StructuredDocumentJson } from "@/editor/structured-content";
import type { DocumentRepository } from "@/persistence/repositories/document-repository";

const DEFAULT_DOCUMENT_TITLE = "Untitled document";

type DocumentResult<Value> = Result<Value, DomainError>;

function initialDocumentContent(): StructuredDocumentJson {
  return {
    type: "doc",
    content: [
      {
        type: "paragraph",
        attrs: { id: randomUUID() },
      },
    ],
  };
}

export class DocumentService {
  constructor(private readonly repository: DocumentRepository) {}

  listDocuments(): DocumentResult<DocumentSummary[]> {
    try {
      return ok(this.repository.list());
    } catch {
      return err(
        domainError(
          "PERSISTENCE_FAILURE",
          "BranchWrite could not load your documents.",
        ),
      );
    }
  }

  getDocument(documentId: string): DocumentResult<DraftDocument> {
    try {
      const document = this.repository.findById(documentId);
      return document
        ? ok(document)
        : err(domainError("NOT_FOUND", "That document could not be found."));
    } catch {
      return err(
        domainError(
          "PERSISTENCE_FAILURE",
          "BranchWrite could not open this document.",
        ),
      );
    }
  }

  createDocument(title?: string): DocumentResult<DraftDocument> {
    const normalizedTitle = title?.trim() || DEFAULT_DOCUMENT_TITLE;
    const content = validateStructuredContent(initialDocumentContent()).json;

    try {
      return ok(
        this.repository.createWithInitialRevision({
          id: randomUUID(),
          title: normalizedTitle,
          content,
          contentHash: hashStructuredContent(content),
          revisionId: randomUUID(),
          createdAt: new Date().toISOString(),
        }),
      );
    } catch {
      return err(
        domainError(
          "PERSISTENCE_FAILURE",
          "BranchWrite could not create a document.",
        ),
      );
    }
  }

  renameDocument(
    documentId: string,
    title: string,
  ): DocumentResult<DraftDocument> {
    const normalizedTitle = title.trim();
    if (!normalizedTitle) {
      return err(
        domainError("VALIDATION_ERROR", "Document titles cannot be empty."),
      );
    }

    try {
      const document = this.repository.rename(
        documentId,
        normalizedTitle,
        new Date().toISOString(),
      );

      return document
        ? ok(document)
        : err(domainError("NOT_FOUND", "That document could not be found."));
    } catch {
      return err(
        domainError(
          "PERSISTENCE_FAILURE",
          "BranchWrite could not rename this document.",
        ),
      );
    }
  }

  saveDocumentContent(input: {
    documentId: string;
    content: unknown;
    expectedVersion: number;
  }): DocumentResult<DraftDocument> {
    try {
      const content = validateStructuredContent(input.content).json;
      const result = this.repository.saveContent({
        documentId: input.documentId,
        content,
        contentHash: hashStructuredContent(content),
        expectedVersion: input.expectedVersion,
        updatedAt: new Date().toISOString(),
      });

      if (result.kind === "not_found") {
        return err(
          domainError("NOT_FOUND", "That document could not be found."),
        );
      }

      if (result.kind === "stale") {
        return err(
          domainError(
            "STALE_WRITE",
            "This document changed in another session. Reload before saving again.",
            { actualVersion: result.actualVersion },
          ),
        );
      }

      return ok(result.document);
    } catch (error) {
      if (error instanceof StructuredContentValidationError) {
        return err(
          domainError(
            "VALIDATION_ERROR",
            "The draft contains unsupported or invalid formatting.",
          ),
        );
      }

      return err(
        domainError(
          "PERSISTENCE_FAILURE",
          "BranchWrite could not save this draft.",
        ),
      );
    }
  }
}
