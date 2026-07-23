export const documentKeys = {
  all: ["documents"] as const,
  detail: (documentId: string) => ["documents", documentId] as const,
};
