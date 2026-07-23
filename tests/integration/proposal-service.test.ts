import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { ProposalService } from "@/application/proposal-service";
import { DocumentService } from "@/domain/document/document-service";
import { DeterministicMockProposalGenerator } from "@/domain/proposal/mock-proposal-generator";
import type { StructuredDocumentJson } from "@/editor/structured-content";
import { DocumentRepository } from "@/persistence/repositories/document-repository";
import { ProposalRepository } from "@/persistence/repositories/proposal-repository";
import { alternatives, documents, proposals } from "@/persistence/schema";
import {
  createTestDatabase,
  type TestDatabase,
} from "../helpers/test-database";

describe("Proposal service persistence", () => {
  let database: TestDatabase;
  let documentsService: DocumentService;
  let proposalRepository: ProposalRepository;
  let proposalService: ProposalService;

  beforeEach(() => {
    database = createTestDatabase();
    documentsService = new DocumentService(new DocumentRepository(database));
    proposalRepository = new ProposalRepository(database);
    proposalService = new ProposalService(
      proposalRepository,
      new DeterministicMockProposalGenerator(0),
    );
  });

  afterEach(() => database.cleanup());

  async function generate() {
    const created = documentsService.createDocument("Test");
    if (!created.ok) throw new Error("Document setup failed.");
    const content: StructuredDocumentJson = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          attrs: { id: "scope-a" },
          content: [
            {
              type: "text",
              text: "We utilize this draft in order to test it.",
            },
          ],
        },
      ],
    };
    const saved = documentsService.saveDocumentContent({
      documentId: created.value.id,
      content,
      expectedVersion: created.value.currentVersion,
    });
    if (!saved.ok) throw new Error("Document save setup failed.");
    const generated = await proposalService.generate(
      {
        documentId: saved.value.id,
        expectedDocumentVersion: saved.value.currentVersion,
        scopeBlockIds: ["scope-a"],
        prompt: "Improve clarity",
      },
      new AbortController().signal,
    );
    if (!generated.ok) {
      throw new Error(`Generation failed: ${generated.error.code}`);
    }
    return { document: saved.value, alternative: generated.value };
  }

  it("atomically persists one immutable Proposal and cloned Alternative", async () => {
    const { document, alternative } = await generate();
    expect(database.db.select().from(proposals).all()).toHaveLength(1);
    expect(database.db.select().from(alternatives).all()).toHaveLength(1);
    expect(alternative.content).toEqual(alternative.proposal.content);
    expect(alternative.content).not.toBe(alternative.proposal.content);

    const edited = structuredClone(alternative.content);
    edited.content[0]!.content![0]!.text = "An independently edited result.";
    const saved = proposalService.saveAlternative({
      alternativeId: alternative.id,
      content: edited,
      expectedVersion: alternative.contentVersion,
    });
    expect(saved.ok && saved.value.isEdited).toBe(true);
    expect(saved.ok && saved.value.contentVersion).toBe(1);

    const proposalRow = database.db
      .select()
      .from(proposals)
      .where(eq(proposals.id, alternative.proposal.id))
      .get();
    const documentRow = database.db
      .select()
      .from(documents)
      .where(eq(documents.id, document.id))
      .get();
    expect(JSON.parse(proposalRow!.contentJson!)).toEqual(
      alternative.proposal.content,
    );
    expect(JSON.parse(documentRow!.currentContentJson)).toEqual(
      document.content,
    );
  });

  it("rolls back the Proposal when Alternative insertion fails", async () => {
    const { alternative } = await generate();
    expect(() =>
      proposalRepository.createCompletedPair({
        proposalId: "second-proposal",
        alternativeId: alternative.id,
        documentId: alternative.documentId,
        baseRevisionId: alternative.proposal.baseRevisionId,
        scopeBlockIds: alternative.proposal.scopeBlockIds,
        prompt: "Expand",
        normalizedPrompt: "expand",
        generatorVersion: "test",
        inputHash: "test",
        content: alternative.content,
        contentHash: alternative.contentHash,
        label: "Expand",
        createdAt: new Date().toISOString(),
      }),
    ).toThrow();
    expect(
      database.db
        .select()
        .from(proposals)
        .where(eq(proposals.id, "second-proposal"))
        .get(),
    ).toBeUndefined();
  });

  it("rejects stale and topology-changing Alternative saves", async () => {
    const { alternative } = await generate();
    const changed = structuredClone(alternative.content);
    changed.content[0]!.attrs!.id = "different";
    const invalid = proposalService.saveAlternative({
      alternativeId: alternative.id,
      content: changed,
      expectedVersion: 0,
    });
    expect(invalid.ok ? "ok" : invalid.error.code).toBe("VALIDATION_ERROR");

    const edited = structuredClone(alternative.content);
    edited.content[0]!.content![0]!.text = "Edited";
    expect(
      proposalService.saveAlternative({
        alternativeId: alternative.id,
        content: edited,
        expectedVersion: 0,
      }).ok,
    ).toBe(true);
    const stale = proposalService.saveAlternative({
      alternativeId: alternative.id,
      content: alternative.content,
      expectedVersion: 0,
    });
    expect(stale.ok ? "ok" : stale.error.code).toBe("STALE_ALTERNATIVE");
  });

  it("persists no Proposal or Alternative after cancellation", async () => {
    const created = documentsService.createDocument("Cancelled");
    if (!created.ok) throw new Error("Document setup failed.");
    const controller = new AbortController();
    controller.abort();
    const result = await proposalService.generate(
      {
        documentId: created.value.id,
        expectedDocumentVersion: created.value.currentVersion,
        scopeBlockIds: [
          String(created.value.content.content[0]?.attrs?.id ?? ""),
        ],
        prompt: "Expand",
      },
      controller.signal,
    );
    expect(result.ok ? "ok" : result.error.code).toBe("GENERATION_CANCELLED");
    expect(database.db.select().from(proposals).all()).toHaveLength(0);
    expect(database.db.select().from(alternatives).all()).toHaveLength(0);
  });
});
