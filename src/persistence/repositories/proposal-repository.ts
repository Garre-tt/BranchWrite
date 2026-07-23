import { and, desc, eq } from "drizzle-orm";

import { PersistedDocumentError } from "@/domain/document/document-errors";
import type {
  Alternative,
  AlternativeSummary,
  CompletedProposal,
  DraftRevision,
  QuickAction,
} from "@/domain/proposal/proposal-types";
import { validateStructuredContent } from "@/editor/content-validation";
import { SCHEMA_VERSION } from "@/editor/schema-version";
import type { StructuredDocumentJson } from "@/editor/structured-content";
import type { DatabaseConnection } from "@/persistence/db";
import {
  alternatives,
  documents,
  draftRevisions,
  proposals,
} from "@/persistence/schema";

type ProposalRow = typeof proposals.$inferSelect;
type AlternativeRow = typeof alternatives.$inferSelect;
type RevisionRow = typeof draftRevisions.$inferSelect;

export type CompletedPairRecord = {
  proposalId: string;
  alternativeId: string;
  documentId: string;
  baseRevisionId: string;
  scopeBlockIds: readonly string[];
  prompt: string;
  normalizedPrompt: string;
  generatorVersion: string;
  inputHash: string;
  content: StructuredDocumentJson;
  contentHash: string;
  label: QuickAction;
  createdAt: string;
};

export type SaveAlternativeRecord = {
  alternativeId: string;
  expectedVersion: number;
  content: StructuredDocumentJson;
  contentHash: string;
  isEdited: boolean;
  updatedAt: string;
};

function parseContent(value: string, owner: string): StructuredDocumentJson {
  try {
    return validateStructuredContent(JSON.parse(value)).json;
  } catch (error) {
    throw new PersistedDocumentError(`${owner} contains invalid content.`, {
      cause: error,
    });
  }
}

function toRevision(row: RevisionRow): DraftRevision {
  if (row.schemaVersion !== SCHEMA_VERSION) {
    throw new PersistedDocumentError(
      `Revision "${row.id}" uses an unsupported schema version.`,
    );
  }
  return {
    id: row.id,
    documentId: row.documentId,
    parentRevisionId: row.parentRevisionId,
    content: parseContent(row.contentJson, `Revision "${row.id}"`),
    contentHash: row.contentHash,
    schemaVersion: row.schemaVersion,
    cause: row.cause as DraftRevision["cause"],
    createdAt: row.createdAt,
  };
}

function toCompletedProposal(row: ProposalRow): CompletedProposal {
  if (
    row.status !== "completed" ||
    row.contentJson === null ||
    row.contentHash === null ||
    row.completedAt === null
  ) {
    throw new PersistedDocumentError(
      `Proposal "${row.id}" is not a completed Proposal.`,
    );
  }
  return {
    id: row.id,
    documentId: row.documentId,
    baseRevisionId: row.baseRevisionId,
    scopeBlockIds: JSON.parse(row.scopeBlockIdsJson) as string[],
    prompt: row.prompt,
    normalizedPrompt: row.normalizedPrompt,
    generatorVersion: row.generatorVersion,
    inputHash: row.inputHash,
    content: parseContent(row.contentJson, `Proposal "${row.id}"`),
    contentHash: row.contentHash,
    label: row.label as QuickAction,
    status: "completed",
    createdAt: row.createdAt,
    completedAt: row.completedAt,
  };
}

function toAlternative(
  row: AlternativeRow,
  proposal: ProposalRow,
): Alternative {
  return {
    id: row.id,
    documentId: row.documentId,
    proposalId: row.proposalId,
    parentAlternativeId: row.parentAlternativeId,
    content: parseContent(row.contentJson, `Alternative "${row.id}"`),
    contentHash: row.contentHash,
    contentVersion: row.contentVersion,
    isEdited: row.isEdited,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    proposal: toCompletedProposal(proposal),
  };
}

export class ProposalRepository {
  constructor(private readonly connection: DatabaseConnection) {}

  createOrReuseBaseRevision(input: {
    documentId: string;
    expectedDocumentVersion: number;
    revisionId: string;
    createdAt: string;
  }):
    | { kind: "ready"; revision: DraftRevision }
    | { kind: "not_found" }
    | { kind: "stale"; actualVersion: number } {
    return this.connection.db.transaction((transaction) => {
      const document = transaction
        .select()
        .from(documents)
        .where(eq(documents.id, input.documentId))
        .get();
      if (!document) return { kind: "not_found" } as const;
      if (document.currentVersion !== input.expectedDocumentVersion) {
        return {
          kind: "stale",
          actualVersion: document.currentVersion,
        } as const;
      }

      const matching = transaction
        .select()
        .from(draftRevisions)
        .where(
          and(
            eq(draftRevisions.documentId, input.documentId),
            eq(draftRevisions.contentHash, document.currentContentHash),
          ),
        )
        .orderBy(desc(draftRevisions.createdAt))
        .get();
      if (matching) {
        return { kind: "ready", revision: toRevision(matching) } as const;
      }

      const parent = transaction
        .select()
        .from(draftRevisions)
        .where(eq(draftRevisions.documentId, input.documentId))
        .orderBy(desc(draftRevisions.createdAt))
        .get();

      transaction
        .insert(draftRevisions)
        .values({
          id: input.revisionId,
          documentId: input.documentId,
          parentRevisionId: parent?.id ?? null,
          contentJson: document.currentContentJson,
          contentHash: document.currentContentHash,
          schemaVersion: document.schemaVersion,
          cause: "proposal_base",
          createdAt: input.createdAt,
        })
        .run();

      const created = transaction
        .select()
        .from(draftRevisions)
        .where(eq(draftRevisions.id, input.revisionId))
        .get();
      if (!created) {
        throw new PersistedDocumentError("The Proposal base was not created.");
      }
      return { kind: "ready", revision: toRevision(created) } as const;
    });
  }

