export const documentKeys = {
  all: ["documents"] as const,
  detail: (documentId: string) => ["documents", documentId] as const,
};

export const alternativeKeys = {
  list: (documentId: string) => ["alternatives", documentId] as const,
  detail: (alternativeId: string) =>
    ["alternatives", "detail", alternativeId] as const,
};
