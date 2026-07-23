import type { StructuredDocumentJson } from "@/editor/structured-content";

export type DocumentSummary = {
  id: string;
  title: string;
  currentVersion: number;
  createdAt: string;
  updatedAt: string;
};

export type DraftDocument = DocumentSummary & {
  content: StructuredDocumentJson;
  contentHash: string;
  schemaVersion: string;
};

export type SaveDocumentContentInput = {
  documentId: string;
  content: StructuredDocumentJson;
  contentHash: string;
  expectedVersion: number;
  updatedAt: string;
};

export type SaveDocumentContentResult =
  | { kind: "saved"; document: DraftDocument }
  | { kind: "not_found" }
  | { kind: "stale"; actualVersion: number };
