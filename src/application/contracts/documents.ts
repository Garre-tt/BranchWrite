import { z } from "zod";

export const createDocumentRequestSchema = z
  .object({
    title: z.string().max(200).optional(),
  })
  .strict();

export const renameDocumentRequestSchema = z
  .object({
    title: z.string().max(200),
  })
  .strict();

export const saveDocumentContentRequestSchema = z
  .object({
    content: z.unknown(),
    expectedVersion: z.number().int().nonnegative(),
  })
  .strict();
