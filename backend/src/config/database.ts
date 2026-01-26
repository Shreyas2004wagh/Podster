import { PrismaClient } from "@prisma/client";
import { env } from "./env.js";

// Global variable to store the Prisma client instance
let prisma: PrismaClient | undefined;

export function createPrismaClient(): PrismaClient {
  if (prisma) {
    return prisma;
  }

  // Build database URL with connection pool parameters
  const databaseUrl = new URL(env.DATABASE_URL);
  databaseUrl.searchParams.set('connection_limit', env.DATABASE_POOL_SIZE.toString());
  databaseUrl.searchParams.set('pool_timeout', Math.floor(env.DATABASE_TIMEOUT / 1000).toString());
  databaseUrl.searchParams.set('connect_timeout', Math.floor(env.DATABASE_TIMEOUT / 1000).toString());

  prisma = new PrismaClient({
    datasources: {
      db: {
        url: databaseUrl.toString(),
      },
    },
    log: [
      {
        emit: "event",
        level: "query",
      },
      {
        emit: "event",
        level: "error",
      },
      {
        emit: "event",
        level: "info",
      },
      {
        emit: "event",
        level: "warn",
      },
    ],
  });

  // Log database queries in development
  if (process.env.NODE_ENV === "development") {
    prisma.$on("query", (e) => {
      console.log("Query: " + e.query);
      console.log("Params: " + e.params);
      console.log("Duration: " + e.duration + "ms");
    });
  }

  // Log database errors
  prisma.$on("error", (e) => {
    console.error("Database error:", e);
  });

  return prisma;
}

export function getPrismaClient(): PrismaClient {
  if (!prisma) {
    throw new Error("Prisma client not initialized. Call createPrismaClient() first.");
  }
  return prisma;
}

export async function disconnectPrisma(): Promise<void> {
  if (prisma) {
    await prisma.$disconnect();
    prisma = undefined;
  }
}

// Connection health check
export async function checkDatabaseConnection(): Promise<boolean> {
  try {
    const client = getPrismaClient();
    await client.$queryRaw`SELECT 1`;
    return true;
  } catch (error) {
    console.error("Database connection check failed:", error);
    return false;
  }
}