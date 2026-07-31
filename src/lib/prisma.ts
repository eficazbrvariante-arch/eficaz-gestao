import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

declare global {
  var __prismaClient: PrismaClient | undefined;
  var __prismaPool: Pool | undefined;
}

function createPrismaClient() {
  const pool =
    globalThis.__prismaPool ??
    new Pool({ connectionString: process.env.DATABASE_URL });

  const adapter = new PrismaPg(pool);
  const client = new PrismaClient({ adapter });

  if (process.env.NODE_ENV !== "production") {
    globalThis.__prismaPool = pool;
    globalThis.__prismaClient = client;
  }

  return client;
}

export const prisma = globalThis.__prismaClient ?? createPrismaClient();
