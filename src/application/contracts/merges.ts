import { z } from "zod";

export const mergeRequestSchema = z
  .object({
    documentId: z.string().uuid(),
    alternativeId: z.string().uuid(),
    diffSnapshotId: z.string().uuid(),
    hunkIds: z.array(z.string().min(1)).min(1),
    expectedTargets: z
      .array(
        z.object({
          blockId: z.string().min(1),
          beforeHash: z.string().length(64),
        }),
      )
      .min(1),
    acceptanceKind: z.enum(["sentence", "block", "section"]),
    sectionReviewAcknowledged: z.boolean(),
  })
  .strict();

export const revertRequestSchema = z
  .object({ expectedCurrentHash: z.string().length(64) })
  .strict();
