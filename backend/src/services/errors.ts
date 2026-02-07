export class SessionNotFoundError extends Error {
  constructor(sessionId: string) {
    super(`Session not found: ${sessionId}`);
    this.name = "SessionNotFoundError";
  }
}

export class RecordingNotFoundError extends Error {
  constructor(sessionId: string) {
    super(`Recording not found for session: ${sessionId}`);
    this.name = "RecordingNotFoundError";
  }
}

export class RecordingUrlGenerationError extends Error {
  constructor(sessionId: string, cause?: unknown) {
    super(`Failed to generate recording URL for session: ${sessionId}`);
    this.name = "RecordingUrlGenerationError";
    this.cause = cause;
  }
}
