export class SessionNotFoundError extends Error {
  constructor(sessionId: string) {
    super(`Session not found: ${sessionId}`);
    this.name = "SessionNotFoundError";
  }
}

export class SessionConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SessionConflictError";
  }
}

export class UploadTargetNotFoundError extends Error {
  constructor(uploadId: string) {
    super(`Upload target not found: ${uploadId}`);
    this.name = "UploadTargetNotFoundError";
  }
}

export class UploadTargetExpiredError extends Error {
  constructor(uploadId: string) {
    super(`Upload target expired: ${uploadId}`);
    this.name = "UploadTargetExpiredError";
  }
}

export class UploadTargetSessionMismatchError extends Error {
  constructor(sessionId: string, uploadId: string) {
    super(`Upload target ${uploadId} does not belong to session ${sessionId}`);
    this.name = "UploadTargetSessionMismatchError";
  }
}

export class UploadOwnershipError extends Error {
  constructor(uploadId: string) {
    super(`Upload target ${uploadId} does not belong to the authenticated user`);
    this.name = "UploadOwnershipError";
  }
}

export class UploadTrackNotFoundError extends Error {
  constructor(uploadId: string) {
    super(`Track missing for upload completion: ${uploadId}`);
    this.name = "UploadTrackNotFoundError";
  }
}

export class InvalidUploadPartsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidUploadPartsError";
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

export class TrackNotFoundError extends Error {
  constructor(trackId: string) {
    super(`Track not found: ${trackId}`);
    this.name = "TrackNotFoundError";
  }
}

export class TrackSessionMismatchError extends Error {
  constructor(sessionId: string, trackId: string) {
    super(`Track ${trackId} does not belong to session ${sessionId}`);
    this.name = "TrackSessionMismatchError";
  }
}

export class TrackNotUploadedError extends Error {
  constructor(trackId: string) {
    super(`Track not uploaded yet: ${trackId}`);
    this.name = "TrackNotUploadedError";
  }
}

export class TrackStorageMissingError extends Error {
  constructor(trackId: string) {
    super(`Stored object missing for track: ${trackId}`);
    this.name = "TrackStorageMissingError";
  }
}

export class DownloadUrlGenerationError extends Error {
  constructor(trackId: string, cause?: unknown) {
    super(`Failed to generate download URL for track: ${trackId}`);
    this.name = "DownloadUrlGenerationError";
    this.cause = cause;
  }
}
