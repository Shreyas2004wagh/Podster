import { PrismaClient, Session, Track, UploadTarget } from "@prisma/client";
import {
  ISessionRepository,
  SessionId,
  TrackId,
  UserId,
  CreateSessionInput,
  UpdateSessionInput,
  CreateTrackInput,
  UpdateTrackInput,
  CreateUploadTargetInput,
  SessionWithTracks,
  SessionWithAll,
} from "./ISessionRepository.js";

/**
 * Prisma-based implementation of ISessionRepository
 * Handles all database operations for sessions, tracks, and upload targets
 */
export class PrismaSessionRepository implements ISessionRepository {
  constructor(private readonly prisma: PrismaClient) {}

  // Session CRUD operations
  async create(input: CreateSessionInput): Promise<Session> {
    return this.prisma.session.create({
      data: {
        title: input.title,
        hostId: input.hostId,
        guestToken: input.guestToken,
      },
    });
  }

  async findById(id: SessionId): Promise<Session | null> {
    return this.prisma.session.findUnique({
      where: { id },
    });
  }

  async findByIdWithTracks(id: SessionId): Promise<SessionWithTracks | null> {
    return this.prisma.session.findUnique({
      where: { id },
      include: {
        tracks: {
          orderBy: { createdAt: 'asc' },
        },
      },
    });
  }

  async findByIdWithAll(id: SessionId): Promise<SessionWithAll | null> {
    return this.prisma.session.findUnique({
      where: { id },
      include: {
        tracks: {
          orderBy: { createdAt: 'asc' },
        },
        uploadTargets: {
          orderBy: { createdAt: 'desc' },
        },
      },
    });
  }

  async findByHostId(hostId: UserId): Promise<Session[]> {
    return this.prisma.session.findMany({
      where: { hostId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async update(id: SessionId, input: UpdateSessionInput): Promise<Session> {
    return this.prisma.session.update({
      where: { id },
      data: {
        ...input,
        updatedAt: new Date(),
      },
    });
  }

  async delete(id: SessionId): Promise<void> {
    await this.prisma.session.delete({
      where: { id },
    });
  }

  // Track operations within sessions
  async addTrack(input: CreateTrackInput): Promise<Track> {
    return this.prisma.track.create({
      data: {
        sessionId: input.sessionId,
        userId: input.userId,
        kind: input.kind,
        objectKey: input.objectKey,
      },
    });
  }

  async findTrackById(trackId: TrackId): Promise<Track | null> {
    return this.prisma.track.findUnique({
      where: { id: trackId },
    });
  }

  async updateTrack(trackId: TrackId, input: UpdateTrackInput): Promise<Track> {
    return this.prisma.track.update({
      where: { id: trackId },
      data: input,
    });
  }

  async deleteTrack(trackId: TrackId): Promise<void> {
    await this.prisma.track.delete({
      where: { id: trackId },
    });
  }

  async findTracksBySessionId(sessionId: SessionId): Promise<Track[]> {
    return this.prisma.track.findMany({
      where: { sessionId },
      orderBy: { createdAt: 'asc' },
    });
  }

  // Upload target operations
  async createUploadTarget(input: CreateUploadTargetInput): Promise<UploadTarget> {
    return this.prisma.uploadTarget.create({
      data: {
        sessionId: input.sessionId,
        uploadId: input.uploadId,
        key: input.key,
        bucket: input.bucket,
        provider: input.provider,
        expiresAt: input.expiresAt,
      },
    });
  }

  async findUploadTargetBySessionId(sessionId: SessionId): Promise<UploadTarget | null> {
    return this.prisma.uploadTarget.findFirst({
      where: { sessionId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async deleteUploadTarget(id: string): Promise<void> {
    await this.prisma.uploadTarget.delete({
      where: { id },
    });
  }

  // Utility operations
  async exists(id: SessionId): Promise<boolean> {
    const count = await this.prisma.session.count({
      where: { id },
    });
    return count > 0;
  }

  async count(): Promise<number> {
    return this.prisma.session.count();
  }

  async findAll(limit = 50, offset = 0): Promise<Session[]> {
    return this.prisma.session.findMany({
      skip: offset,
      take: limit,
      orderBy: { createdAt: 'desc' },
    });
  }
}