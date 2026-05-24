import { PrismaClient } from "@prisma/client";

// Prevent multiple instances of Prisma Client in development/serverless hot-reloads
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["query", "info", "warn", "error"] : ["error"], // Minimize production logs to keep serverless execution logs clean and fast
  });

// Save client instance to global scope during development to prevent connection leaks
if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = db;
}
