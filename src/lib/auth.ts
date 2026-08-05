import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { resolveDeviceForLogin } from "@/modules/devices/device-service";
import type { UserRole } from "@/generated/prisma/enums";

export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: "jwt" },
  pages: {
    signIn: "/login",
  },
  providers: [
    Credentials({
      credentials: {
        email: { label: "E-mail", type: "email" },
        password: { label: "Senha", type: "password" },
        deviceId: { label: "Dispositivo", type: "text" },
      },
      authorize: async (credentials, request) => {
        const email = credentials?.email as string | undefined;
        const password = credentials?.password as string | undefined;
        const deviceId = credentials?.deviceId as string | undefined;
        if (!email || !password || !deviceId) return null;

        const user = await prisma.user.findUnique({
          where: { email: email.toLowerCase().trim() },
        });
        if (!user || !user.active) return null;

        const passwordMatches = await bcrypt.compare(password, user.passwordHash);
        if (!passwordMatches) return null;

        // Só chega aqui com a senha certa — checar dispositivo antes deixaria
        // qualquer um poluir a fila de pendentes sem saber senha nenhuma.
        const ipAddress = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
        const userAgent = request.headers.get("user-agent");
        await resolveDeviceForLogin({
          tenantId: user.tenantId,
          deviceId,
          ipAddress,
          userAgent,
          requestedByUserId: user.id,
        });

        await prisma.user.update({
          where: { id: user.id },
          data: { lastLoginAt: new Date() },
        });

        return {
          id: user.id,
          name: user.name,
          email: user.email,
          tenantId: user.tenantId,
          role: user.role,
          deviceId,
        };
      },
    }),
  ],
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.id = user.id as string;
        token.tenantId = user.tenantId;
        token.role = user.role;
        token.deviceId = user.deviceId;
      }
      return token;
    },
    session({ session, token }) {
      session.user.id = token.id;
      session.user.tenantId = token.tenantId;
      session.user.role = token.role as UserRole;
      session.user.deviceId = token.deviceId;
      return session;
    },
  },
});
