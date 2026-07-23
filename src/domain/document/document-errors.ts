export class PersistedDocumentError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "PersistedDocumentError";
  }
}
