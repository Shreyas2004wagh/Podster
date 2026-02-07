export class StorageObjectNotFoundError extends Error {
  readonly key: string;

  constructor(key: string, cause?: unknown) {
    super(`Object not found in storage: ${key}`);
    this.name = "StorageObjectNotFoundError";
    this.key = key;
    this.cause = cause;
  }
}

export class StorageProviderError extends Error {
  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = "StorageProviderError";
    this.cause = cause;
  }
}
