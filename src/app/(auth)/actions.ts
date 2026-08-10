"use server";

import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import bcrypt from "bcryptjs";
import { AuthError, CredentialsSignin } from "next-auth";
import { prisma } from "@/lib/prisma";
import { signIn } from "@/lib/auth";
import { generateResetToken, hashToken } from "@/lib/tokens";
import { sendEmail } from "@/lib/email";
import {
  requestPasswordResetSchema,
  resetPasswordSchema,
  selectUserLoginSchema,
  signupSchema,
  tenantLoginEmailSchema,
  type RequestPasswordResetInput,
  type ResetPasswordInput,
  type SelectUserLoginInput,
  type SignupInput,
  type TenantLoginEmailInput,
} from "@/lib/validations/auth";
import type { UserRole } from "@/generated/prisma/enums";

const RESET_TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hora

const DEVICE_COOKIE = "device_id";
const DEVICE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365 * 2; // ~2 anos

/**
 * Único ponto que chama `signIn("credentials", ...)` de verdade — usado pela
 * seleção de colaborador e pelo cadastro de empresa nova, pra nunca duplicar a
 * verificação de senha/dispositivo em vários lugares (isso vive dentro de
 * `authorize()`, em `src/lib/auth.ts`).
 *
 * O cookie do dispositivo é sempre gravado ANTES de chamar `signIn`, pra sobreviver
 * tanto ao redirect de sucesso quanto a qualquer erro lançado (dispositivo pendente,
 * recusado, senha errada...).
 */
async function performCredentialsLogin({
  userId,
  password,
  callbackUrl,
}: {
  userId: string;
  password: string;
  callbackUrl?: string;
}) {
  const cookieStore = await cookies();
  const deviceId = cookieStore.get(DEVICE_COOKIE)?.value ?? crypto.randomUUID();
  cookieStore.set(DEVICE_COOKIE, deviceId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: DEVICE_COOKIE_MAX_AGE,
    path: "/",
  });

  try {
    await signIn("credentials", {
      userId,
      password,
      deviceId,
      redirectTo: callbackUrl && callbackUrl.startsWith("/") ? callbackUrl : "/dashboard",
    });
  } catch (error) {
    if (error instanceof CredentialsSignin) {
      switch (error.code) {
        case "device_pending":
          return {
            error:
              "Dispositivo aguardando aprovação do administrador. Assim que for aprovado, você poderá entrar normalmente.",
          };
        case "device_rejected":
          return { error: "Este dispositivo foi recusado. Fale com o administrador." };
        case "device_conflict":
          return {
            error: "Este navegador já está vinculado a outra empresa. Use outro navegador ou uma aba anônima.",
          };
        default:
          return { error: "Usuário ou senha inválidos." };
      }
    }
    if (error instanceof AuthError) {
      return { error: "Não foi possível entrar. Tente novamente." };
    }
    throw error;
  }
}

export type TenantLoginResolution = {
  tenantName: string;
  tenantEmail: string;
  users: { id: string; name: string; role: UserRole }[];
};

/**
 * Passo 1 do login num dispositivo novo: resolve a empresa pelo "e-mail de
 * acesso" (`Tenant.email`) e devolve a lista de colaboradores ativos dela —
 * mesma listagem que `login/page.tsx` já monta a partir de `Device.tenantId`
 * quando o dispositivo já está aprovado. Nenhuma senha é conferida aqui.
 */
export async function resolveTenantLoginAction(
  input: TenantLoginEmailInput
): Promise<{ error: string } | TenantLoginResolution> {
  const parsed = tenantLoginEmailSchema.safeParse(input);
  if (!parsed.success) {
    return { error: "Informe um e-mail válido." };
  }

  const tenant = await prisma.tenant.findUnique({
    where: { email: parsed.data.email },
    select: { id: true, name: true, email: true },
  });
  if (!tenant) {
    return { error: "E-mail não encontrado. Confira e tente novamente." };
  }

  const users = await prisma.user.findMany({
    where: { tenantId: tenant.id, active: true },
    select: { id: true, name: true, role: true },
    orderBy: { name: "asc" },
  });

  return { tenantName: tenant.name, tenantEmail: tenant.email, users };
}

