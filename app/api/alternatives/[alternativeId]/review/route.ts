import { createReviewRequestSchema } from "@/application/contracts/reviews";
import { getReviewService } from "@/application/document-service";
import {
  invalidRequestResponse,
  resultResponse,
} from "@/application/http-response";

type RouteContext = { params: Promise<{ alternativeId: string }> };

export async function GET(_request: Request, context: RouteContext) {
  const { alternativeId } = await context.params;
  return resultResponse(getReviewService().latest(alternativeId));
}

export async function POST(request: Request, context: RouteContext) {
  const { alternativeId } = await context.params;
  const parsed = createReviewRequestSchema.safeParse(await request.json());
  if (!parsed.success) return invalidRequestResponse();
  return resultResponse(
    getReviewService().create({
      alternativeId,
      againstCurrentDraft: parsed.data.againstCurrentDraft,
      ...(parsed.data.expectedDocumentVersion === undefined
        ? {}
        : { expectedDocumentVersion: parsed.data.expectedDocumentVersion }),
    }),
  );
}
