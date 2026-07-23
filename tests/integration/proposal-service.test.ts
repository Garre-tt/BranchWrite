import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { ProposalService } from "@/application/proposal-service";
import { ReviewService } from "@/application/review-service";
import { DocumentService } from "@/domain/document/document-service";
import { DeterministicMockProposalGenerator } from "@/domain/proposal/mock-proposal-generator";
import type { ProposalGenerator } from "@/domain/proposal/proposal-types";
import type { StructuredDocumentJson } from "@/editor/structured-content";
import { DocumentRepository } from "@/persistence/repositories/document-repository";
import { ProposalRepository } from "@/persistence/repositories/proposal-repository";
import { ReviewRepository } from "@/persistence/repositories/review-repository";
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

  it.each([
    {
      name: "generator failure",
      expectedCode: "GENERATION_FAILED",
      generator: {
        generate: async () => {
          throw new Error("Simulated generator failure.");
        },
      } satisfies ProposalGenerator,
    },
    {
      name: "invalid generator output",
      expectedCode: "INVALID_GENERATOR_OUTPUT",
      generator: {
        generate: async () => ({
          content: {
            type: "doc" as const,
            content: [{ type: "paragraph", attrs: { id: "wrong-id" } }],
          },
          label: "Improve clarity" as const,
          generatorVersion: "invalid-test",
        }),
      } satisfies ProposalGenerator,
    },
  ])(
    "leaves My Draft and the workspace unchanged after $name",
    async ({ generator, expectedCode }) => {
      const created = documentsService.createDocument("Protected Draft");
      if (!created.ok) throw new Error("Document setup failed.");
      const scopeId = String(created.value.content.content[0]?.attrs?.id ?? "");
      const service = new ProposalService(proposalRepository, generator);
      const result = await service.generate(
        {
          documentId: created.value.id,
          expectedDocumentVersion: created.value.currentVersion,
          scopeBlockIds: [scopeId],
          prompt: "Improve clarity",
        },
        new AbortController().signal,
      );
      expect(result.ok ? "ok" : result.error.code).toBe(expectedCode);
      expect(database.db.select().from(proposals).all()).toHaveLength(0);
      expect(database.db.select().from(alternatives).all()).toHaveLength(0);
      expect(documentsService.getDocument(created.value.id)).toEqual({
        ok: true,
        value: created.value,
      });
    },
  );

  it("lists completed Alternatives chronologically with edited state", async () => {
    const first = await generate();
    const edited = structuredClone(first.alternative.content);
    edited.content[0]!.content![0]!.text = "Edited chronology entry.";
    proposalService.saveAlternative({
      alternativeId: first.alternative.id,
      content: edited,
      expectedVersion: 0,
    });

    await new Promise((resolve) => setTimeout(resolve, 2));
    const secondResult = await proposalService.generate(
      {
        documentId: first.document.id,
        expectedDocumentVersion: first.document.currentVersion,
        scopeBlockIds: ["scope-a"],
        prompt: "Expand",
      },
      new AbortController().signal,
    );
    if (!secondResult.ok) throw new Error("Second generation failed.");

    const listed = proposalService.listAlternatives(first.document.id);
    expect(listed.ok && listed.value.map((entry) => entry.id)).toEqual([
      first.alternative.id,
      secondResult.value.id,
    ]);
    expect(listed.ok && listed.value[0]?.isEdited).toBe(true);
  });

  it("persists Review snapshots and invalidates them after Alternative edits", async () => {
    const { alternative } = await generate();
    const reviews = new ReviewService(
      new ReviewRepository(database),
      proposalRepository,
      new DocumentRepository(database),
    );
    const created = reviews.create({
      alternativeId: alternative.id,
      againstCurrentDraft: false,
    });
    expect(created.ok && created.value.status).toBe("current");

    const edited = structuredClone(alternative.content);
    edited.content[0]!.content![0]!.text = "Edited after Review.";
    expect(
      proposalService.saveAlternative({
        alternativeId: alternative.id,
        content: edited,
        expectedVersion: 0,
      }).ok,
    ).toBe(true);
    const latest = reviews.latest(alternative.id);
    expect(latest.ok && latest.value.status).toBe("stale");
  });

  it("ignores unrelated Draft changes but never relocates a missing target", async () => {
    const { document, alternative } = await generate();
    const reviews = new ReviewService(
      new ReviewRepository(database),
      proposalRepository,
      new DocumentRepository(database),
    );
    const withUnrelated = structuredClone(document.content);
    withUnrelated.content.push({
      type: "paragraph",
      attrs: { id: "unrelated" },
      content: [{ type: "text", text: "Unrelated change." }],
    });
    const saved = documentsService.saveDocumentContent({
      documentId: document.id,
      content: withUnrelated,
      expectedVersion: document.currentVersion,
    });
    if (!saved.ok) throw new Error("Unrelated save failed.");
    const stillCurrent = reviews.create({
      alternativeId: alternative.id,
      againstCurrentDraft: false,
    });
    expect(stillCurrent.ok && stillCurrent.value.status).toBe("current");

    const withoutTarget = structuredClone(withUnrelated);
    withoutTarget.content = withoutTarget.content.filter(
      (block) => block.attrs?.id !== "scope-a",
    );
    const deleted = documentsService.saveDocumentContent({
      documentId: document.id,
      content: withoutTarget,
      expectedVersion: saved.value.currentVersion,
    });
    if (!deleted.ok) throw new Error("Target deletion failed.");
    const stale = reviews.create({
      alternativeId: alternative.id,
      againstCurrentDraft: true,
      expectedDocumentVersion: deleted.value.currentVersion,
    });
    expect(stale.ok && stale.value.status).toBe("stale");
    expect(stale.ok && stale.value.staleReason).toBe("missing-target");
  });
});
