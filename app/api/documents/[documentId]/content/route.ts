import { saveDocumentContentRequestSchema } from "@/application/contracts/documents";
import { getDocumentService } from "@/application/document-service";
import {
  invalidRequestResponse,
  resultResponse,
} from "@/application/http-response";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ documentId: string }>;
};

export async function PUT(request: Request, context: RouteContext) {
  const parsed = saveDocumentContentRequestSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    return invalidRequestResponse();
  }

  const { documentId } = await context.params;
  return resultResponse(
    getDocumentService().saveDocumentContent({
      documentId,
      content: parsed.data.content,
      expectedVersion: parsed.data.expectedVersion,
    }),
  );
}
