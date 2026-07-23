import { DocumentService } from "@/domain/document/document-service";
import { getRuntimeDatabase } from "@/persistence/runtime-database";
import { DocumentRepository } from "@/persistence/repositories/document-repository";

export function getDocumentService(): DocumentService {
  return new DocumentService(new DocumentRepository(getRuntimeDatabase()));
}
