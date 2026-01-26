import { PrismaClient, Track } from "@prisma/client";
import {
  ITrackRepository,
  TrackId,
  SessionId,
  UserId,
  CreateTrackInput,
  UpdateTrackInput,
  TrackFilter,
} from "./ITrackRepository.js";

/**
 * Prisma-based implementation of ITrackRepository
 * Handles all database operations for track management
 */
export class PrismaTrackRepository implements ITrackRepository {
  constructor(private readonly prisma: PrismaClient) {}

  // Basic CRUD operations
  async create(input: CreateTrackInput): Promise<Track> {
    return this.prisma.track.create({
      data: {
        sessionId: input.sessionId,
        userId: input.userId,
        kind: input.kind,
        objectKey: input.objectKey,
      },
    });
  }

  async findById(id: TrackId): Promise<Track | null> {
    return this.prisma.track.findUnique({
      where: { id },
    });
  }

  async update(id: TrackId, input: UpdateTrackInput): Promise<Track> {
    return this.prisma.track.update({
      where: { id },
      data: input,
    });
  }

  async delete(id: TrackId): Promise<void> {
    await this.prisma.track.delete({
      where: { id },
    });
  }

  // Query operations
  async findBySessionId(sessionId: SessionId): Promise<Track[]> {
    return this.prisma.track.findMany({
      where: { sessionId },
      orderBy: { createdAt: 'asc' },
    });
  }

  async findByUserId(userId: UserId): Promise<Track[]> {
    return this.prisma.track.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findByFilter(filter: TrackFilter): Promise<Track[]> {
    const where: any = {};
    
    if (filter.sessionId) {
      where.sessionId = filter.sessionId;
    }
    
    if (filter.userId) {
      where.userId = filter.userId;
    }
    
    if (filter.kind) {
      where.kind = filter.kind;
    }
    
    if (filter.completed !== undefined) {
      if (filter.completed) {
        where.completedAt = { not: null };
      } else {
        where.completedAt = null;
      }
    }

    return this.prisma.track.findMany({
      where,
      orderBy: { createdAt: 'asc' },
    });
  }

  // Track completion operations
  async markCompleted(id: TrackId, parts: any): Promise<Track> {
    return this.prisma.track.update({
      where: { id },
      data: {
        completedAt: new Date(),
        parts,
      },
    });
  }

  async findCompletedTracks(sessionId: SessionId): Promise<Track[]> {
    return this.prisma.track.findMany({
      where: {
        sessionId,
        completedAt: { not: null },
      },
      orderBy: { completedAt: 'asc' },
    });
  }

  async findIncompleteTracks(sessionId: SessionId): Promise<Track[]> {
    return this.prisma.track.findMany({
      where: {
        sessionId,
        completedAt: null,
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  // Utility operations
  async exists(id: TrackId): Promise<boolean> {
    const count = await this.prisma.track.count({
      where: { id },
    });
    return count > 0;
  }

  async count(filter?: TrackFilter): Promise<number> {
    if (!filter) {
      return this.prisma.track.count();
    }

    const where: any = {};
    
    if (filter.sessionId) {
      where.sessionId = filter.sessionId;
    }
    
    if (filter.userId) {
      where.userId = filter.userId;
    }
    
    if (filter.kind) {
      where.kind = filter.kind;
    }
    
    if (filter.completed !== undefined) {
      if (filter.completed) {
        where.completedAt = { not: null };
      } else {
        where.completedAt = null;
      }
    }

    return this.prisma.track.count({ where });
  }

  async deleteBySessionId(sessionId: SessionId): Promise<number> {
    const result = await this.prisma.track.deleteMany({
      where: { sessionId },
    });
    return result.count;
  }
}