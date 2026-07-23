import { revertRequestSchema } from "@/application/contracts/merges";
import { getMergeService } from "@/application/document-service";
import {
  invalidRequestResponse,
  resultResponse,
} from "@/application/http-response";

type Context = { params: Promise<{ documentId: string }> };
export async function POST(request: Request, context: Context) {
  const parsed = revertRequestSchema.safeParse(await request.json());
  if (!parsed.success) return invalidRequestResponse();
  const { documentId } = await context.params;
  return resultResponse(
    getMergeService().revert(documentId, parsed.data.expectedCurrentHash),
  );
}
