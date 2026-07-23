import { renameDocumentRequestSchema } from "@/application/contracts/documents";
import { getDocumentService } from "@/application/document-service";
import {
  invalidRequestResponse,
  resultResponse,
} from "@/application/http-response";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ documentId: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const { documentId } = await context.params;
  return resultResponse(getDocumentService().getDocument(documentId));
}

export async function PATCH(request: Request, context: RouteContext) {
  const parsed = renameDocumentRequestSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    return invalidRequestResponse();
  }

  const { documentId } = await context.params;
  return resultResponse(
    getDocumentService().renameDocument(documentId, parsed.data.title),
  );
}
