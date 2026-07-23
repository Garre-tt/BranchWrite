import { createDocumentRequestSchema } from "@/application/contracts/documents";
import { getDocumentService } from "@/application/document-service";
import {
  invalidRequestResponse,
  resultResponse,
} from "@/application/http-response";

export const runtime = "nodejs";

export function GET() {
  return resultResponse(getDocumentService().listDocuments());
}

export async function POST(request: Request) {
  const parsed = createDocumentRequestSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    return invalidRequestResponse();
  }

  return resultResponse(getDocumentService().createDocument(parsed.data.title));
}
