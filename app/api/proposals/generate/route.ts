import { generateProposalRequestSchema } from "@/application/contracts/proposals";
import { getProposalService } from "@/application/document-service";
import {
  invalidRequestResponse,
  resultResponse,
} from "@/application/http-response";

export async function POST(request: Request) {
  const parsed = generateProposalRequestSchema.safeParse(await request.json());
  if (!parsed.success) return invalidRequestResponse();
  return resultResponse(
    await getProposalService().generate(parsed.data, request.signal),
  );
}
