import { PrismaClient, UploadTarget } from "@prisma/client";
import {
  IUploadTargetRepository,
  UploadTargetId,
  SessionId,
  CreateUploadTargetInput,
  UpdateUploadTargetInput,
  UploadTargetFilter,
} from "./IUploadTargetRepository.js";

/**
 * Prisma-based implementation of IUploadTargetRepository
 * Handles all database operations for upload target management
 */
export class PrismaUploadTargetRepository implements IUploadTargetRepository {
  constructor(private readonly prisma: PrismaClient) {}

  // Basic CRUD operations
  async create(input: CreateUploadTargetInput): Promise<UploadTarget> {
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

  async findById(id: UploadTargetId): Promise<UploadTarget | null> {
    return this.prisma.uploadTarget.findUnique({
      where: { id },
    });
  }

  async update(id: UploadTargetId, input: UpdateUploadTargetInput): Promise<UploadTarget> {
    return this.prisma.uploadTarget.update({
      where: { id },
      data: input,
    });
  }

  async delete(id: UploadTargetId): Promise<void> {
    await this.prisma.uploadTarget.delete({
      where: { id },
    });
  }

  // Query operations
  async findBySessionId(sessionId: SessionId): Promise<UploadTarget[]> {
    return this.prisma.uploadTarget.findMany({
      where: { sessionId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findActiveBySessionId(sessionId: SessionId): Promise<UploadTarget | null> {
    return this.prisma.uploadTarget.findFirst({
      where: {
        sessionId,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findByUploadId(uploadId: string): Promise<UploadTarget | null> {
    return this.prisma.uploadTarget.findFirst({
      where: { uploadId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findByFilter(filter: UploadTargetFilter): Promise<UploadTarget[]> {
    const where: any = {};
    
    if (filter.sessionId) {
      where.sessionId = filter.sessionId;
    }
    
    if (filter.provider) {
      where.provider = filter.provider;
    }
    
    if (filter.expired !== undefined) {
      const now = new Date();
      if (filter.expired) {
        where.expiresAt = { lt: now };
      } else {
        where.expiresAt = { gte: now };
      }
    }

    return this.prisma.uploadTarget.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });
  }

  // Expiration management
  async findExpired(): Promise<UploadTarget[]> {
    return this.prisma.uploadTarget.findMany({
      where: {
        expiresAt: { lt: new Date() },
      },
      orderBy: { expiresAt: 'asc' },
    });
  }

  async deleteExpired(): Promise<number> {
    const result = await this.prisma.uploadTarget.deleteMany({
      where: {
        expiresAt: { lt: new Date() },
      },
    });
    return result.count;
  }

  async isExpired(id: UploadTargetId): Promise<boolean> {
    const uploadTarget = await this.prisma.uploadTarget.findUnique({
      where: { id },
      select: { expiresAt: true },
    });
    
    if (!uploadTarget) {
      return true; // Consider non-existent targets as expired
    }
    
    return uploadTarget.expiresAt < new Date();
  }

  // Utility operations
  async exists(id: UploadTargetId): Promise<boolean> {
    const count = await this.prisma.uploadTarget.count({
      where: { id },
    });
    return count > 0;
  }

  async count(filter?: UploadTargetFilter): Promise<number> {
    if (!filter) {
      return this.prisma.uploadTarget.count();
    }

    const where: any = {};
    
    if (filter.sessionId) {
      where.sessionId = filter.sessionId;
    }
    
    if (filter.provider) {
      where.provider = filter.provider;
    }
    
    if (filter.expired !== undefined) {
      const now = new Date();
      if (filter.expired) {
        where.expiresAt = { lt: now };
      } else {
        where.expiresAt = { gte: now };
      }
    }

    return this.prisma.uploadTarget.count({ where });
  }

  async deleteBySessionId(sessionId: SessionId): Promise<number> {
    const result = await this.prisma.uploadTarget.deleteMany({
      where: { sessionId },
    });
    return result.count;
  }
}