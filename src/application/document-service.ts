import { DocumentService } from "@/domain/document/document-service";
import { getRuntimeDatabase } from "@/persistence/runtime-database";
import { DocumentRepository } from "@/persistence/repositories/document-repository";
import { DeterministicMockProposalGenerator } from "@/domain/proposal/mock-proposal-generator";
import { ProposalRepository } from "@/persistence/repositories/proposal-repository";
import { ProposalService } from "@/application/proposal-service";
import { ReviewService } from "@/application/review-service";
import { ReviewRepository } from "@/persistence/repositories/review-repository";
import { MergeService } from "@/application/merge-service";

export function getDocumentService(): DocumentService {
  return new DocumentService(new DocumentRepository(getRuntimeDatabase()));
}

export function getMergeService(): MergeService {
  return new MergeService(getRuntimeDatabase());
}

export function getReviewService(): ReviewService {
  const database = getRuntimeDatabase();
  return new ReviewService(
    new ReviewRepository(database),
    new ProposalRepository(database),
    new DocumentRepository(database),
  );
}

export function getProposalService(): ProposalService {
  const database = getRuntimeDatabase();
  return new ProposalService(
    new ProposalRepository(database),
    new DeterministicMockProposalGenerator(),
  );
}