  createCompletedPair(record: CompletedPairRecord): Alternative {
    return this.connection.db.transaction((transaction) => {
      const contentJson = JSON.stringify(record.content);
      transaction
        .insert(proposals)
        .values({
          id: record.proposalId,
          documentId: record.documentId,
          baseRevisionId: record.baseRevisionId,
          scopeBlockIdsJson: JSON.stringify(record.scopeBlockIds),
          prompt: record.prompt,
          normalizedPrompt: record.normalizedPrompt,
          generatorVersion: record.generatorVersion,
          inputHash: record.inputHash,
          contentJson,
          contentHash: record.contentHash,
          label: record.label,
          status: "completed",
          createdAt: record.createdAt,
          completedAt: record.createdAt,
        })
        .run();
      transaction
        .insert(alternatives)
        .values({
          id: record.alternativeId,
          documentId: record.documentId,
          proposalId: record.proposalId,
          parentAlternativeId: null,
          contentJson,
          contentHash: record.contentHash,
          contentVersion: 0,
          isEdited: false,
          createdAt: record.createdAt,
          updatedAt: record.createdAt,
        })
        .run();

      const alternative = transaction
        .select()
        .from(alternatives)
        .where(eq(alternatives.id, record.alternativeId))
        .get();
      const proposal = transaction
        .select()
        .from(proposals)
        .where(eq(proposals.id, record.proposalId))
        .get();
      if (!alternative || !proposal) {
        throw new PersistedDocumentError(
          "The completed Proposal was not available after creation.",
        );
      }
      return toAlternative(alternative, proposal);
    });
  }

  findAlternativeById(alternativeId: string): Alternative | null {
    const row = this.connection.db
      .select({ alternative: alternatives, proposal: proposals })
      .from(alternatives)
      .innerJoin(proposals, eq(alternatives.proposalId, proposals.id))
      .where(eq(alternatives.id, alternativeId))
      .get();
    return row ? toAlternative(row.alternative, row.proposal) : null;
  }

  listAlternatives(documentId: string): AlternativeSummary[] {
    return this.connection.db
      .select({ alternative: alternatives, proposal: proposals })
      .from(alternatives)
      .innerJoin(proposals, eq(alternatives.proposalId, proposals.id))
      .where(
        and(
          eq(alternatives.documentId, documentId),
          eq(proposals.status, "completed"),
        ),
      )
      .orderBy(alternatives.createdAt)
      .all()
      .map(({ alternative, proposal }) => ({
        id: alternative.id,
        proposalId: proposal.id,
        label: proposal.label as QuickAction,
        prompt: proposal.prompt,
        isEdited: alternative.isEdited,
        createdAt: alternative.createdAt,
      }));
  }

  saveAlternative(
    record: SaveAlternativeRecord,
  ):
    | { kind: "saved"; alternative: Alternative }
    | { kind: "not_found" }
    | { kind: "stale"; actualVersion: number } {
    return this.connection.db.transaction((transaction) => {
      const existing = transaction
        .select()
        .from(alternatives)
        .where(eq(alternatives.id, record.alternativeId))
        .get();
      if (!existing) return { kind: "not_found" } as const;
      if (existing.contentVersion !== record.expectedVersion) {
        return {
          kind: "stale",
          actualVersion: existing.contentVersion,
        } as const;
      }

      if (existing.contentHash !== record.contentHash) {
        transaction
          .update(alternatives)
          .set({
            contentJson: JSON.stringify(record.content),
            contentHash: record.contentHash,
            contentVersion: existing.contentVersion + 1,
            isEdited: existing.isEdited || record.isEdited,
            updatedAt: record.updatedAt,
          })
          .where(
            and(
              eq(alternatives.id, record.alternativeId),
              eq(alternatives.contentVersion, record.expectedVersion),
            ),
          )
          .run();
      }

      const saved = transaction
        .select({ alternative: alternatives, proposal: proposals })
        .from(alternatives)
        .innerJoin(proposals, eq(alternatives.proposalId, proposals.id))
        .where(eq(alternatives.id, record.alternativeId))
        .get();
      if (!saved) {
        throw new PersistedDocumentError("The Alternative disappeared.");
      }
      return {
        kind: "saved",
        alternative: toAlternative(saved.alternative, saved.proposal),
      } as const;
    });
  }
}
