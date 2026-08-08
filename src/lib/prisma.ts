import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

declare global {
  var __prismaClient: PrismaClient | undefined;
  var __prismaPool: Pool | undefined;
}

const DEPRECATED_SSL_MODES = new Set(["prefer", "require", "verify-ca"]);

// sslmode=require (comum em provedores como Neon) hoje já se comporta como
// verify-full, mas o driver `pg` emite um warning de depreciação a cada cold
// start porque isso muda no pg v9. Fixamos o modo explicitamente para manter
// o comportamento atual sem o ruído nos logs.
function withExplicitSslMode(connectionString: string | undefined) {
  if (!connectionString) return connectionString;

  const url = new URL(connectionString);
  if (DEPRECATED_SSL_MODES.has(url.searchParams.get("sslmode") ?? "")) {
    url.searchParams.set("sslmode", "verify-full");
  }
  return url.toString();
}

function createPrismaClient() {
  const pool =
    globalThis.__prismaPool ??
    new Pool({
      connectionString: withExplicitSslMode(process.env.DATABASE_URL),
    });

  const adapter = new PrismaPg(pool);
  const client = new PrismaClient({ adapter });

  if (process.env.NODE_ENV !== "production") {
    globalThis.__prismaPool = pool;
    globalThis.__prismaClient = client;
  }

  return client;
}

export const prisma = globalThis.__prismaClient ?? createPrismaClient();
