import type { DefaultSession } from "next-auth";
import type { UserRole } from "@/generated/prisma/enums";
import "next-auth";
import "next-auth/jwt";

declare module "next-auth" {
  interface User {
    tenantId: string;
    role: UserRole;
    deviceId: string;
  }

  interface Session {
    user: {
      id: string;
      tenantId: string;
      role: UserRole;
      deviceId: string;
    } & DefaultSession["user"];
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    tenantId: string;
    role: UserRole;
    deviceId: string;
  }
}
