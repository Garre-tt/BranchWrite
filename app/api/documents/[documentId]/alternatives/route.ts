import { getProposalService } from "@/application/document-service";
import { resultResponse } from "@/application/http-response";

type RouteContext = {
  params: Promise<{ documentId: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const { documentId } = await context.params;
  return resultResponse(getProposalService().listAlternatives(documentId));
}
