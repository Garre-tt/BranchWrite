import { saveAlternativeRequestSchema } from "@/application/contracts/proposals";
import { getProposalService } from "@/application/document-service";
import {
  invalidRequestResponse,
  resultResponse,
} from "@/application/http-response";

type RouteContext = {
  params: Promise<{ alternativeId: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const { alternativeId } = await context.params;
  return resultResponse(getProposalService().getAlternative(alternativeId));
}

export async function PUT(request: Request, context: RouteContext) {
  const { alternativeId } = await context.params;
  const parsed = saveAlternativeRequestSchema.safeParse(await request.json());
  if (!parsed.success) return invalidRequestResponse();
  return resultResponse(
    getProposalService().saveAlternative({
      alternativeId,
      ...parsed.data,
    }),
  );
}
