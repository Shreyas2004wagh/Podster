import { Prisma, PrismaClient, Session, SessionStatus, Track, UploadTarget } from "@prisma/client";
import { SessionConflictError, SessionNotFoundError } from "../services/errors.js";
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

  async markLiveIfDraft(id: SessionId): Promise<void> {
    await this.prisma.session.updateMany({
      where: { id, status: SessionStatus.DRAFT },
      data: { status: SessionStatus.LIVE }
    });
  }

  async registerUpload(track: CreateTrackInput, target: CreateUploadTargetInput): Promise<Track> {
    return this.prisma.$transaction(async (tx) => {
      const { sessionId, userId } = track;
      const session = await this.lockSession(tx, sessionId);
      if (session.status === SessionStatus.COMPLETE) {
        throw new SessionConflictError("Completed sessions cannot accept new uploads");
      }

      const incompleteTracks = await tx.track.findMany({
        where: { sessionId, userId, completedAt: null },
        select: { objectKey: true }
      });
      const pendingTargets = {
        sessionId,
        key: { in: incompleteTracks.map(({ objectKey }) => objectKey) }
      };
      const activeTarget = await tx.uploadTarget.findFirst({
        where: { ...pendingTargets, expiresAt: { gt: new Date() } },
        select: { id: true }
      });
      if (activeTarget) {
        throw new SessionConflictError("An upload is already in progress for this participant");
      }

      await tx.uploadTarget.deleteMany({ where: pendingTargets });
      await tx.track.deleteMany({ where: { sessionId, userId, completedAt: null } });
      await tx.uploadTarget.create({ data: target });
      const createdTrack = await tx.track.create({ data: track });
      if (session.status !== SessionStatus.UPLOADING) {
        await tx.session.update({ where: { id: sessionId }, data: { status: SessionStatus.UPLOADING } });
      }
      return createdTrack;
    });
  }

  async finish(id: SessionId): Promise<SessionWithTracks> {
    return this.prisma.$transaction(async (tx) => {
      const session = await this.lockSession(tx, id);
      const tracks = await tx.track.findMany({ where: { sessionId: id }, orderBy: { createdAt: "asc" } });
      if (session.status === SessionStatus.COMPLETE) {
        return { ...session, tracks };
      }
      if (!tracks.some((track) => track.completedAt)) {
        throw new SessionConflictError("Upload at least one recording before finishing the session");
      }
      if (tracks.some((track) => !track.completedAt) || await tx.uploadTarget.count({ where: { sessionId: id } })) {
        throw new SessionConflictError("Wait for pending uploads to finish before closing the session");
      }
      return tx.session.update({
        where: { id },
        data: { status: SessionStatus.COMPLETE },
        include: { tracks: { orderBy: { createdAt: "asc" } } }
      });
    });
  }

  // Registration and closure serialize on the same row across API instances.
  private async lockSession(tx: Prisma.TransactionClient, id: SessionId): Promise<Session> {
    await tx.$queryRaw`SELECT id FROM sessions WHERE id = ${id}::uuid FOR NO KEY UPDATE`;
    const session = await tx.session.findUnique({ where: { id } });
    if (!session) {
      throw new SessionNotFoundError(id);
    }
    return session;
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
        uploadId: input.uploadId,
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
        partCount: input.partCount,
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
