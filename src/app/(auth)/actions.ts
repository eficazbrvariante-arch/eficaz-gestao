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
  loginSchema,
  requestPasswordResetSchema,
  resetPasswordSchema,
  selectUserLoginSchema,
  signupSchema,
  type LoginInput,
  type RequestPasswordResetInput,
  type ResetPasswordInput,
  type SelectUserLoginInput,
  type SignupInput,
} from "@/lib/validations/auth";

const RESET_TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hora

const DEVICE_COOKIE = "device_id";
const DEVICE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365 * 2; // ~2 anos

/**
 * Único ponto que chama `signIn("credentials", ...)` de verdade — usado tanto pelo
 * login clássico (e-mail+senha) quanto pela seleção por nome e pelo cadastro de
 * empresa nova, pra nunca duplicar a verificação de senha/dispositivo em vários
 * lugares (isso vive dentro de `authorize()`, em `src/lib/auth.ts`).
 *
 * O cookie do dispositivo é sempre gravado ANTES de chamar `signIn`, pra sobreviver
 * tanto ao redirect de sucesso quanto a qualquer erro lançado (dispositivo pendente,
 * recusado, senha errada...).
 */
async function performCredentialsLogin({
  email,
  password,
  callbackUrl,
}: {
  email: string;
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
      email,
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
          return { error: "E-mail ou senha inválidos." };
      }
    }
    if (error instanceof AuthError) {
      return { error: "Não foi possível entrar. Tente novamente." };
    }
    throw error;
  }
}

export async function loginAction(input: LoginInput, callbackUrl?: string) {
  const parsed = loginSchema.safeParse(input);
  if (!parsed.success) {
    return { error: "Dados inválidos." };
  }

  return performCredentialsLogin({
    email: parsed.data.email,
    password: parsed.data.password,
    callbackUrl,
  });
}

/** Login por seleção de nome — dispositivo já aprovado, sem digitar e-mail. */
export async function loginWithSelectedUserAction(input: SelectUserLoginInput, callbackUrl?: string) {
  const parsed = selectUserLoginSchema.safeParse(input);
  if (!parsed.success) {
    return { error: "Dados inválidos." };
  }

  const user = await prisma.user.findUnique({
    where: { id: parsed.data.userId },
    select: { email: true },
  });
  // Mensagem genérica igual à de senha errada — não revela se o usuário existe.
  if (!user) return { error: "E-mail ou senha inválidos." };

  return performCredentialsLogin({
    email: user.email,
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

  const [existingTenant, existingUser] = await Promise.all([
    prisma.tenant.findUnique({ where: { subdomain } }),
    prisma.user.findUnique({ where: { email } }),
  ]);

  if (existingTenant) {
    return { error: "Este subdomínio já está em uso. Escolha outro." };
  }
  if (existingUser) {
    return { error: "Já existe uma conta com este e-mail." };
  }

  const passwordHash = await bcrypt.hash(password, 10);

  await prisma.tenant.create({
    data: {
      name: companyName,
      subdomain,
      users: {
        create: {
          name: adminName,
          email,
          passwordHash,
          role: "ADMIN",
        },
      },
    },
  });

  return performCredentialsLogin({ email, password, callbackUrl: "/dashboard" });
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
      to: user.email,
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
