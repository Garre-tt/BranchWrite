import { z } from "zod";

export const createReviewRequestSchema = z
  .object({
    againstCurrentDraft: z.boolean().default(false),
    expectedDocumentVersion: z.number().int().nonnegative().optional(),
  })
  .strict()
  .refine(
    (value) =>
      !value.againstCurrentDraft || value.expectedDocumentVersion !== undefined,
  );
