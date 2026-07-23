import { z } from "zod";

export const generateProposalRequestSchema = z
  .object({
    documentId: z.string().uuid(),
    expectedDocumentVersion: z.number().int().nonnegative(),
    scopeBlockIds: z.array(z.string().trim().min(1)).min(1),
    prompt: z.string().trim().min(1).max(2_000),
  })
  .strict();

export const saveAlternativeRequestSchema = z
  .object({
    content: z.unknown(),
    expectedVersion: z.number().int().nonnegative(),
  })
  .strict();
