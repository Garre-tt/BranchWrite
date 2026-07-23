import { mergeRequestSchema } from "@/application/contracts/merges";
import { getMergeService } from "@/application/document-service";
import {
  invalidRequestResponse,
  resultResponse,
} from "@/application/http-response";

export async function POST(request: Request) {
  const parsed = mergeRequestSchema.safeParse(await request.json());
  if (!parsed.success) return invalidRequestResponse();
  return resultResponse(getMergeService().merge(parsed.data));
}
