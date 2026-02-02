// Repository interfaces
export type { 
  ISessionRepository,
  SessionId,
  TrackId,
  UserId,
  CreateSessionInput,
  UpdateSessionInput,
  SessionWithTracks,
  SessionWithAll
} from "./ISessionRepository.js";

export type { 
  ITrackRepository,
  CreateTrackInput as TrackCreateInput,
  UpdateTrackInput as TrackUpdateInput,
  TrackFilter
} from "./ITrackRepository.js";

export type { 
  IUploadTargetRepository,
  UploadTargetId,
  CreateUploadTargetInput as UploadTargetCreateInput,
  UpdateUploadTargetInput as UploadTargetUpdateInput,
  UploadTargetFilter
} from "./IUploadTargetRepository.js";

// Repository implementations
export { PrismaSessionRepository } from "./PrismaSessionRepository.js";
export { PrismaTrackRepository } from "./PrismaTrackRepository.js";
export { PrismaUploadTargetRepository } from "./PrismaUploadTargetRepository.js";

// Commonly used input types (avoiding duplicates)
export type { CreateTrackInput, CreateUploadTargetInput } from "./ISessionRepository.js";