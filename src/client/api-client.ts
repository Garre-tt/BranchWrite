import type {
  DocumentSummary,
  DraftDocument,
} from "@/domain/document/document-types";
import type { StructuredDocumentJson } from "@/editor/structured-content";

type SuccessEnvelope<Value> = {
  data: Value;
};

type ErrorEnvelope = {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
};

export class ApiClientError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "ApiClientError";
  }
}

async function request<Value>(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Value> {
  const response = await fetch(input, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });
  const payload = (await response.json()) as
    SuccessEnvelope<Value> | ErrorEnvelope;

  if (!response.ok || !("data" in payload)) {
    const error =
      "error" in payload
        ? payload.error
        : {
            code: "PERSISTENCE_FAILURE",
            message: "BranchWrite received an unexpected response.",
          };
    throw new ApiClientError(
      error.code,
      error.message,
      response.status,
      error.details,
    );
  }

  return payload.data;
}

export function listDocuments(): Promise<DocumentSummary[]> {
  return request("/api/documents");
}

export function loadDocument(documentId: string): Promise<DraftDocument> {
  return request(`/api/documents/${encodeURIComponent(documentId)}`);
}

export function createDocument(title?: string): Promise<DraftDocument> {
  return request("/api/documents", {
    method: "POST",
    body: JSON.stringify(title === undefined ? {} : { title }),
  });
}

export function renameDocument(
  documentId: string,
  title: string,
): Promise<DraftDocument> {
  return request(`/api/documents/${encodeURIComponent(documentId)}`, {
    method: "PATCH",
    body: JSON.stringify({ title }),
  });
}

export function saveDocumentContent(input: {
  documentId: string;
  content: StructuredDocumentJson;
  expectedVersion: number;
}): Promise<DraftDocument> {
  return request(
    `/api/documents/${encodeURIComponent(input.documentId)}/content`,
    {
      method: "PUT",
      body: JSON.stringify({
        content: input.content,
        expectedVersion: input.expectedVersion,
      }),
    },
  );
}
