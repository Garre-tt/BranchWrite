import { DocumentService } from "@/domain/document/document-service";
import { getRuntimeDatabase } from "@/persistence/runtime-database";
import { DocumentRepository } from "@/persistence/repositories/document-repository";
import { DeterministicMockProposalGenerator } from "@/domain/proposal/mock-proposal-generator";
import { ProposalRepository } from "@/persistence/repositories/proposal-repository";
import { ProposalService } from "@/application/proposal-service";

export function getDocumentService(): DocumentService {
  return new DocumentService(new DocumentRepository(getRuntimeDatabase()));
}

export function getProposalService(): ProposalService {
  const database = getRuntimeDatabase();
  return new ProposalService(
    new ProposalRepository(database),
    new DeterministicMockProposalGenerator(),
  );
}