/** Login por seleção de nome — empresa já identificada (e-mail do PDV ou dispositivo já aprovado). */
export async function loginWithSelectedUserAction(input: SelectUserLoginInput, callbackUrl?: string) {
  const parsed = selectUserLoginSchema.safeParse(input);
  if (!parsed.success) {
    return { error: "Dados inválidos." };
  }

  return performCredentialsLogin({
    userId: parsed.data.userId,
    password: parsed.data.password,
    callbackUrl,
  });
}

export async function signupAction(input: SignupInput) {
  const parsed = signupSchema.safeParse(input);
  if (!parsed.success) {
    return { error: "Dados inválidos." };
  }
  const { companyName, subdomain, adminName, email, password } = parsed.data;

  const [existingTenant, existingTenantEmail] = await Promise.all([
    prisma.tenant.findUnique({ where: { subdomain } }),
    prisma.tenant.findUnique({ where: { email } }),
  ]);

  if (existingTenant) {
    return { error: "Este subdomínio já está em uso. Escolha outro." };
  }
  if (existingTenantEmail) {
    return { error: "Já existe uma empresa cadastrada com este e-mail." };
  }

  const passwordHash = await bcrypt.hash(password, 10);

  const tenant = await prisma.tenant.create({
    data: {
      name: companyName,
      subdomain,
      email,
      users: {
        create: {
          name: adminName,
          passwordHash,
          role: "ADMIN",
        },
      },
    },
    include: { users: { select: { id: true } } },
  });

  return performCredentialsLogin({
    userId: tenant.users[0].id,
    password,
    callbackUrl: "/dashboard",
  });
}

export async function requestPasswordResetAction(input: RequestPasswordResetInput) {
  const parsed = requestPasswordResetSchema.safeParse(input);
  if (!parsed.success) {
    return { error: "Informe um e-mail válido." };
  }

  const user = await prisma.user.findUnique({ where: { email: parsed.data.email } });

  if (user) {
    const { rawToken, hashedToken } = generateResetToken();
    await prisma.user.update({
      where: { id: user.id },
      data: {
        resetToken: hashedToken,
        resetTokenExpiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MS),
      },
    });

    const resetUrl = `${process.env.NEXTAUTH_URL ?? "http://localhost:3000"}/redefinir-senha/${rawToken}`;

    await sendEmail({
      // `user` foi encontrado buscando por este mesmo e-mail — é sempre igual
      // a `user.email`, só que já garantido não-nulo pelo tipo do input.
      to: parsed.data.email,
      subject: "Redefinição de senha — Eficaz Gestão",
      html: `
        <p>Olá, ${user.name}.</p>
        <p>Recebemos um pedido para redefinir a senha da sua conta no Eficaz Gestão.</p>
        <p><a href="${resetUrl}">Clique aqui para escolher uma nova senha</a>. O link expira em 1 hora.</p>
        <p>Se você não pediu essa redefinição, pode ignorar este e-mail.</p>
      `,
    });
  }

  // Mensagem genérica sempre, para não revelar se o e-mail existe na base.
  return {
    success:
      "Se este e-mail estiver cadastrado, você receberá instruções para redefinir sua senha em instantes.",
  };
}

export async function resetPasswordAction(input: ResetPasswordInput) {
  const parsed = resetPasswordSchema.safeParse(input);
  if (!parsed.success) {
    return { error: "Dados inválidos." };
  }
  const { token, password } = parsed.data;
  const hashedToken = hashToken(token);

  const user = await prisma.user.findUnique({ where: { resetToken: hashedToken } });

  if (!user || !user.resetTokenExpiresAt || user.resetTokenExpiresAt < new Date()) {
    return { error: "Link de redefinição inválido ou expirado. Solicite um novo." };
  }

  const passwordHash = await bcrypt.hash(password, 10);
  await prisma.user.update({
    where: { id: user.id },
    data: {
      passwordHash,
      resetToken: null,
      resetTokenExpiresAt: null,
    },
  });

  redirect("/login");
}
